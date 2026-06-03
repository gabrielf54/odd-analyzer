# Roadmap & Status — odd-analyzer

> **Atualizado:** 2026-06-03 (Task 10b) · **Branch:** `feat/motor-calibracao-pre-front` · **Suíte:** 321 testes verdes · **Custo até aqui:** $0.

## Calibração (Fase B — BSD liga 9, 2026-06-03)

Backtest leave-one-out em **120 jogos finalizados da liga 9** (n=3304 registros jogador-jogo por mercado, após filtro de minutos).
Script: `src/odd_analyzer/backtest/run_bsd_backtest.py`.

| mercado | linha | n | freq_real | Brier | ECE | BrierSkill |
|---------|-------|---|-----------|-------|-----|------------|
| desarmes | over 0.5 | 3304 | 0.522 | 0.2102 | 0.0645 | 0.157 |
| desarmes | over 1.5 | 3304 | 0.258 | 0.1598 | 0.0474 | 0.165 |
| desarmes | over 2.5 | 3304 | 0.109 | 0.0866 | 0.0149 | 0.108 |
| sot | over 0.5 | 3304 | 0.227 | 0.1559 | 0.0388 | 0.112 |
| sot | over 1.5 | 3304 | 0.058 | 0.0492 | 0.0089 | 0.092 |
| sot | over 2.5 | 3304 | 0.010 | 0.0098 | 0.0010 | 0.034 |
| finalizacoes | over 0.5 | 3304 | 0.494 | 0.2170 | 0.0815 | 0.132 |
| finalizacoes | over 1.5 | 3304 | 0.220 | 0.1440 | 0.0465 | 0.161 |
| finalizacoes | over 2.5 | 3304 | 0.094 | 0.0742 | 0.0188 | 0.132 |

| escanteios | over 8.5 | 112 | 0.652 | 0.2498 | 0.1513 | -0.101 |
| escanteios | over 9.5 | 112 | 0.545 | 0.2597 | 0.1082 | -0.047 |
| escanteios | over 10.5 | 112 | 0.375 | 0.2344 | 0.0026 | -0.000 |
| gols (ataque-only) | over 1.5 | 120 | 0.742 | 0.1878 | 0.0848 | +0.020 |
| gols (ataque-only) | over 2.5 | 120 | 0.500 | 0.2571 | 0.0874 | -0.028 |
| gols (ataque-only) | over 3.5 | 120 | 0.275 | 0.2151 | 0.0968 | -0.079 |
| gols (c/ defesa, Task 10b) | over 1.5 | 120 | 0.742 | 0.1878 | 0.1058 | +0.020 |
| gols (c/ defesa, Task 10b) | over 2.5 | 120 | 0.500 | 0.2637 | 0.1178 | -0.055 |
| gols (c/ defesa, Task 10b) | over 3.5 | 120 | 0.275 | 0.2265 | 0.1934 | -0.136 |

**Vereditos honestos por mercado:**

- **desarmes**: `presta (over 1.5)` — após tune de `prior_rate 2.0→1.3` (sweep ECE em liga 9, Task 5b): over 1.5 agora ECE 0.0474 e BrierSkill 0.165 (melhor linha); over 2.5 ECE 0.0149 (excelente). Over 0.5 ficou em ECE 0.0645 (borderline, mas 30% abaixo do baseline 0.0869 pré-tune). Causa do over-confidence anterior confirmada: `prior_rate=2.0` encolhia jogadores para taxa muito alta. **Caveats: (1) prior fit em liga 9 — re-validar em outras ligas na Fase 4; (2) eixo de concessão é proxy fraco** (ver follow-up `matchup-desarmes-proxy`). **Usar over 1.5 e over 2.5; over 0.5 monitorar.**
- **sot**: `presta` nas linhas úteis — over 0.5 (ECE 0.0388, BrierSkill 0.112) e over 1.5 (ECE 0.0089, BrierSkill 0.092) passam o crivo. Over 2.5 é tecnicamente calibrado (ECE 0.0010) mas freq_real=0.010 → aposta raramente acionada (evento raro). **Melhor mercado no momento; over 0.5 e 1.5 prontos para uso cauteloso.**
- **finalizacoes**: `presta` nas linhas altas — over 1.5 (ECE 0.0465, BrierSkill 0.161) e over 2.5 (ECE 0.0188, BrierSkill 0.132) são os melhores resultados absolutos do backtest. Over 0.5 é borderline (ECE 0.0815, sub-estima freq real nos bins do meio). **Usar over 1.5 e over 2.5; over 0.5 aguardar ajuste de prior.**
- **gols (match_model — Task 10b, com termo de defesa)**: `não presta em produção ainda`. Task 10b adicionou `lambda_efetivo = att_proprio × (def_adversario / liga)` (análogo ao `opponent_multiplier` dos mercados de jogador) com leave-one-out de ataque E defesa. **Resultado: piorou.** Comparação honesta (ataque-only → c/ defesa): over 1.5 BrierSkill +0.020 → +0.020 (neutro, ECE 0.085→0.106); over 2.5 BrierSkill -0.028 → **-0.055** (−0.027); over 3.5 BrierSkill -0.079 → **-0.136** (−0.057). Liga média=1.283 gols/time/jogo. Diagnóstico: o termo de defesa com leave-one-out em amostras pequenas (1 jogo de janela pra times com poucos jogos) **amplifica ruído** — se um time concedeu muitos/poucos gols em sua única partida na janela, o multiplicador explode. O denominador `liga` (~1.28) é correto; o numerador `def_a` varia de 0 a 4+ com alta variância em n=1. O modelo de ataque-only era estável por simetria (att_h e att_a têm múltiplos jogos). **Ação:** manter `lambda_for` como base de produção em produção (sem termo de defesa por enquanto); a estabilidade da defesa requer smoothing (shrinkage para a média da liga) antes de entrar no multiplicador — próximo passo se e quando gols virar prioridade. Liga 9 tem viés de fit (veredito se mantém: gols não deve ser usado para filtragem de apostas sem calibração adequada).
- **escanteios**: `baseline inconcluso` — este backtest usa **mu único da liga** (sem matchup por jogo): toda partida recebe a mesma predição. Por construção, BrierSkill ≈ 0 (predição constante vs climatologia) e ECE mede apenas o erro de localização do mu na NB. Interpretação: over 10.5 (ECE 0.0026, BrierSkill ≈ 0) confirma que `mu=9.73` com `NB(r=3.0)` captura a distribuição marginal na vizinhança da mediana — a NB está corretamente parametrizada para a liga. O BrierSkill negativo em over 8.5/9.5 reflete que a predição constante cai abaixo da freq_real nessas linhas (NB subestima levemente a aba direita). **Isso NÃO é falha do engine** — é esperado num baseline-vs-baseline. O skill real de escanteios emerge apenas com o `team_taxa` matchup por jogo (produção × concessão já implementado no pipeline principal), que este backtest simplificado não exercita. **Não usar este backtest para decisão de aposta; é uma verificação de consistência da distribuição marginal.**

**Nota sobre CLV:** este backtest mede apenas calibração de probabilidade (confiabilidade + skill vs base). **CLV (Closing Line Value) NÃO é medido aqui** — props de jogador não têm mercado com linha de fechamento disponível (<$99/mês). O CLV entrará quando houver feed de odds de prop (ver decisões travadas na seção abaixo). Esta etapa (calibração offline) é a porta de entrada da sequência de validação: calibração → CLV → dinheiro real.

---

## TL;DR — onde estamos

Construindo o **motor multi-mercado** sobre o **BSD/Bzzoiro** (fonte oficial de stats, grátis).

- ✅ **PRIMEIRA SAÍDA REAL** (2026-06-03): `cli.py analisar` puxa dado VIVO do BSD e imprime candidato com edge/EV. Ex. real (evento 7166, Cruzeiro×Flu finalizado): **Kaiki o1.5 desarmes — p_modelo 0.731 (3.38 desarmes/jogo em 50 jogos) vs odd de-vig 0.546 → edge +0.185, EV +0.242**. EV decide em código; IA só explica.
- 🔴 **Causa-raiz que estava escondida:** os providers liam uma **forma idealizada de JSON que NÃO batia com o BSD real**; os 287 testes passavam porque o `FakeBSDClient` devolvia a forma idealizada. **O e2e de escanteios da "Fase 1" era fixture-idealizada, não forma-real** → escanteios **nunca rodou em dado vivo**. Reconciliar provider↔forma-real é o verdadeiro bloqueador (resolvido p/ jogador; pendente p/ escanteios).
- ✅ **Slice 1 (jogador) em dado REAL:** desarmes ponta-a-ponta (`bsd-probe` → reconciliação `elenco`/`entity_taxa` → `runner` + `ManualOdds` → `cli analisar`). **SOT e finalizações** usam o **mesmo caminho** (`shots_on_target`/`total_shots` no mesmo payload) — validados rodando (basta trocar `--market`).
- ✅ **Slice 2 (escanteios) em dado REAL:** #25 resolvido (`team_taxa` agrega `corner_kicks` do histórico de cada time via `events(team_id, finished)` + `/events/{id}/stats/`); pipeline ramifica por `market.nivel` (total da partida = soma dos dois times). Odd colada via `ManualOdds`. **Automático (odds do BSD) = pendente** (só pré-jogo, ver follow-up `odds-corners`).
- ✅ **MATCHUP REAL ligado (2026-06-03)** — o diferencial da doutrina entra no `mu`: `BSDStatsProvider._team_conceded` agrega o que o **adversário concede** no mesmo eixo (lado oposto em `/events/{id}/stats/` do histórico DELE) → `opponent_multiplier` (clampado `[0.7,1.4]`) multiplica a produção. Liga em jogador (`entity_taxa`) e partida (`team_taxa`). Baseline nível-TIME = `MarketSpec.concede_baseline` (prior estático, **pendente de league-sweep na Fase 4**). **Efeito real visível:** escanteios do 7166, que no número *ingênuo* dava over 8.5 (mu 10.13, "edge +0.069"), com o confronto cai p/ **mu 7.94** (Fluminense concede só 3.0 corners/jogo → mult 0.7; Cruzeiro 4.6 → 0.92) → **deixa de ser valor**. Produção × concessão, não média bruta.
- ✅ **VARREDURA ligada (2026-06-03)** — `cli analisar` SEM `--player` escaneia o **elenco inteiro** e o filtro edge/EV revela quem tem valor (não precisa adivinhar o jogador). Ex. 7166 desarmes o1.5 @1.90: Kaiki (edge +0.205) e L. Romero (+0.164). Coluna `adv_concede` mostra o matchup na tabela.
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

### ✅ Slice 3 — Matchup real + varredura (2026-06-03)
`BSDStatsProvider._team_conceded` (concessão do adversário no eixo, via histórico DELE) + `_opp_mult` (clamp `[0.7,1.4]`) ligados em `entity_taxa` e `team_taxa` · `MarketSpec.concede_baseline` (baseline nível-time, prior estático→Fase 4) · pipeline passa `opp_team_id`+baseline · `runner.run_analise` sem `--player` = **varredura** do elenco · coluna `adv_concede` na tabela. **+5 testes (308 total).** Diferencial da doutrina (produção × concessão) agora entra no número. **Caveats:** baseline estático (`concede-baseline-estatico`) e eixo de desarmes é proxy (`matchup-desarmes-proxy`) — ambos mapeados nos follow-ups.

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
| ~~**matchup-neutro**~~ ✅ | **RESOLVIDO (2026-06-03)** — `_team_conceded` agrega a concessão do adversário no eixo (lado oposto do histórico dele) → `opponent_multiplier` clampado `[0.7,1.4]` entra no `mu`, em jogador (`entity_taxa`) e partida (`team_taxa`). Produção × concessão ligado | — | Feito (#1) |
| **concede-baseline-estatico** | O denominador do `opponent_multiplier` (`MarketSpec.concede_baseline`: sot 4.5 / finalizações 12 / desarmes 16 / escanteios 5) é **prior estático chutado**, não a média real da liga. Se torto, enviesa TODO o matchup pra cima/baixo (o clamp limita, não corrige) | Edge do matchup pode ter viés sistemático até calibrar | **Fase 4**: league-sweep que mede a concessão média real por mercado/liga e substitui os baselines |
| **matchup-desarmes-proxy** | P/ desarmes o eixo "desarmes concedidos" é **proxy fraco** (jogador desarma conforme o adversário ataca na zona dele, não conforme "tackles que o adversário cede"). SOT/escanteios/finalizações o eixo é limpo | Sinal de desarmes pode ler o matchup errado | Quando houver dado posicional/zonal (nível direcional da doutrina) |
| **per90-minutos** | `entity_taxa` usa média por-jogo (ignora minutos); doutrina pede per-90 ponderado por minutos (Σstat/Σmin×90) | Erra `mu` de quem joga minutos parciais (suplente/substituído) | Próximo (junto do refinamento de matchup) |
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
  - `analisar --event 7166 --market desarmes --linha 1.5 --over 1.90 --under 1.90 [--ia]` — **varredura** (sem `--player`: escaneia o elenco; coluna `adv_concede` = matchup).
  - `analisar --event 7166 --market desarmes --player Kaiki --linha 1.5 --over 1.70 --under 2.00` — 1 jogador.
  - `analisar --event 7166 --market escanteios --linha 8.5 --over 2.10 --under 1.75` — partida (sem `--player`; matchup já reduz o mu pelo confronto).
- **Próxima fatia:** **modo automático/pré-jogo de odds** (follow-up `odds-corners`: reconciliar `BSDMatchOdds` + endpoint de odds de corners num jogo futuro) e o **front 2 modos**. Depois Fase 3 (partida 1X2/gols) e Fase 4 (calibração/CLV — onde o `concede_baseline` estático vira league-sweep real).
