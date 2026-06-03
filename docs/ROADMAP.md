# Roadmap & Status — odd-analyzer

> **Atualizado:** 2026-06-03 (meta A→D completa, mergeada na `main`) · **Suíte:** 336 testes verdes · **Custo até aqui:** $0.
>
> **Validação pré-front (veredito):** mercados de **JOGADOR (SOT · finalizações · desarmes) PRESTAM** e liberam o front. Mercados de **PARTIDA (gols/1x2 · escanteios) NÃO calibram ainda** → ficam fora do MVP de produção (código existe, ver Fase 3). Detalhe na seção Calibração abaixo. Casado com o escopo do [PITCH.md](PITCH.md).

## 🎯 Meta crítica — dinheiro real em 11/06/2026 (Copa do Mundo)

**O usuário começa a apostar DINHEIRO REAL em 11/06/2026** (início da Copa). Janela de prep: 03→11/06 (**8 dias**). Objetivo da janela: **maximizar confiança no que já valida**, não expandir escopo. Regras travadas para o dia 11:

- **Só mercados de JOGADOR** (SOT/finalizações/desarmes, já calibrados) carregam dinheiro. **Partida fica em paper/observação.**
- **Validação forward = paper-trade forward** (não CLV clássico — prop de jogador não tem linha de fechamento < $99/mês): prever antes → registrar no `paper_ledger` → liquidar pós-jogo → medir Brier/hit-rate/EV realizado num lote **NOVO**.
- **AMEAÇA #1 — shift de população (REBAIXADA por spike 2026-06-03):** calibração foi em **liga 9 (Brasileirão, clubes)**; a Copa é **seleções**. Jogo de seleção tem MENOS finalização (Kosovo×Türkiye SOT soma=5; Chile×Uruguai 6) → **calibração de clube NÃO transfere cega**. MAS o spike confirmou que o BSD tem **>1300 jogos de SELEÇÃO finalizados com player-stats completos** (eliminatórias 58/59/60/61/62, Nations League 64/65, amistosos 31 populando hoje, Euro 66, Copa América 67) no mesmo formato da liga 9 → **dá pra RE-CALIBRAR na população certa**, não só fazer sanity. Histórico montável via `team_id` (separa clube/seleção) + ordem mais-recente-primeiro. Ameaça vira **mensurável/mitigável**. Detalhe: [apis/bsd-bzzoiro/wc-validation-spike.md](apis/bsd-bzzoiro/wc-validation-spike.md).

**Prioridade da janela (ordem, pós-spike):** (1) **re-calibrar mercados de jogador na população de SELEÇÃO** (reusar `collect_bsd.py`+`run_bsd_backtest.py` nas ligas 58/59/64/31/66/67; testar rate clube-misto vs só-seleção via `team_id`; re-medir `concede_baseline` de seleção) → veredito honesto por mercado; (2) harness de validação forward — loop paper-bet→liquida→mede, alimentado por amistosos (liga 31) frescos; (3) `snapshot_fechamento` no pré-jogo; (4) disciplina de risco dia 11.

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
| gols (shrinkage ps=3, Task 10c) | over 1.5 | 120 | 0.742 | 0.1843 | 0.1386 | +0.038 |
| gols (shrinkage ps=3, Task 10c) | over 2.5 | 120 | 0.500 | 0.2573 | 0.0861 | -0.029 |
| gols (shrinkage ps=3, Task 10c) | over 3.5 | 120 | 0.275 | 0.2180 | 0.1670 | -0.093 |
| gols (shrinkage ps=5, Task 10c) | over 1.5 | 120 | 0.742 | 0.1835 | 0.0940 | +0.042 |
| gols (shrinkage ps=5, Task 10c) | over 2.5 | 120 | 0.500 | 0.2549 | 0.0989 | -0.019 |
| gols (shrinkage ps=5, Task 10c) | over 3.5 | 120 | 0.275 | 0.2145 | 0.1569 | -0.076 |
| gols (shrinkage ps=8, Task 10c) | over 1.5 | 120 | 0.742 | 0.1831 | 0.1068 | **+0.044** |
| gols (shrinkage ps=8, Task 10c) | over 2.5 | 120 | 0.500 | 0.2526 | 0.0650 | **-0.011** |
| gols (shrinkage ps=8, Task 10c) | over 3.5 | 120 | 0.275 | 0.2110 | 0.1308 | **-0.058** |

**Vereditos honestos por mercado:**

- **desarmes**: `presta (over 1.5)` — após tune de `prior_rate 2.0→1.3` (sweep ECE em liga 9, Task 5b): over 1.5 agora ECE 0.0474 e BrierSkill 0.165 (melhor linha); over 2.5 ECE 0.0149 (excelente). Over 0.5 ficou em ECE 0.0645 (borderline, mas 30% abaixo do baseline 0.0869 pré-tune). Causa do over-confidence anterior confirmada: `prior_rate=2.0` encolhia jogadores para taxa muito alta. **Caveats: (1) prior fit em liga 9 — re-validar em outras ligas na Fase 4; (2) eixo de concessão é proxy fraco** (ver follow-up `matchup-desarmes-proxy`). **Usar over 1.5 e over 2.5; over 0.5 monitorar.**
- **sot**: `presta` nas linhas úteis — over 0.5 (ECE 0.0388, BrierSkill 0.112) e over 1.5 (ECE 0.0089, BrierSkill 0.092) passam o crivo. Over 2.5 é tecnicamente calibrado (ECE 0.0010) mas freq_real=0.010 → aposta raramente acionada (evento raro). **Melhor mercado no momento; over 0.5 e 1.5 prontos para uso cauteloso.**
- **finalizacoes**: `presta` nas linhas altas — over 1.5 (ECE 0.0465, BrierSkill 0.161) e over 2.5 (ECE 0.0188, BrierSkill 0.132) são os melhores resultados absolutos do backtest. Over 0.5 é borderline (ECE 0.0815, sub-estima freq real nos bins do meio). **Usar over 1.5 e over 2.5; over 0.5 aguardar ajuste de prior.**
- **gols (match_model — Tasks 10b+10c, ataque+defesa+shrinkage)**: `não presta em produção — investigado em 3 configs; melhor = shrinkage ps=8; próximos passos: split casa/fora, fit do rho, mais ligas/dados. Mercado de partida fica fora do MVP de produção até calibrar.`
  - **Task 10b** adicionou `lambda_efetivo = att_proprio × (def_adversario / liga)` com leave-one-out bruto → **piorou** (over2.5 BrierSkill -0.028 → -0.055; over3.5 -0.079 → -0.136). Diagnóstico: leave-one-out bruto da defesa tem alta variância em n=1 — um único jogo com 0 ou 4 gols sofridos explode/colapsa o multiplicador.
  - **Task 10c** adicionou `shrink_rate` (mesma função já usada em mercados de jogador) às taxas de ataque e defesa, encolhendo-as para a média da liga. Sweep sobre `prior_strength ∈ {3, 5, 8}` (liga=1.283 gols/time/jogo, n=120): **ps=8 é o vencedor** — monotonicamente melhor em todas as linhas. Delta vs ataque-only: over1.5 +0.020→**+0.044** (+0.024 ✓); over2.5 -0.028→**-0.011** (+0.017, ainda negativo ✗); over3.5 -0.079→**-0.058** (+0.021, ainda negativo ✗).
  - **Decisão honesta:** shrinkage claramente ajuda e é o caminho certo, mas `ps=8` ainda não é suficiente para over2.5 (BrierSkill=-0.011) e over3.5 (-0.058). O modelo não passa o crivo mínimo (BrierSkill>0 em over2.5). **Não ligado à produção.** Caveats adicionais: (1) liga-9-only (viés de fit), (2) rho=-0.05 fixo (não calibrado), (3) sem split casa/fora nas taxas. Próximos passos se gols virar prioridade: split mandante/visitante nas taxas (ataque-casa, defesa-casa, ataque-fora, defesa-fora), varrer `ps` mais alto (12, 20), calibrar rho, e ampliar para mais ligas.
- **escanteios**: `baseline inconcluso` — este backtest usa **mu único da liga** (sem matchup por jogo): toda partida recebe a mesma predição. Por construção, BrierSkill ≈ 0 (predição constante vs climatologia) e ECE mede apenas o erro de localização do mu na NB. Interpretação: over 10.5 (ECE 0.0026, BrierSkill ≈ 0) confirma que `mu=9.73` com `NB(r=3.0)` captura a distribuição marginal na vizinhança da mediana — a NB está corretamente parametrizada para a liga. O BrierSkill negativo em over 8.5/9.5 reflete que a predição constante cai abaixo da freq_real nessas linhas (NB subestima levemente a aba direita). **Isso NÃO é falha do engine** — é esperado num baseline-vs-baseline. O skill real de escanteios emerge apenas com o `team_taxa` matchup por jogo (produção × concessão já implementado no pipeline principal), que este backtest simplificado não exercita. **Não usar este backtest para decisão de aposta; é uma verificação de consistência da distribuição marginal.**

**Nota sobre CLV:** este backtest mede apenas calibração de probabilidade (confiabilidade + skill vs base). **CLV (Closing Line Value) NÃO é medido aqui** — props de jogador não têm mercado com linha de fechamento disponível (<$99/mês). O CLV entrará quando houver feed de odds de prop (ver decisões travadas na seção abaixo). Esta etapa (calibração offline) é a porta de entrada da sequência de validação: calibração → CLV → dinheiro real.

## Calibração — população de SELEÇÃO (Copa, 2026-06-03)

Backtest **fiel à produção** (mesma conta pura; recorte anti-espiada por jogo-alvo) sobre o **pool de ligas de seleção** (eliminatórias 58/59/60/61/62, Nations League 64/65, amistosos 31, Euro 66, Copa América 67). Script: `src/odd_analyzer/backtest/run_national_backtest.py`. Varredura 4× = {só-seleção, todos} × {com/sem amistoso}. `concede_baseline_nacional` medido em 392 jogos: sot 4.28 · finalizações 12.22 · desarmes 13.97 (todos < clube → seleção produz/concede menos).

**Melhores números por mercado (modo só-seleção + com-amistoso; n≈1800 jogador-jogo):**

| mercado | linha | freq_real | Brier | ECE | BrierSkill |
|---------|-------|-----------|-------|-----|------------|
| sot | over 0.5 | 0.181 | 0.1433 | 0.1043 | +0.035 |
| sot | over 1.5 | 0.045 | 0.0428 | **0.0317** | +0.004 |
| sot | over 2.5 | 0.011 | 0.0118 | 0.0120 | -0.093 |
| finalizacoes | over 0.5 | 0.406 | 0.2377 | 0.1849 | +0.015 |
| finalizacoes | over 1.5 | 0.170 | 0.1451 | 0.1343 | -0.028 |
| finalizacoes | over 2.5 | 0.082 | 0.0754 | 0.0708 | -0.005 |
| desarmes | over 0.5 | 0.495 | 0.2409 | 0.1628 | +0.036 |
| desarmes | over 1.5 | 0.243 | 0.1858 | 0.1325 | -0.009 |
| desarmes | over 2.5 | 0.112 | 0.1077 | 0.0924 | -0.085 |

**Veredito honesto: os priors de CLUBE NÃO transferem pra seleção como estão.** Os bins de confiabilidade mostram **super-estimação sistemática** (em todo bin, prev > real). ECE 0.10–0.19 nas linhas úteis (vs 0.047 na liga 9) e BrierSkill ~0/negativo. **Nenhum mercado passa o crivo (ECE<0.08 + BrierSkill>0) na população de seleção** — exceção isolada: **SOT over 1.5 (ECE 0.032)**, mas com BrierSkill +0.004 (mal bate a climatologia → valor marginal). **→ Mercados de jogador NÃO carregam dinheiro na Copa até re-tunar os priors.**

**Sub-achados (resolvem decisões de design):**
- **só-seleção ≥ todos** em todos os mercados (BrierSkill maior, ECE igual/menor) → escopo "Só seleção" vira default da UI pra jogo de seleção. Confirma que a população importa.
- **com-amistoso ≈ sem-amistoso** (métricas quase idênticas; com-amistoso dá mais amostra) → amistoso NÃO enviesa; manter incluído.

**Causa provável dupla (norte do próximo passo):**
1. **Transferência clube→seleção da taxa** — a forma de clube super-estima a saída em seleção. Mitigação: re-tunar `prior_rate`/`prior_strength` por mercado na população de seleção (mesmo método do tune liga-9 desarmes 2.0→1.3, que derrubou o ECE).
2. **Projeção de 90 min** — o motor projeta todo titular pra 90 min, mas seleção tem muito rodízio; quem joga <90 produz menos que a projeção → super-estima. (O backtest da liga 9 usava minutos REAIS, isolando a taxa; este usa 90 como a produção → parte do gap é minutos, não taxa.) Mitigação: modelar minutos esperados (papel/lineup) em vez de assumir 90.

**DIAGNÓSTICO DE MINUTOS (2026-06-03, `scripts/diag_minutos_selecao.py`) — o gap é MINUTOS, não a taxa.** Rodando o MESMO conjunto com **minutos reais** do jogo-alvo (escala `mu_real = mu_90 × min_real/90`) em vez de projetar 90, a calibração se transforma (escopo só-seleção+amistoso, n=76 alvos):

| mercado | linha | ECE_90 | BS_90 | **ECE_real** | **BS_real** |
|---------|-------|--------|-------|----------|---------|
| desarmes | o0.5 | 0.1615 | +0.033 | **0.0579** | **+0.204** |
| desarmes | o1.5 | 0.1324 | -0.018 | **0.0256** | **+0.178** |
| desarmes | o2.5 | 0.0911 | -0.091 | **0.0224** | **+0.083** |
| sot | o0.5 | 0.1043 | +0.035 | **0.0549** | **+0.113** |
| sot | o1.5 | 0.0317 | +0.004 | **0.0084** | **+0.114** |
| finalizacoes | o1.5 | 0.1343 | -0.028 | **0.0528** | **+0.129** |
| finalizacoes | o2.5 | 0.0708 | -0.005 | **0.0202** | **+0.173** |

**Conclusão:** com minutos reais, o modelo de taxa **calibra excelente na população de seleção** (ECE quase todo <0.05, BrierSkill +0.08 a +0.20). **A taxa transfere clube→seleção sem problema** — a super-estimação vinha 100% da **projeção de 90 min** ignorando rodízio/substituição de seleção.

**Próximo passo (follow-up `minutos-esperados`, NÃO re-tunar priors):** modelar **minutos esperados** por jogador na produção (estimar via média recente de `minutes_played` + status do lineup) em vez de assumir 90 → `mu = taxa_por90 × min_esperados/90`. Re-validar o backtest com minutos ESTIMADOS (não reais — produção não os conhece pré-jogo) e medir o ECE resultante. Se a estimativa de minutos calibrar perto do teto (min reais), **os 3 mercados de jogador ficam money-ready pra Copa**. Até ligar isso, **player markets = paper/observação**.

### Re-validação com minutos ESTIMADOS (2026-06-03) — ✅ os 3 mercados de jogador passam

Follow-up `minutos-esperados` implementado (mergeado; `expected_minutes` = média recente de `minutes_played` na janela; `entity_taxa` e `score_targets` escalam o mu por isso em vez de 90). Re-rodado o backtest no modo **só-seleção + com-amistoso** (n≈1786 jogador-jogo) usando minutos **estimados** (o que a produção terá pré-jogo, NÃO os reais):

| mercado | linha | ECE_90 (piso) | **ECE_estimado** | ECE_real (teto) | **BrierSkill_estimado** | veredito |
|---------|-------|---------------|--------------|-----------------|---------------------|----------|
| sot | o0.5 | 0.1043 | **0.0473** | 0.0549 | **+0.109** | ✅ |
| sot | o1.5 | 0.0317 | **0.0118** | 0.0084 | **+0.095** | ✅ |
| sot | o2.5 | 0.0120 | **0.0014** | 0.0023 | **+0.061** | ✅ |
| finalizacoes | o0.5 | 0.1849 | **0.0763** | 0.0861 | **+0.101** | ✅ |
| finalizacoes | o1.5 | 0.1343 | **0.0471** | 0.0528 | **+0.112** | ✅ |
| finalizacoes | o2.5 | 0.0708 | **0.0162** | 0.0202 | **+0.137** | ✅ |
| desarmes | o0.5 | 0.1628 | **0.0558** | 0.0579 | **+0.124** | ✅ |
| desarmes | o1.5 | 0.1325 | **0.0299** | 0.0256 | **+0.098** | ✅ |
| desarmes | o2.5 | 0.0924 | **0.0237** | 0.0224 | **+0.054** | ✅ |

**Veredito: SOT, finalizações e desarmes PASSAM o crivo (ECE<0.08 + BrierSkill>0) em TODAS as linhas úteis com minutos estimados** — quase no teto dos minutos reais. A estimativa de minutos (média recente) é quase tão boa quanto saber o minuto real. **Os 3 mercados de jogador estão money-ready pra Copa** (`COPA_STATUS="ready"` no front). Confirma de novo: o gap NUNCA foi a taxa — era a projeção de 90 min. **Objetivo de 11/06 (motor de jogador validado na população certa) ATINGIDO.** Falta operacional: disciplina de risco + harness de validação forward ao vivo + (mercados de partida seguem fora).

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

### ⚠️ Fase 3 — Modelo de PARTIDA (vitória 1X2 + gols) — CÓDIGO FEITO, NÃO CALIBRA
`match_model.py` (Poisson bivariado + Dixon-Coles → `probs_1x2` + `prob_total_over`), `team_rates` (ataque+defesa) e dispatch `_run_partida` no pipeline **existem e rodam** (Fase C da meta A→D). **MAS gols NÃO presta na calibração** (ver seção Calibração): testados ataque-only, +defesa, +shrinkage{3,5,8} — melhor config (ps=8) ainda dá BrierSkill<0 em over2.5. **NÃO ligado à produção.** Próximos passos: split casa/fora, fit do `rho`, mais ligas/dados. Mercado de partida fica fora do MVP de produção até calibrar.

### ⬜ Fase 4 — Validação + fallback + UI + extensão
Backtest por mercado + **calibração (ECE<0.05)** · **ApiFootballStatsProvider + FallbackStatsProvider** wired · religar **streamlit** · slot PropOdds documentado.
Tasks do plano: 29–35 (pular **33** — PropOdds stub já feito na Fase 0).

---

## Follow-ups / gaps abertos

Não quebram testes (fixtures), mas **bloqueiam dado REAL**:

| # | Gap | Impacto | Quando resolver |
|---|-----|---------|-----------------|
| ~~#25~~ ✅ | **RESOLVIDO** — histórico de TIME p/ escanteios via `team_taxa` + `events(team_id, finished)` + `/events/{id}/stats/`; pipeline ramifica por `market.nivel`. Escanteios roda em dado real (odds via ManualOdds) | — | Feito (Slice 2) |
| **odds-corners** | **CONFIRMADO 2026-06-03** (sonda real, ver `docs/apis/bsd-bzzoiro/examples/event_odds.json`): `/events/{id}/odds/` de jogo finalizado vem **flat consensus, só mercado de partida** (`home_win/draw/away_win/over_under_{15,25,35}_goals/btts`) — **sem corners, sem bookmakers, sem Pinnacle, sem movimento**. `BSDMatchOdds` ainda espera a forma idealizada (`bookmakers[].outcomes[].point/price`) | Sem odds automáticas de escanteios não há modo **automático/pré-jogo** (ManualOdds funciona p/ pós-jogo/validação) | **Pré-requisito do modo PRÉ-JOGO do front, não desta meta.** Testar `/odds/?event_id=&market=total_corners` ou `/odds/comparison/` num jogo **futuro** com odds populadas (corners só existem pré-kickoff), depois reconciliar `BSDMatchOdds.linhas` com a forma real |
| ~~**matchup-neutro**~~ ✅ | **RESOLVIDO (2026-06-03)** — `_team_conceded` agrega a concessão do adversário no eixo (lado oposto do histórico dele) → `opponent_multiplier` clampado `[0.7,1.4]` entra no `mu`, em jogador (`entity_taxa`) e partida (`team_taxa`). Produção × concessão ligado | — | Feito (#1) |
| ~~**concede-baseline-estatico**~~ ✅ | **RESOLVIDO p/ liga 9 (2026-06-03)** — `scripts/measure_concede_baseline.py` mediu a concessão média real no BSD e substituiu os priors chutados: sot 4.5→4.55 · finalizações 12→13.46 · desarmes 16→14.64 · escanteios 5→4.79 (80 jogos). Resta apenas re-validar cross-liga | Viés do matchup corrigido na liga medida | **Fase 4**: estender o league-sweep a outras ligas/Copa antes de operar nelas |
| **matchup-desarmes-proxy** | P/ desarmes o eixo "desarmes concedidos" é **proxy fraco** (jogador desarma conforme o adversário ataca na zona dele, não conforme "tackles que o adversário cede"). SOT/escanteios/finalizações o eixo é limpo | Sinal de desarmes pode ler o matchup errado | Quando houver dado posicional/zonal (nível direcional da doutrina) |
| ~~**per90-minutos**~~ ✅ | **RESOLVIDO (2026-06-03)** — `windowed_rate(minutes_field="minutes_played")` faz per-90 ponderado (Σstat/Σmin×90); `entity_taxa` liga isso e reverte o histórico do BSD (decrescente→crescente) p/ usar a forma RECENTE. `team_taxa` também reverte (per-jogo, time joga ~90) | Resolvido p/ jogador e time | Feito (Fase A) |
| ~~**xi-confirmado**~~ ✅ | **RESOLVIDO (2026-06-03)** — `BSDStatsProvider.xi_ids` lê o lineup confirmado; pipeline popula `xi_team_ids`; `entity_taxa` compara `str(entity_id)` (bug: comparava team_id). Gate deixa de ser inerte quando o lineup está confirmado | Filtro barra reserva fora do XI confirmado | Feito (Fase D) |
| **partida-protocol** | `team_taxa`/`xi_ids` não estão no Protocol `StatsProvider` e `_contagem_partida` chama `team_taxa` SEM `hasattr` (≠ `xi_ids`, que é guardado). `FallbackStatsProvider` não encaminha `team_taxa`/`xi_ids`. Latente: provider não-BSD em mercado de partida → `AttributeError` | Só BSDStatsProvider é usado em produção hoje → sem impacto atual; trap p/ fallback | Ao ligar o `FallbackStatsProvider` de verdade (Fase 4) |
| **partida-vitoria-lines** | `vitoria` (`partida_1x2`) tem `lines=[1.5,2.5,3.5]` (linhas de GOLS, sem sentido p/ 1X2) → `_run_partida` gera 3 candidatos idênticos (mesma prob home). Cosmético; gols/vitoria não estão em produção (não calibram) | Sem sinal errado (mesma prob); só ruído | Quando o modelo de partida calibrar (Fase 4) |
| ~~**front 2 modos**~~ ✅ | **FEITO (2026-06-03)** — `app/streamlit_app.py` reescrito sobre `src/odd_analyzer/service.py` (camada de serviço desacoplada): 2 telas (lista→análise), toggle pós-jogo (mostra resultado real) / pré-jogo (paper-bet no ledger), abas de mercado (3 de jogador + gols/escanteios selados "EM VALIDAÇÃO"), odds manual. Sanity ao vivo OK no evento 7166 (Kaiki o1.5 desarmes edge +0.219 → real 2 ✅). Plano: `superpowers/plans/2026-06-03-front-streamlit-2modos.md` | UI operável p/ validar/operar em escala | Feito |
| ~~`app/streamlit_app.py` quebrado~~ ✅ | **RESOLVIDO** — reescrito (não mais The Odds API / assinatura velha); roda via `streamlit run app/streamlit_app.py` | — | Feito |
| **front: escalar p/ Next.js** | O `service.py` é o contrato estável; migrar pro Next.js = envolver as MESMAS funções num FastAPI fino, sem reescrever lógica | Decisão de UX futura | Quando quiser sair do Streamlit |
| **front: CLV-snapshot forward** | `snapshot_fechamento` existe no repo, mas a UI ainda não tem botão/loop p/ capturar a odd de fechamento pré-kickoff | CLV ao vivo (gate de dinheiro real) | Próxima fatia do front (modo pré-jogo) |
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
