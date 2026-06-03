# Sub-projeto #3 — BSD como fonte oficial de stats + generalização multi-mercado (design)

**Goal:** ligar o BSD/Bzzoiro como fonte **oficial** de estatísticas no pipeline (atrás de uma interface trocável, com API-Football como fallback) e generalizar o motor de SOT para os **6 mercados MVP** — jogador: SOT, finalizações, desarmes; partida: gols, vitória, escanteios — produzindo o veredito de EV em código e deixando a IA só explicar.

**Architecture (uma frase):** o núcleo genérico (model/value/ai) não muda; toda a mudança vive em **2 seams de fonte de dado** (`StatsProvider`, `OddsProvider`) + **1 objeto de config** (`MarketSpec`), de modo que "6 mercados" vira dado, não código.

**Tech stack:** Python 3.14 (só `requests`), src-layout, pytest. BSD via `Authorization: Token` (env `BZZOIRO_API_KEY`). API-Football fallback (env `APIFOOTBALL_KEY`). Odds de partida do próprio BSD (Pinnacle/bet365/betano). Persistência Supabase (+ InMemoryRepo nos testes).

> Referências: doutrina do produto em [CLAUDE.md](../../../CLAUDE.md); dados/endpoints validados ao vivo em [docs/dados-necessarios-analise.md](../../dados-necessarios-analise.md); ficha BSD em [docs/apis/bsd-bzzoiro.md](../../apis/bsd-bzzoiro.md).

---

## 1. Estado atual (do mapa do código)

A matemática **já é genérica** — `prob_at_least`, `prob_over_line`, `shrink_rate`, `opponent_multiplier`, `home_away_multiplier`, `devig`, `edge_ev` não têm "SOT" por dentro. O acoplamento a SOT vive **só na borda**:

- `app/streamlit_app.py`: `SPORT='soccer_fifa_world_cup'`, `_taxa_fn` placeholder (`mu=0`), `elenco=[]` → produção entrega **zero**.
- `odds/the_odds_api.py`: `SOT_MARKET='player_shots_on_target'`, `parse_sot_props`, `regions='us'`.
- `stats/apifootball.py`: `parse_player_sot` (lê só `shots.on`) — **única** fonte de stats viva hoje.
- `model/params.py`: `PRIOR_RATE=0.4`, `LINHAS=[0.5,1.5]`, `NB_DISPERSION=3.0` — calibrados só p/ SOT EPL 2023.
- `pipeline.py:25`: chama `parse_sot_props(event)` direto (não injetado).
- `candidates/builder.py`: campo `sot_concedido_adversario`.
- `backtest/run_backtest.py`: `collect_data` cravado em API-Football + `shots.on`.
- `cache.py`: **sem TTL** (eterno).
- `store/schema.sql`: **sem `market_type`** → `paper_ledger` unique `(event_id, jogador, linha)` **colide** entre mercados (corrupção silenciosa).

Seams limpos já existentes: `taxa_fn` (callable injetado), `analista_fn` (injetado), `Repo` (ABC), `score_records` (função pura), `Cortes` (dataclass injetável), `fetch_event_odds(markets=...)` (param já existe).

## 2. Decisões travadas (brainstorming 2026-06-03)

1. **Abordagem A** — `MarketSpec` registry + protocolos de Provider. (Rejeitadas: B módulo-por-mercado = duplica matemática genérica; C stringly-typed = perde o contrato de fonte trocável.)
2. **Mercados de jogador:** modelo-only por padrão + **entrada manual de odd** → EV. **Slot `PropOddsProvider` explícito e documentado** para um feed de odd de prop no futuro.
3. **Fonte oficial:** BSD primário, **API-Football fallback** (tenta BSD → cai pro fallback se None/erro).
4. **Escopo:** TODOS os 6 mercados. Ordem de execução interna em fases (Seção 7).
5. **Doutrina:** EV decide (código/`filtro`), IA explica e só escolhe entre os já-filtrados; `mu` calculado em código; matchup = multiplicador de concessão no mesmo eixo.

## 3. Arquitetura (Abordagem A)

```
 evento → pipeline.analisar_jogo(event, market, stats, odds, repo, analista)
            ├─ model/ (prob_over_line, shrink, multiplicadores) + model/match_model (1X2/totais)
            ├─ value/ (devig, ev)                — INALTERADOS (já genéricos)
            └─ ai/ (analista, schema)            — INALTERADO (IA não calcula)
        StatsProvider (BSD primário · API-Football fallback)
        OddsProvider  (BSDMatchOdds · ManualOdds · NullOdds · [PropOdds slot])
        bsd/client.py (Token) + cache.py (TTL + namespace por fonte)
```

**Princípio de isolamento:** cada provider é testável sozinho (mock do `bsd/client`); `MarketSpec` é dado puro; `match_model` é função pura; o pipeline não sabe de qual fonte veio nada.

## 4. Componentes

### 4.1 `MarketSpec` + registry — `src/odd_analyzer/model/markets.py` (novo)
```python
@dataclass(frozen=True)
class MarketSpec:
    key: str                 # "escanteios" | "sot" | "finalizacoes" | "desarmes" | "gols" | "vitoria"
    nivel: str               # "jogador" | "partida"
    kind: str                # "contagem" | "partida_totais" | "partida_1x2"
    stat_field: str          # campo BSD: "corners" | "shots_on_target" | "total_shots" | "total_tackle" | "goals"
    prior_rate: float
    prior_strength: float
    nb_dispersion: float
    lines: list[float]
    eixo_concessao: str      # descrição do eixo de concessão do adversário (p/ matchup + prompt)
    label: str
MARKETS: dict[str, MarketSpec]   # os 6
```
- `contagem` → `prob_over_line`. `partida_totais`/`partida_1x2` → `match_model`.
- Params por mercado (cada um carrega os seus) — `params.py` vira default só de SOT (compat).

### 4.2 BSD client — `src/odd_analyzer/bsd/client.py` (novo)
HTTP fino do BSD (base `https://sports.bzzoiro.com/api/v2`, header `Authorization: Token`), cada chamada passa por `cached_get`. Métodos:
`events(**filtros)`, `get_event(id)`, `event_player_stats(event_id)`, `player_stats(player_id, **filtros)`, `lineups(event_id)`, `team_stats(event_id)`, `event_odds(event_id)`, `odds_by_book(event_id, market, book)`, `national_pool(team_id)`, `squad(team_id)`, `leagues()`.

### 4.3 `StatsProvider` — `src/odd_analyzer/providers/stats.py` (novo)
```python
class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]: ...        # [{id, name, team_id, posicao}]
    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None: ...
        # retorna {mu, minutos_esperados, xi_confirmado, amostra_jogos, concedido_adversario, incerteza}
    def team_rates(self, team_id, contexto: dict) -> dict | None: ...   # p/ match_model (ataque/defesa)
```
- `BSDStatsProvider`: usa `bsd/client`. `entity_taxa` puxa retrospecto de clube (janelas 3/5/10 casa/fora) via `windowed_rate` → `shrink_rate` → `assemble_mu(×matchup ×casa/fora)`. Copa: `elenco` via `national_pool(team_id)`→`current_team_id`.
- `ApiFootballStatsProvider`: envolve o `stats/apifootball.py` existente (mesma saída).
- `FallbackStatsProvider`: tenta BSD → fallback API-Football se None/erro; **loga** a fonte servida e descartes.

### 4.4 `OddsProvider` — `src/odd_analyzer/providers/odds.py` (novo)
```python
class OddsProvider(Protocol):
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]: ...
        # contagem: [{entidade, linha, odd_over, odd_under, book}]
        # partida_1x2: [{lado: "home|draw|away", odd}]
```
- `BSDMatchOdds`: `/events/{id}/odds/` + por-casa; usa Pinnacle/consensus p/ de-vig.
- `ManualOdds`: construído com linhas que o usuário cola.
- `NullOdds`: retorna `[]` → modelo-only (jogador sem odd).
- `PropOddsProvider`: **stub** documentado (`raise NotImplementedError`) — slot p/ feed de prop futuro.

### 4.5 `model/assemble.py` (novo)
```python
def windowed_rate(games: list[dict], stat_field: str, windows=(3,5,10), mando: str | None=None) -> dict
def assemble_mu(rate_per90: float, minutos_esperados: float, opp_mult: float, ha_mult: float) -> float
```
Reusa `shrink_rate`, `expected_lambda`, `opponent_multiplier`, `home_away_multiplier`. Sem matemática nova — só compõe.

### 4.6 `model/match_model.py` (novo) — vitória + gols
```python
def team_lambdas(home_attack, away_defense, away_attack, home_defense, home_adv) -> tuple[float, float]
def score_matrix(mu_home, mu_away, rho, max_goals=10) -> list[list[float]]   # Dixon-Coles
def probs_1x2(matrix) -> tuple[float, float, float]
def prob_total_over(matrix, line) -> float
```
`vitoria` usa `probs_1x2`; `gols` usa `prob_total_over` (mesmo `score_matrix` → consistência). `rho` = correção Dixon-Coles de placares baixos.

### 4.7 `cache.py` (muda)
`cached_get(key, fetch, ttl_seconds=None, source="default", should_cache=None)` — guarda `{data, cached_at}`; expira se `now-cached_at > ttl`. `ttl=None` = eterno (jogo finalizado). Namespace por `source` (`.cache_api/bsd/` vs `.cache_api/apifootball/`). Odds/lineup: `ttl≈300` + só cacheia não-vazio.

### 4.8 `store/schema.sql` + `repo.py` (muda)
Migração via `apply_migration` (MCP Supabase): coluna `market_type text` em `analises` e `paper_ledger`; unique de `paper_ledger` vira `(event_id, jogador, linha, market_type)`; `update_fechamento`/`save_ledger` ganham `market_type`. Refletir no `schema.sql` no mesmo commit (fonte de verdade).

### 4.9 `candidates/builder.py` (muda)
`sot_concedido_adversario` → `concedido_adversario`; `build_candidate` ganha `market_type`. `filtro.py`/`Cortes` ganham instância por mercado (thresholds podem variar).

### 4.10 `pipeline.py` (muda)
`analisar_jogo(event, market: MarketSpec, stats_provider, odds_provider, repo, overrides=None, analista_fn=...)`. Remove import direto de `parse_sot_props`; dispatch por `market.kind` (`contagem` → `prob_over_line`; `partida_totais`/`partida_1x2` → `match_model`). `mu`/prob recomputados em código (anti-drift mantido).

### 4.11 `backtest/run_backtest.py` (muda)
`collect_data` atrás do `StatsProvider`; `score_records` ganha `stat_extractor: Callable[[dict], tuple[float,int]]` (a matemática pura não muda). Permite calibrar **qualquer** mercado offline.

### 4.12 `app/streamlit_app.py` (muda)
Seletor de mercado; liga `FallbackStatsProvider` + `OddsProvider` reais; input de **odd manual** p/ mercados de jogador; remove `_taxa_fn`/`elenco=[]`.

> **Inalterados:** `model/sot_model.py`, `model/shrinkage.py`, `model/adjustments.py`, `value/*`, `ai/*`.

## 5. Fluxo de dados

**Contagem** (jogador SOT/desarmes/finalizações; time escanteios):
`UI(jogo+mercado)` → `stats.elenco(event)` → `odds.linhas(event,market)` → p/ cada entidade `stats.entity_taxa(id,market)`→`mu` → `prob_over_line(mu,linha,nb_dispersion)` → `build_candidate`→`devig`→`edge/EV` (NullOdds → só prob, EV=None, "sem odd") → `filter_candidates(Cortes)` → IA explica → persist(`market_type`).

**Partida** (vitória/gols): igual nos passos de elenco/odds; `stats.team_rates(home/away)` → `team_lambdas` → `score_matrix` → `probs_1x2` (vitória) / `prob_total_over` (gols) → `build_candidate` por desfecho → `devig`→EV → filtro → IA → persist.

> **Crosswalk:** dentro do BSD, lineup↔stats = mesmo id space → **zero matching de nome** no caminho feliz. `match_player` (existente) só reaparece quando odd EXTERNA (manual/prop futura) vier por nome → casa contra o elenco BSD.

## 6. Tratamento de erro

- **Fallback de stats:** BSD None/erro → API-Football; loga fonte; ambas falham → entidade descartada **com log** (corrige drop silencioso).
- **Odd vazia pré-kickoff:** NullOdds (não-erro) → modelo-only. Cache de odd/lineup só se não-vazio + TTL.
- **Falta um lado over/under:** pula a linha (sem de-vig).
- **BSD fora do ar:** stats caem pro fallback; **odd de partida sem fallback** (Betfair bloqueado em IP BR) → EV de partida indisponível, modelo-only + alerta.
- **IA fail-closed** (existente): JSON ruim → `melhor_aposta=null`.
- **`market_type`** mata a colisão de ledger entre mercados.
- **Settlement (def. BSD vs casa):** portão de calibração antes de confiar (validação, não runtime).

## 7. Ordem de execução (fases)

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0 — Infra** | `MarketSpec`+registry, `bsd/client`, `cache` TTL+namespace, migração `market_type`, protocols (+stubs) | seams testados; suíte verde |
| **1 — Fatia vertical (escanteios)** | `BSDStatsProvider`+`BSDMatchOdds`+caminho contagem | EV real ponta-a-ponta num jogo; teste de integração |
| **2 — Resto de contagem** | SOT, finalizações, desarmes (jogador, Null/Manual) + matchup por mercado | candidatos por mercado; testes |
| **3 — Modelo de partida** | `match_model` → vitória (1X2) + gols (totais), do mesmo `score_matrix` | 6 mercados cobertos; testes |
| **4 — Validação + fallback + extensão** | backtest por mercado + calibração (ECE<0.05), fallback API-Football, UI odd manual, slot PropOdds | mercado só "confiável" com calibração passando |

Cada fase = conjunto próprio de tarefas TDD no plano.

## 8. Testes (TDD, tudo offline)

- **Unit:** registry; `windowed_rate`/`assemble_mu`; `match_model` (matriz soma 1, 1X2+totais, rho); `cache` TTL (expiry+namespace); providers com `bsd/client` mockado (shape BSD→linha normalizada; fallback; manual; null).
- **Reusa intactos:** devig roundtrip, ev, filtro, schema IA.
- **Integração:** pipeline ponta-a-ponta por mercado com providers fake (sem rede) — contagem + 1X2.
- **Backtest/calibração:** `score_records` + `stat_extractor`; replay de histórico BSD (fixtures capturadas) por mercado → Brier/ECE/BrierSkill.
- `bsd/client` testado contra **fixtures gravadas** (resposta real → arquivo); **zero rede no CI**.

## 9. Guard-rails de doutrina (não violar)

- **EV decide, não o stat alto.** Modela prob de todos os candidatos → de-vig de todas as odds → `filtro` corta por edge/EV. Nunca selecionar mercado por "stat favorável".
- **Código calcula; IA explica.** `mu`/prob/edge/EV em código; `validate_ia_output` rejeita aposta fora do conjunto pré-filtrado.
- **Matchup = confronto.** `μ_base(produz) × concessão(adversário no mesmo eixo)`.
- **Validação-primeiro.** Mercado só vira "confiável" após calibração offline (ECE<0.05) — não por fé.

## 10. Fora de escopo (futuro, documentado)

- **Odd de prop de jogador automática:** slot `PropOddsProvider` fica pronto e vazio; não há feed barato hoje (coleta manual via `ManualOdds`).
- **Direcional/zonal:** matchup por-mercado entra agora; direcional (lado×posição via `total_cross`/`shotmap`) fica aproximado e adiado.
- **Dinheiro real:** só após paper_ledger com calibração boa + CLV+ consistente.
- **Cartões/outros mercados:** fora dos 6 do MVP.

## 11. Riscos abertos

- **Cap diário oculto do BSD** (free, indie): mitigado por cache agressivo + fallback API-Football + interface trocável.
- **Calibração por mercado:** priors (PRIOR_RATE etc.) de SOT não servem p/ gols/escanteios/desarmes — cada um precisa de calibração própria na Fase 4 antes de confiar.
- **Settlement mismatch** BSD vs casa em props (settlement Opta, margem 7-10%) — edge fino e frágil; provar no mercado de partida (CLV) primeiro.
- **Sustentabilidade do provedor BSD** — não hard-depender; fallback testado.
