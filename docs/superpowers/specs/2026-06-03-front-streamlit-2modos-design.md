# Design — Front Streamlit (2 modos) sobre camada de serviço

> **Data:** 2026-06-03 · **Meta:** primeira UI navegável do produto — escolher um jogo, varrer o elenco nos mercados de jogador validados, ver candidatos (edge/EV) + veredito da IA, em dois modos (pós-jogo = validar; pré-jogo = operar/paper). Construída em Streamlit AGORA, mas desacoplada por uma camada de serviço para escalar a outro front (Next.js) depois **sem reescrever lógica**.

## Contexto (de onde partimos)

O motor está validado (meta A→D, mergeada na `main`, 325 testes): mercados de **jogador (SOT/finalizações/desarmes) prestam**; **partida (gols/escanteios) não calibra ainda**. O caminho de produção é `runner.run_analise` → `pipeline.analisar_jogo` → `BSDStatsProvider`/`ManualOdds` (CLI hoje). O `app/streamlit_app.py` atual está **quebrado** (assinatura antiga de `analisar_jogo`, `_taxa_fn` placeholder com mu=0) e será **reescrito**. Doutrina: [../../../CLAUDE.md](../../../CLAUDE.md); status: [../../ROADMAP.md](../../ROADMAP.md); produto: [../../PITCH.md](../../PITCH.md).

## Princípio de arquitetura (o que destrava "escalar depois")

```
Streamlit (app/streamlit_app.py)         ← UI fina, trocável/descartável
        │  chama funções; recebe dados PUROS (dict JSON-serializável)
        ▼
camada de SERVIÇO (src/odd_analyzer/service.py)   ← NOVO, contrato estável
        │  orquestra o que já existe
        ▼
runner / pipeline / BSDClient / markets / repo    ← motor validado, INTACTO
```

A UI nunca toca o motor direto — só o `service.py`, que devolve dados serializáveis. Um futuro FastAPI/Next.js envolve **as mesmas funções do serviço** → a migração de front não reescreve lógica. O serviço é a fronteira testável.

## Camada de serviço — contrato (`src/odd_analyzer/service.py`)

Funções puras (sem Streamlit, sem print), injetáveis com `client`/`repo` para teste:

1. **`listar_jogos(client, league_id, status, limit=50) -> list[dict]`**
   Envolve `client.events(league_id=, status=, limit=)` + `runner.normalize_event`-like.
   Cada item: `{"id", "mandante", "visitante", "data", "status", "placar"}` (`placar` = `"1×1"` se finalizado, senão `None`).
   `status`: `"finished"` (modo pós-jogo) ou `"notstarted"` (modo pré-jogo).

2. **`analisar(client, event_id, market_key, linha, odd_over, odd_under, usar_ia=False, modo, repo=None) -> dict`**
   Reusa `runner.run_analise(client, event_id, market_key, player_ref=None, linha, odd_over, odd_under, usar_ia, repo)` (varredura do elenco).
   Retorna `{"jogo", "candidatos": [...], "ia": {...}}` — candidatos já com `prob_modelo/prob_devig/edge/ev/amostra_jogos/concedido_adversario/market_type`.
   **Modo pós-jogo:** enriquece cada candidato com `resultado_real` via `resultado_real_jogador(...)` (abaixo).
   **Validação de mercado:** se `market_key` é de partida (gols/escanteios), o serviço ainda calcula (transparência) mas marca `em_validacao=True` no retorno para a UI selar.

3. **`resultado_real_jogador(client, event_id, market_key, linha) -> dict[str, dict]`** (modo pós-jogo)
   Lê `client.event_player_stats(event_id)` e, para cada `player_id`, calcula se o stat real do mercado (`market.stat_field`) **superou a linha** → `{player_id (str): {"valor_real": int, "bateu": bool}}`.
   **Join:** o candidato hoje carrega só o nome (`build_candidate(jogador=name)`). Para casar com `player_id`, o serviço **enriquece cada candidato com `player_id`** — pequena adição: `_contagem_jogador`/`build_candidate` passam a propagar o id do jogador (campo `player_id`). O join pós-jogo é então direto por `player_id` (sem depender de nome).

4. **`apostar_paper(repo, event_id, candidato) -> None`** (modo pré-jogo)
   Grava o candidato no `paper_ledger` via `repo.save_ledger([...])` (mesma forma que `pipeline` já usa). Bloqueado para mercados `em_validacao`.

> Decisão: a UI cria o `client` (`BSDClient(get_required("BZZOIRO_API_KEY"))`) e o `repo` (`SupabaseRepo` se config disponível, senão `InMemoryRepo`) e os injeta no serviço. Serviço não lê env nem decide fonte — testável com fakes.

## Telas (Streamlit) — validadas em wireframe

**Tela 1 — Lista de jogos.** Topo: toggle **[Pós-jogo | Pré-jogo]** + seletor de **Liga** (default Brasileirão A = `league_id 9`; campo aberto p/ outras, ex. WC 2026 = 27) + busca por time. Lista os jogos de `listar_jogos` (status conforme o modo): linha por jogo com `mandante × visitante · data · status [· placar]` e botão **Analisar →** (seta `st.session_state` para a tela de análise).

**Tela 2 — Análise.** Header com o jogo + voltar. Abas de **Mercado**: SOT · Finalizações · Desarmes (confiáveis) e Gols · Escanteios com selo **"EM VALIDAÇÃO — não apostar"**. Entrada de **odds manual** (Linha / Over / Under — não há feed). Botão **Varrer elenco** → `analisar(...)` → tabela de **candidatos** (`Jogador · Linha · p_mod · p_devig · Edge · EV · n · adv_concede`) ordenada por EV; abaixo, o **box do veredito da IA** (se `--ia` ligado; senão nota "IA desligada"). 
- **Modo pós-jogo:** coluna extra **Resultado** (`valor_real` + ✅/❌ "bateu") via `resultado_real_jogador`.
- **Modo pré-jogo:** botão **Apostar (paper)** por candidato → `apostar_paper` (desabilitado se `em_validacao`).

## Fluxo de dados

`listar_jogos` (BSD events) → usuário escolhe → `analisar` (runner→pipeline→BSD stats + ManualOdds) → candidatos filtrados (edge≥0.04, ev≥0.05) → UI renderiza tabela + IA → [pós: join resultado_real] / [pré: apostar_paper grava ledger].

## Tratamento de erro

- Sem `BZZOIRO_API_KEY` → tela amigável "configure .env" (não stacktrace).
- BSD falha/timeout → mensagem "fonte indisponível, tente de novo" (o cache já mitiga).
- Jogo sem lineup (pré-jogo, lineup não saiu) → aviso "escalação ainda não publicada; varredura usa elenco provável/None".
- Elenco vazio / nenhum candidato passa o filtro → "Nenhum candidato com valor (edge/EV abaixo do corte)" — **não é erro**, é a resposta honesta (poucas oportunidades fortes > muitas fracas).
- Mercado `em_validacao` → selo + botão de aposta desabilitado.

## Testes

- **Serviço (unit, com fakes):** `listar_jogos` mapeia a forma do BSD; `analisar` devolve a estrutura esperada com `FakeBSDClient`; `resultado_real_jogador` calcula bateu/não-bateu corretamente; `apostar_paper` grava no `InMemoryRepo` e respeita o bloqueio `em_validacao`. Sem rede.
- **UI:** smoke test (importa o módulo, funções de render não quebram com dados fake). Streamlit não é testado pixel-a-pixel.

## Fora de escopo (próximos passos)

Feed automático de odds (não existe <$99/mês); migração Next.js (o serviço já deixa pronto); loop automático de CLV (`snapshot_fechamento` existe, mas a captura forward agendada fica pra depois); league-sweep multi-liga; ligar mercados de partida (só quando calibrarem). O `app/streamlit_app.py` quebrado é substituído, não remendado.

## Critério de pronto

1. `service.py` com as 4 funções, testado com fakes (verde).
2. `app/streamlit_app.py` reescrito: 2 telas, toggle de modo, abas de mercado (3 + 2 seladas), odds manual, tabela de candidatos + IA, coluna resultado (pós) / botão paper (pré).
3. Roda local (`streamlit run app/streamlit_app.py`) contra o BSD vivo e mostra os candidatos do evento 7166 (sanity).
4. Suíte inteira verde.
