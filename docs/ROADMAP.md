# Roadmap & Status — odd-analyzer

> **Atualizado:** 2026-06-03 · **Branch:** `feat/sub3-bsd-oficial-multimercado` (NÃO mergeada na main) · **Suíte:** 303 testes verdes · **Custo até aqui:** $0.

## TL;DR — onde estamos

Construindo o **motor multi-mercado** sobre o **BSD/Bzzoiro** (fonte oficial de stats, grátis).

- ✅ **PRIMEIRA SAÍDA REAL** (2026-06-03): `cli.py analisar` puxa dado VIVO do BSD e imprime candidato com edge/EV. Ex. real (evento 7166, Cruzeiro×Flu finalizado): **Kaiki o1.5 desarmes — p_modelo 0.731 (3.38 desarmes/jogo em 50 jogos) vs odd de-vig 0.546 → edge +0.185, EV +0.242**. EV decide em código; IA só explica.
- 🔴 **Causa-raiz que estava escondida:** os providers liam uma **forma idealizada de JSON que NÃO batia com o BSD real**; os 287 testes passavam porque o `FakeBSDClient` devolvia a forma idealizada. **O e2e de escanteios da "Fase 1" era fixture-idealizada, não forma-real** → escanteios **nunca rodou em dado vivo**. Reconciliar provider↔forma-real é o verdadeiro bloqueador (resolvido p/ jogador; pendente p/ escanteios).
- ✅ **Slice 1 (jogador) em dado REAL:** desarmes ponta-a-ponta (`bsd-probe` → reconciliação `elenco`/`entity_taxa` → `runner` + `ManualOdds` → `cli analisar`). **SOT e finalizações** usam o **mesmo caminho** (`shots_on_target`/`total_shots` no mesmo payload) — validados rodando (basta trocar `--market`).
- ✅ **Slice 2 (escanteios) em dado REAL:** #25 resolvido (`team_taxa` agrega `corner_kicks` do histórico de cada time via `events(team_id, finished)` + `/events/{id}/stats/`); pipeline ramifica por `market.nivel` (total da partida = soma dos dois times). Ex. real (7166): Cruzeiro 6.26 + Fluminense 3.86 = **10.13** corners → over 8.5 @2.10 → **edge +0.069, EV +0.099**. Odd colada via `ManualOdds`. **Automático (odds do BSD) = pendente** (só pré-jogo, ver follow-up `odds-corners`).
- ⬜ Faltam **Fases 3, 4** + follow-ups (abaixo).

### Formas REAIS do BSD (inspecione com `cli.py bsd-probe 7166` → dumpa em `.probe_dumps/`, descartável/gitignorado)
- `/events/{id}/` — **flat**: `home_team_id`(int) + `home_team`(**nome**), idem away. (o `runner.normalize_event` aninha p/ o pipeline)
- `/events/{id}/lineups/` — `{lineups:{home:{team_id, players:[{id,name,position}], substitutes:[...]}, away:{...}}}`. Titular = `players` (sem boolean `starting`).
- `/players/{id}/stats/` — `{count,next,previous, results:[{minutes_played, total_tackle, shots_on_target, total_shots, ...}]}`. Campos **batem** com `market.stat_field` de jogador. **Sem `mando`** (sem split casa/fora no v1).
- `/events/{id}/team-stats/` — **404**. Stats de time vêm de `/events/{id}/stats/` → `{stats:{home:{corner_kicks, total_tackles, ...}, away:{...}}}` (nomes de TIME diferem: `corner_kicks`, `total_tackles`).
- `/events/{id}/odds/` (jogo finalizado) — flat `{odds:{home_win, over_25_goals, btts_yes, ...}}`, **sem corners e sem bookmakers**. Odds de escanteios precisam de outro endpoint (`/odds/?market=total_corners` ou `/odds/comparison/`) — confirmar perto do kickoff.

## Produto (1 frase)

Para um jogo, compara a **probabilidade do nosso modelo** (calculada em código) com a **odd da casa sem margem** (de-vig) e só sinaliza quando o modelo está claramente à frente (+EV). A IA **explica**, nunca inventa o número. Doutrina completa: [../CLAUDE.md](../CLAUDE.md).

---

## Estado por fase

### ✅ Fase 0 — Infra (seams + contratos)
`markets.py` (6 mercados como dado) · `cache.py` (TTL + namespace) · `bsd/client.py` (11 endpoints) · `providers/` (StatsProvider/OddsProvider protocols + stubs + Fallback) · `store/` (`market_type` no schema/repo).
Commits: `6bed52c` `a0aba7f` `328b45b` `27619f6` `c082d6a`.

### ⚠️ Fase 1 — Escanteios ponta-a-ponta (só FIXTURE-idealizada)
`assemble.py` (janelas 3/5/10 + matchup) · builder · pipeline agnóstico (dispatch por `kind`) · e2e escanteios.
**Ressalva:** o e2e usa forma idealizada, **não a real** → escanteios **não roda em dado vivo** ainda (ver Slice 2 / #25).
Commits: `7a3a467` `05a6ac9` `8a5872c` `ff84b12` `4793cb4` `a641a52`.

### ✅ Slice 1 — Mercado de JOGADOR em dado REAL (desarmes ponta-a-ponta)
`probes/bsd_probe.py` + `cli bsd-probe` (captura forma real) · **reconciliação** `BSDStatsProvider.elenco`/`entity_taxa` p/ a forma real do BSD · `runner.py` (`normalize_event` + `OnlyPlayer` + `fake_analista`) · `ManualOdds` (cola a linha) · `cli analisar`. **EV em código, IA opcional (`--ia`).** 11 testes novos (298 total). Mercado-bandeira: **desarmes** (exemplo de confronto da doutrina).
> SOT e finalizações compartilham o caminho (mesmo payload `/players/{id}/stats/`) — **falta só validar/mostrar** (não precisa de código novo de provider).

### ✅ Slice 2 — Escanteios em dado REAL (stats; odds via ManualOdds)
`client.event_stats` (`/events/{id}/stats/`) · `BSDStatsProvider.team_taxa` (#25: agrega `corner_kicks` do histórico do time via `events(team_id, finished)`) · pipeline ramifica `market.nivel=="partida"` → `_contagem_partida` (mu = soma dos dois times) · runner aceita mercado de partida (sem `--player`). **Falta só o modo automático de odds** (`BSDMatchOdds` na forma real + endpoint de odds de corners — só existe pré-jogo; ver follow-up `odds-corners`).

### ⬜ Fase 3 — Modelo de PARTIDA (vitória 1X2 + gols)
`match_model.py` (Poisson bivariado + Dixon-Coles) → `probs_1x2` + `prob_total_over`; `team_rates`.
Tasks do plano: 22–28 (pular **23** — markets já tem vitoria/gols).

### ⬜ Fase 3 — Modelo de PARTIDA (vitória 1X2 + gols)
`match_model.py` (Poisson bivariado + Dixon-Coles) → `probs_1x2` + `prob_total_over`; `team_rates`.
Tasks do plano: 22–28 (pular **23** — markets já tem vitoria/gols).

### ⬜ Fase 4 — Validação + fallback + UI + extensão
Backtest por mercado + **calibração (ECE<0.05)** · **ApiFootballStatsProvider + FallbackStatsProvider** wired · religar **streamlit** · slot PropOdds documentado.
Tasks do plano: 29–35 (pular **33** — PropOdds stub já feito na Fase 0).

---

## Follow-ups / gaps abertos

Não quebram testes (fixtures), mas **bloqueiam dado REAL**:

| # | Gap | Impacto | Quando resolver |
|---|-----|---------|-----------------|
| ~~#25~~ ✅ | **RESOLVIDO** — histórico de TIME p/ escanteios via `team_taxa` + `events(team_id, finished)` + `/events/{id}/stats/`; pipeline ramifica por `market.nivel`. Escanteios roda em dado real (odds via ManualOdds) | — | Feito (Slice 2) |
| **odds-corners** | `/events/{id}/odds/` de jogo finalizado vem **sem corners e sem bookmakers** (só 1x2/over_under_gols/btts, flat). `BSDMatchOdds` ainda espera a forma idealizada (`bookmakers[].outcomes[].point/price`) | Sem odds automáticas de escanteios não há modo **automático/pré-jogo** (ManualOdds funciona) | Testar `/odds/?market=total_corners` ou `/odds/comparison/` num jogo **futuro** (corners só existem pré-kickoff) |
| **matchup-neutro** | Concessão do adversário p/ jogador está **NEUTRA** no v1 (`/team-stats/` 404 → cai p/ `league_avg`). A doutrina de confronto (produção × concessão no mesmo eixo) ainda não entra no `mu` | Sinal de jogador ignora o matchup (subestima/superestima edge) | Próximo: agregar `event_player_stats`/`stats` do adversário por mercado |
| **per90-minutos** | `entity_taxa` usa média por-jogo (ignora minutos); doutrina pede per-90 ponderado por minutos (Σstat/Σmin×90) | Erra `mu` de quem joga minutos parciais (suplente/substituído) | Junto do matchup |
| **xi-confirmado** | pipeline não popula `xi_team_ids` → `xi_confirmado` é sempre `True` (gate do filtro inerte) | Filtro não barra jogador fora do XI provável (ok em jogo finalizado; importa no pré-jogo) | Junto do modo pré-jogo |
| **front 2 modos** | Front precisa de **dois modos**: **pós-jogo** (validar/melhorar produto com resultado conhecido) e **pré-jogo** (apostar de verdade). Hoje só há `cli analisar` + `streamlit` quebrado | Sem UI não dá p/ operar/validar em escala | Religar streamlit (Fase 4 / Task 34) já com os 2 modos |
| — | `app/streamlit_app.py` quebrado (assinatura antiga de `analisar_jogo`) | App não roda até religar | Fase 4 (Task 34) — junto dos 2 modos |
| — | `save_analise`/`get_analise` sem `market_type` | Múltiplas análises por evento colidem na persistência | Quando persistir multi-mercado de verdade |
| — | Duplicatas de plano entre fases (tasks **7/9/15/23/33** recriam infra já feita na Fase 0) | Pular na execução | Já mapeado |

## Decisões travadas (NÃO re-litigar)

- **BSD = fonte oficial** de stats; **API-Football = fallback** (atrás de `StatsProvider`).
- **Mercados de jogador** (SOT/finalizações/desarmes): **modelo-only + entrada manual de odd**; slot `PropOddsProvider` p/ feed futuro. **Nenhuma API de odds de prop é necessária** pra construir/usar.
- **Mercados de partida** (gols/vitória/escanteios): odds do **próprio BSD** (Pinnacle/bet365/betano) p/ de-vig.
- **Odd de prop de jogador de casa BR NÃO existe < $99/mês** (4 ângulos confirmaram). Comprar feed só **DEPOIS** da Fase 4 (calibração+CLV), com **evidência** de que o modelo bate o mercado.
- **EV decide no código** (filtro `edge≥0.04, ev≥0.05, xi_confirmado, amostra≥10`); **IA só explica** (guarda anti-alucinação).
- Cadência de execução: **subagent-driven, fase a fase**, com checkpoint entre fases.

## Caminho até dinheiro real (validação-primeiro)

1. **Fases 2–4 (build)** — $0, tudo offline/fixtures.
2. **Calibração offline por mercado** (Brier/ECE/BrierSkill, ECE<0.05) + **CLV** no `paper_ledger` — $0.
3. **Com evidência:** decidir comprar **API-Football $19** (stats live, ~1 sem antes da Copa) e/ou reavaliar prop-odds.
4. **Paper-mode → dinheiro real** só com calibração boa + CLV+ consistente.

## Riscos

- **BSD indie:** cap diário oculto? → mitigado por cache agressivo + fallback API-Football + interface trocável.
- **Settlement mismatch** (def. de stat do BSD vs casa) → calibrar antes de dinheiro.
- **"Máquina provada" ≠ "modelo bom":** a calibração (Fase 4) é que diz se o sinal presta. Nada de auto-engano.
- **Timing:** odds de partida do BSD populam perto do kickoff; lineup ~1h antes.

## Como retomar (próxima sessão)

- **Spec:** [superpowers/specs/2026-06-03-sub3-bsd-oficial-multimercado-design.md](superpowers/specs/2026-06-03-sub3-bsd-oficial-multimercado-design.md)
- **Plano (35 tasks):** [superpowers/plans/2026-06-03-sub3-bsd-oficial-multimercado.md](superpowers/plans/2026-06-03-sub3-bsd-oficial-multimercado.md)
- **Dados/endpoints do BSD:** [dados-necessarios-analise.md](dados-necessarios-analise.md) · **APIs:** [apis/README.md](apis/README.md)
- **Rodar o que já funciona** (`python -m odd_analyzer.cli ...`):
  - `bsd-probe <event_id>` — dumpa a forma real do BSD em `.probe_dumps/` (descartável/gitignorado).
  - `analisar --event 7166 --market desarmes --player Kaiki --linha 1.5 --over 1.70 --under 2.00 [--ia]` — jogador.
  - `analisar --event 7166 --market escanteios --linha 8.5 --over 2.10 --under 1.75` — partida (sem `--player`).
- **Próxima fatia:** **modo automático/pré-jogo de odds** (follow-up `odds-corners`: reconciliar `BSDMatchOdds` + endpoint de odds de corners num jogo futuro) e o **front 2 modos**. Depois Fases 3 (partida 1X2/gols) e 4 (calibração/CLV).
