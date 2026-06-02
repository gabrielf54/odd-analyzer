# Fase 1b — valor (de-vig + EV) + IA analista + front — Design

> Data: 2026-06-02 · Status: aprovado para implementação
> Continuação da Fase 1a (modelo + calibração). Fecha o loop de **valor** (edge/EV sobre odds de-vig),
> adiciona a **IA analista** (via OpenRouter) e o **front Streamlit mínimo**, e liga em **dados reais**
> (The Odds API + crosswalk de jogador). Referência de arquitetura: design v1 (`2026-06-02-odd-analyzer-design.md`) §5/§6/§7/§8.

---

## 0. Objetivo e decisões travadas

Construir, em **modo paper** (sem dinheiro real), a camada que prova se o modelo **bate o mercado**:
`edge = prob_modelo − prob_devig`; `EV = prob_modelo × odd − 1`. Filtra por edge/EV, **nunca** por prob alta.

**Decisões desta fase (confirmadas com o usuário):**

| Decisão | Escolha | Por quê |
|---|---|---|
| Escopo | Pipeline completo ponta-a-ponta (núcleo + odds reais + crosswalk + join) | Usuário quer rodar em dado real, não só sintético. |
| Ordem de build | Bottom-up: matemática → filtro → ledger → IA → odds/crosswalk/join → front | De-risca o que precisa estar correto (EV/edge) antes do cosmético; mais testável. |
| Persistência | **Supabase Free** (Postgres) já nesta fase | Usuário quer; arquitetura final desde já; creds confirmadas. |
| Provedor de IA | **OpenRouter** (`OPENROUTER_API_KEY`, modelo configurável) | Pedido do usuário; 1 API p/ vários modelos; troca sem refatorar. |
| Fuzzy match | `difflib` (stdlib), **não** `rapidfuzz` | Evita risco de wheel no Python 3.14 (histórico da Fase 0). |
| Validação primeiro | Build/testes em candidatos sintéticos; liga no dado real depois (~10/jun) | Mesma filosofia "validar de graça" da Fase 1a. |

**Princípio inegociável (do design v1 §1/§7):** a matemática (prob, de-vig, edge, EV) é **sempre** do código.
A IA é analista que lê um dossiê pronto e **nunca inventa número/fato**.

---

## 1. Estrutura de módulos

Cada unidade tem responsabilidade única, interface clara e é testável isolada.

```
src/odd_analyzer/
  value/
    devig.py        # de-vig 2-way: multiplicativo + power method
    ev.py           # edge e EV
  candidates/
    builder.py      # monta o dossiê de 1 candidato (schema §7 do design v1)
    filtro.py       # corta por edge/EV/XI/amostra; ordena por EV
  ai/
    openrouter.py   # transporte HTTP p/ OpenRouter (lê OPENROUTER_API_KEY)
    analista.py     # prompt §7 + chamada + validação de schema (fail-closed)
    schema.py       # JSON Schema da saída da IA + validador
  odds/
    the_odds_api.py # fetch de eventos + props SOT; parser
  crosswalk/
    match.py        # nome da odd ↔ ID API-Football (difflib, fail-closed)
  store/
    repo.py         # interface Repo + SupabaseRepo (analises, paper_ledger, crosswalk)
    schema.sql      # DDL versionado das tabelas
  pipeline.py       # orquestra 1 jogo ponta-a-ponta
app/
  streamlit_app.py  # front mínimo (página única)
```

Módulos existentes reaproveitados: `model/sot_model.py` (μ, NegBin, `prob_over_line`), `model/shrinkage.py`,
`model/adjustments.py`, `stats/apifootball.py`, `cache.py`, `odds_math.py` (`american_to_decimal`), `config.py`.

---

## 2. Matemática de valor (`value/`)

### `devig.py`
- `devig_two_way(odd_over: float, odd_under: float) -> tuple[float, float]` — recebe odds **decimais** dos dois lados (over/under) e devolve as probabilidades **justas** (sem margem) de cada lado.
  - **Multiplicativo** (base): `p_i = (1/odd_i) / Σ(1/odd)`.
  - **Power method** (checagem): achar `k` tal que `(1/odd_over)^k + (1/odd_under)^k = 1` (busca numérica em stdlib `math`/bisseção); devolve as probs resultantes.
  - Política: a função expõe ambos; o pipeline usa o **pior caso** para o lado apostado (menor prob justa do lado over) → EV conservador.
- Guardas: odds ≤ 1.0 → erro de valor; soma de implícitas ≤ 1 (sem vig) → multiplicativo degenera para normalização.

### `ev.py`
- `edge_ev(prob_modelo: float, prob_devig: float, odd_decimal: float) -> dict` → `{"edge": prob_modelo - prob_devig, "ev": prob_modelo * odd_decimal - 1}`.

Ambos puros, sem efeito colateral. Testes com valores conhecidos (over 1.91 / under 1.91 → 0.50/0.50; EV de odd 2.10 com prob 0.55 → +0.155).

---

## 3. Candidatos (`candidates/`)

### `builder.py`
- `build_candidate(jogador, linha, odd_over, odd_under, prob_modelo, mu, minutos_esperados, xi_confirmado, amostra_jogos, sot_concedido_adversario, incerteza) -> dict` — calcula de-vig + edge/EV e monta o dossiê no formato do design v1 §7 (campos: `jogador, linha, odd, prob_modelo, prob_devig, edge, ev, lambda, minutos_esperados, xi_confirmado, amostra_jogos, sot_concedido_adversario, incerteza`).

### `filtro.py`
- `filter_candidates(candidatos: list[dict], cuts: Cortes) -> list[dict]` — mantém só `edge ≥ EDGE_MIN E ev ≥ EV_MIN E xi_confirmado E amostra_jogos ≥ AMOSTRA_MIN`; ordena por `ev` desc.
- `Cortes` (constantes default, tunáveis): `EDGE_MIN=0.04`, `EV_MIN=0.05`, `AMOSTRA_MIN=10`. Defaults conservadores; ajustáveis sem mudar código de fluxo.
- Lista vazia é resultado válido e esperado ("nenhuma oportunidade clara").

---

## 4. IA analista — OpenRouter (`ai/`)

### `openrouter.py`
- `chat(messages: list[dict], model: str | None = None, temperature: float = 0.0) -> str` — POST `https://openrouter.ai/api/v1/chat/completions`, header `Authorization: Bearer {OPENROUTER_API_KEY}`. Modelo = arg ou `OPENROUTER_MODEL` (default `anthropic/claude-sonnet-4.6`; trocável por env). `temperature=0` p/ determinismo. Sem efeito colateral além da chamada de rede.

### `analista.py`
- `analisar(candidatos: list[dict], contexto: dict) -> dict` — monta o prompt núcleo (design v1 §7): analista conservador; **usar só os números dados**; **nunca** inventar número/stat/lesão; só `"APOSTAR"` se `edge>0 E ev≥corte E xi_confirmado E amostra≥piso`; comparar e indicar a melhor; na dúvida, não recomendar; responder **apenas** JSON. Chama `openrouter.chat`, faz parse + valida por schema.
- Inválido (JSON quebrado, campo fora do schema, número não presente no input) → **1 retry** → senão **fail-closed** (retorna `{"melhor_aposta": null, "alertas": ["IA não produziu saída válida"]}`).

### `schema.py`
- JSON Schema da saída (design v1 §7): `{melhor_aposta:{jogador,linha,veredito,confianca,motivo}|null, outras:[], alertas:[]}` + `validate(obj) -> bool`.

Testes: HTTP mockado (offline) — saída válida; JSON quebrado → retry; saída com campo/jogador inexistente no input → rejeitada.

---

## 5. Odds + crosswalk + join

### `odds/the_odds_api.py`
- `fetch_events(sport_key: str) -> list[dict]` — `/v4/sports/{sport}/events` (0 créditos). Lista de jogos p/ o front.
- `fetch_event_odds(event_id, markets="player_shots_on_target", regions="us") -> dict` — `/v4/.../events/{id}/odds`.
- `parse_sot_props(event_odds) -> list[dict]` — agrupa por (jogador, linha) → `{player_name, line, book, odd_over, odd_under}` (odds decimais via `odds_math`).
- Lê `THE_ODDS_API_KEY`. Usa `cache.cached_get` (não cachear erro/vazio).

### `crosswalk/match.py`
- `normalize(nome) -> str` — NFKD→ASCII, minúsculas, remove pontuação.
- `match_player(odd_name, elenco: list[dict], overrides: dict, threshold=0.90) -> dict | None` — `difflib.SequenceMatcher` (**stdlib**) entre nome normalizado da odd e nomes do elenco (API-Football) do jogo; aceita só acima do threshold; consulta `overrides` (tabela manual) primeiro. **Fail-closed:** sem match confiável → `None` + log de auditoria (nunca chuta jogador). Persistência de matches confirmados em `jogadores_crosswalk`.

### Join (em `pipeline.py`)
Pra cada prop casada a um jogador: pega μ do modelo (taxa-base shrinkada + minutos + adversário + mando) → `prob_over_line(mu, linha, r)` → `build_candidate` (de-vig + edge/EV) → filtro.

---

## 6. Persistência Supabase + CLV (`store/`)

### `repo.py`
- Interface `Repo` (abstrata): `save_analise(event_id, payload)`, `get_analise(event_id) -> dict|None`, `save_ledger(rows: list[dict])`, `update_fechamento(event_id, jogador, linha, odd_fechamento, resultado)`, `upsert_crosswalk(...)`, `get_crosswalk(...)`.
- `SupabaseRepo(Repo)` — usa `supabase` client (`SUPABASE_URL`/`SUPABASE_SERVICE_KEY`).
- `InMemoryRepo(Repo)` — fake p/ testes offline (mesma interface).

### `schema.sql` (tabelas do design v1 §8)
- `analises` — `event_id, jogo, data, ttl, candidatos jsonb, llm_resultado jsonb`. Cache de resultado por jogo (serve do cache dentro do TTL).
- `paper_ledger` — `event_id, jogador, linha, odd_flag, prob_modelo, prob_devig, edge, ev, odd_fechamento, prob_devig_fechamento, resultado, clv, criado_em`. **Coração da validação.**
- `jogadores_crosswalk` — `id_canonico, nome_normalizado, fontes_ids jsonb, confianca, verificado_manual bool`.

### CLV
- Ao fechar a linha: `clv = odd_flag / odd_fechamento − 1` (positivo = pegou preço melhor que o fechamento). Guarda também `prob_devig_fechamento` p/ calibração contra o fechamento.
- Relatório de validação (reaproveita `backtest/calibration.py`): Brier + reliability sobre `paper_ledger` + CLV médio.

**Operacional:** Supabase Free pausa após 7 dias sem query → mitigar com cron diário de ping (fora do código). Service key fica no `.env` (gitignored), nunca commitada.

---

## 7. Front Streamlit (`app/streamlit_app.py`)

Página única, sem capricho visual (design v1 §2). Layout:

```
┌─ odd-analyzer — Copa 2026 ──────────────────────────┐
│ Jogos (The Odds API)                  [↻ atualizar]  │
│ ▸ Brasil x Croácia     17/jun 13:00                  │
├──────────────────────────────────────────────────────┤
│ Jogo: Brasil x Croácia      [Analisar jogo]          │
│ Candidatos (edge>corte, EV>corte, XI ✓):             │
│  Jogador     Linha   Odd  pMod pDvg edge   EV        │
│  Vinicius Jr ≥1 SOT 1.72 .68  .62 +.06  +.17         │
│ [Buscar oportunidades (IA)]                          │
│  ┌ IA ───────────────────────────────────────────┐  │
│  │ MELHOR: Vinicius Jr ≥1 SOT — APOSTAR (alta)    │  │
│  │ motivo: edge +6pp, EV +17%, XI conf, 24j, ...  │  │
│  └────────────────────────────────────────────────┘  │
│ validação: 12 flags · CLV médio +1.8%                │
└──────────────────────────────────────────────────────┘
```

- Lista de jogos: `the_odds_api.fetch_events` (cache de memória curto).
- "Analisar jogo": roda `pipeline` p/ aquele jogo → tabela de candidatos.
- "Buscar oportunidades (IA)": chama `analista.analisar` → veredito; grava no `paper_ledger`; cacheia em `analises`.
- Rodapé: resumo do `paper_ledger` (nº flags, CLV médio).
- **Estado pré-odds (antes ~10/jun):** lista de jogos aparece; "Analisar" mostra μ/projeções e marca *"odds de SOT ainda não postadas"* no lugar dos candidatos de valor.

---

## 8. Testes, dependências e ir ao vivo

**TDD por unidade (fixtures sintéticas, offline):**
- `value/devig`, `value/ev` — valores conhecidos.
- `candidates/filtro` — corta/ordena correto; lista vazia.
- `crosswalk/match` — nomes com acento (NFKD), fail-closed sem match, override manual.
- `ai/analista` — HTTP mockado: saída válida; JSON quebrado→retry; campo/jogador inventado→rejeitado.
- `store/repo` — `InMemoryRepo`; cálculo de CLV.
- `pipeline` — ponta-a-ponta em jogo sintético (odds fixas + elenco fixo) → candidatos esperados.

**Dependências:** adicionar `streamlit`. **Não** adicionar `rapidfuzz` (usa `difflib`). `supabase`/`requests`/`python-dotenv` já presentes.

**Ir ao vivo (~10/jun):** rodar contra The Odds API. Ressalvas honestas:
- (a) SOT da Copa pode vir vazio no free → reverificar; props postam perto do kickoff.
- (b) SOT de **ligas de clube** (onde o free tem props) precisa de stats de temporada atual = **API-Football Pro $19**.
- (c) Risco de mismatch de settlement (SOT API-Football ≠ Opta-FIFA da casa) → calibrar antes de tratar edge como real.

---

## 9. Riscos e mitigações (específicos da 1b)

| Risco | Sev. | Mitigação |
|---|---|---|
| Crosswalk casa jogador errado (join silencioso) | alto | `difflib` + threshold alto + override manual; **fail-closed** + log de auditoria. |
| LLM inventa número/fato | médio | IA só lê dossiê; saída validada por schema; retry→fail-closed. |
| Odds de SOT da Copa ausentes no free | médio | Front degrada p/ projeções; reverificar ~10/jun; club leagues como alternativa. |
| Supabase Free pausa (7 dias) | baixo | Cron de ping; recuperável (~30s). |
| Mismatch de settlement (def. de SOT) | médio | Comparar definições; CLV e calibração antes de Fase 2. |
| Edge ilusório por amostra pequena | médio | Filtro por amostra mínima; incerteza suprime sinal. |

---

## 10. Portão de saída da Fase 1b
`paper_ledger` com **calibração boa E CLV positivo consistente** em N flags reais → libera Fase 2 (SGO Pro + bet365, aposta real). Sem isso, não há dinheiro real.
