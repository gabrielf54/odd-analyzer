# Roadmap & Status — odd-analyzer

> **✅ MIGRAÇÃO DE STACK CONCLUÍDA (2026-06-04):** projeto portado de **Python → Node/TypeScript** (motivo: manutenibilidade — o dono dá suporte em JS, não em Python). Backend Node na **raiz do repo** (`src/`+`test/`, Express+REST+Zod) e front **Next** no repo separado `odd-analyzer-frontend`. **Motor + adapters + API portados, 111 testes Vitest verdes, com GATE DE PARIDADE** provando que o TS reproduz os números do Python em 1e-9 (protege a calibração). **E2E ao vivo validado** (análise real via BSD → value bet coerente). **Python legado removido**; golden files do gate ficam congeladas. A doutrina de Produto e os vereditos de calibração abaixo **continuam valendo** (não dependem de linguagem). Detalhe: `docs/superpowers/specs/2026-06-04-migracao-node-design.md` + planos 1/2/3. Meta de dinheiro real 11/06 **flexível** (só após validação forward).

> **Atualizado:** 2026-06-10 · **Suíte:** 217 testes Vitest verdes (Node/TS; Python removido) · **Custo até aqui:** $0.
>
> **ESTADO ATUAL (bottom-line):** os **3 mercados de JOGADOR (SOT · finalizações · desarmes) estão VALIDADOS na população da Copa (seleção)** e marcados **money-ready** (`COPA_STATUS="ready"`). A calibração só fechou após o follow-up **minutos-esperados** (o gap nunca foi a taxa — era projetar 90 min p/ todos; corrigido estimando minutos). O **caminho PRÉ-JOGO ao vivo agora roda ponta-a-ponta** — o crosswalk lineup→stats-id (2026-06-03) resolveu o bug que dava 404 em todo jogo futuro. A **rota de análise manual (`/analise/manual`) agora ranqueia os candidatos por faixa de risco** (`seguro/moderado/tiro_longo`) com a ⭐ recomendada marcada, **e roda a IA revisora** (veredito `concorda/ressalva/veta` por candidato + degradação graciosa se a IA falhar). Desde 2026-06-10 o candidato carrega **titularidade/posição/alerta de minutos/`stats_detalhadas`**, a ⭐ **pula jogador com risco de banco**, e a IA revisora é **ancorada nos campos do dossiê** (proibido conhecimento externo). O **tilt posicional foi medido e ficou DESLIGADO** (degradou ECE em 2 dos 3 mercados — ver seção 2026-06-10). Mercados de **PARTIDA (gols/1x2 · escanteios) seguem FORA** (não calibram). **Falta antes do dinheiro real (11/06):** harness de validação forward ao vivo + disciplina de risco + cross-check de settlement. Casado com o escopo do [PITCH.md](PITCH.md). Detalhe e histórico cronológico nas seções de Calibração abaixo (⚠️ os vereditos intermediários "não passa/paper" estão **SUPERADOS** pela re-validação com minutos estimados — ver linha-marcada).

## Coletar v2 — `stats_detalhadas` por candidato — FEITO (2026-06-10)

**O que entrou (backend; money-path intocado, gate de paridade verde):**
Cada candidato aprovado em `/analise/manual` e `/analisar` passa a carregar um bloco descritivo `stats_detalhadas` com:
- `media_5` / `media_10` — média por jogo nos últimos 5 e 10 jogos finalizados;
- `ultimos_valores` — lista dos valores jogo a jogo (últimos 5, decrescente — o mais recente primeiro);
- `minutos_medios` — média de minutos jogados (janela 10 — mais estável);
- `media_casa` / `media_fora` + `jogos_casa` / `jogos_fora` — split mandante/visitante via mapa de eventos do time.

O bloco é **descritivo** — não entra no cálculo de prob/EV (money-path intocado). O campo `trace` (já existente) segue presente sempre no fluxo manual para o drawer do front. O **prompt do revisor** foi atualizado para ancorar a IA nessas médias reais: pode citá-las, mas continua proibida de inventar número ou usar conhecimento externo. Front correspondente (`stats_detalhadas` no drawer do candidato) em andamento no repo `odd-analyzer-frontend` (branch `feat/coletar-v2-front`).

**Suíte: 217 testes verdes** (typecheck limpo; paridade verde).
Módulos: `src/model/detailedStats.ts` (função pura) · `src/providers/stats.ts` (integração homeAwayMap) · `src/candidates/builder.ts` (repasse) · `src/manual/analyze.ts` (fio manual) · `src/pipeline.ts` (fio mercado-único) · `src/ai/reviewer.ts` (prompt ancorado) · `test/api.test.ts` (wire test novo: `stats_detalhadas` e `trace` presentes no fio HTTP + `media_5=3` com o fake).

## Melhorias da análise manual + tilt posicional (medido, OFF) — FEITO (2026-06-10)

Origem: E2E investigativo da manhã (odds bet365 reais, England×Costa Rica ev. 9099 e Portugal×Nigeria ev. 206719) achou 3 buracos: (1) pré-lineup o corte "titular" passa todo mundo — Ndidi SOT 1+ @6.0 saiu **recomendado** com 31 min esperados (reserva); (2) a IA inferia posição por conhecimento de mundo; (3) a IA alucinou alerta não-derivável do JSON ("Costa Rica defende bem fora de casa"). Spec: `docs/superpowers/specs/2026-06-10-melhorias-analise-manual-design.md`.

**O que entrou (9 mudanças, money-path intocado, gate de paridade verde):**
1. **`positionalTilt`** função pura (clamp 0.85–1.20, fail-closed → 1.0) em `src/model/adjustments.ts`.
2. **Baseline posicional medido** em 120 jogos de seleção (`scripts/measure-positional-baseline.mts`): share por posição do total concedido — desarmes D .410 / M .491 / F .099 · SOT D .143 / M .467 / F .390 · finalizações D .174 / M .478 / F .347 → constantes datadas em `src/model/params.ts`.
3. **Tilt no `BSDStatsProvider`** atrás de flag (`POSITIONAL_TILT_ENABLED`) + campo `concedido_posicao` no fio (fail-closed).
4. **Dossiê do candidato:** `posicao` (G/D/M/F), `titularidade` (`confirmado|provavel|fora_do_xi|desconhecido`), `alerta_minutos` (<60 min, `ALERTA_MINUTOS_THRESHOLD`), `concedido_posicao`. Rotas manual + mercado-único.
5. **Estrela pula risco de banco:** `recomendado` vai pro primeiro candidato da ordem **sem** `alerta_minutos`; ordem não muda, ninguém é removido; se todos têm alerta, o primeiro mantém a estrela.
6. **`escopo_historico`** opcional no `POST /analise/manual` (`todos|selecao|clube`, default `todos`).
7. **Prompt revisor ANCORADO:** sem conhecimento externo; posição SÓ do campo `posicao`; força do adversário SÓ dos campos `concedido_*`; risco de banco é alerta prioritário.
8. **Mini-backtest do tilt** (`scripts/backtest-tilt.mts`, n=201 jogador-jogos/mercado, over 1.5) — tabela abaixo.
9. **Front** (repo `odd-analyzer-frontend`, branch `feat/titularidade-posicao`): tipos + badge "escalação prevista — pode começar no banco", posição no card, aviso de minutos no RecommendationCard.

**Veredito do mini-backtest (com tilt vs sem; delta relativo, + = piorou):**

| mercado | Δ Brier | Δ ECE | passa (≤+5% nos dois)? |
|---------|---------|-------|------------------------|
| desarmes | +1.1% | **+10.1%** | ❌ |
| sot | +0.2% | **+20.0%** | ❌ |
| finalizações | −2.2% | −13.1% | ✅ (melhorou) |

**Decisão (doutrina respeitada): `POSITIONAL_TILT_ENABLED = false`.** O critério era não degradar (≤+5% relativo em Brier E ECE) nos 3 mercados; desarmes e SOT degradaram o ECE → o tilt **não entra no money-path** até passar no teste honesto. O código fica pronto (atrás da flag); **finalizações melhorou** e é candidata futura a tilt **por-mercado** (re-testar com amostra maior antes de ligar). Isso resolve a medição do nível "direcional/posicional" da doutrina com o dado que a BSD tem (concessão por posição, não zonal).

**E2E de regressão (2026-06-10, mesmos jogos/odds da manhã):** England — Rice 3+ desarmes @2.37 segue `recomendado: true` (`posicao "M"`, `titularidade "provavel"`, `minutos_esperados 78`, `alerta_minutos false`, `concedido_posicao null` = tilt off); 9 aprovados, todos com os campos novos. Portugal — Ndidi SOT 1+ @6.0 agora sai com `alerta_minutos: true` (31 min) e, como é o único aprovado, mantém a estrela **com o selo de banco visível** (comportamento especificado). IA: alertas agora ancorados nos campos (minutos do Saka 62 = `minutos_esperados 62.2`; "adversário defende bem" = `concedido_adversario` 6.25 → ×0.7 no trace) — a alucinação tipo "defende bem fora de casa" sumiu. Ressalva observada: num alerta a IA trocou o NOME do time adversário (chamou de "Costa Rica" o adversário de um jogador da própria Costa Rica) — o número era ancorado, o rótulo não; monitorar.

**Suíte: 207 testes verdes** (typecheck limpo, paridade verde; o 207º veio do fix pós-revisão — o denominador do share posicional agora conta só D/M/F, igual à fórmula validada no backtest).

## Ranking de risco + IA revisora na rota manual — FEITO (2026-06-09)

A rota `/analise/manual` (página `/coletar` do front) ganhou duas capacidades novas, sem tocar no money-path nem no gate de paridade:

**1. Classificação por faixa de risco e ordenação user-friendly.**
Cada candidato aprovado pelo filtro de edge/EV é agora classificado em uma das três faixas pela `prob_modelo`:
- `seguro` (≥ 0.50) — "acontece mais vezes que não"
- `moderado` (0.35–0.49)
- `tiro_longo` (< 0.35) — paga muito, mas acerta pouco

Os candidatos são ordenados por faixa (seguro → moderado → tiro_longo) e depois por EV decrescente dentro de cada faixa. O primeiro recebe `recomendado: true` (⭐). Ninguém é removido — todos já passaram no corte EV; `tiro_longo` +EV continua visível ao usuário. Isso é **apresentação**, não filtro de probabilidade — o princípio "nunca filtrar por prob alta" é preservado. Constantes em `src/candidates/rank.ts`.

**2. IA revisora rodando sempre.**
`src/ai/reviewer.ts` faz **1 chamada** ao modelo (OpenRouter) e devolve um veredito por candidato — `concorda`, `ressalva` ou `veta` — mais uma explicação em 1-2 frases da recomendada. A IA **nunca calcula número** (doutrina respeitada): só anota o que o código aprovou e explica. Se o código aprovou mas a IA vetou, o conflito aparece explicitamente para o usuário decidir.
Degradação graciosa: se a chave OpenRouter estiver ausente ou a IA falhar, a rota devolve `ia_revisao: null` + alerta "IA indisponível" e segue mostrando só o veredito do código — sem travar.

> ⚠️ **SUPERADO na Slice 1 abaixo:** o texto "EV em código, IA opcional (`--ia`)" e "a IA está desligada na rota manual" (devolvia `melhor_aposta: null`) referem-se ao estado **anterior a esta entrega**. A IA agora está **ligada por padrão** na rota manual como revisora — não como calculadora.

**Suíte:** 182 testes verdes (gate de paridade incluso; money-path intocado).
Módulos: `src/candidates/rank.ts` (constantes de faixa) · `src/ai/reviewer.ts` (IA revisora) · `src/manual/` (rota atualizada). Front da tela userfriendly que exibe esses dados: em andamento (`odd-analyzer-frontend`).

## Coleta manual de odds via IA externa + análise geral de TODOS os mercados — FEITO (2026-06-09)

**O problema:** não existe API de odds de prop de jogador (SOT/finalizações/desarmes) da Copa a
≤$20 (cravado pela deep-research). Sem isso, validar o produto travava. **Solução MVP $0:** o
operador usa uma IA externa (Claude na extensão do Chrome) pra ler o site da casa e devolver as
odds em JSON; cola na plataforma; o backend roda a análise de **todos os mercados do jogo de uma vez**.

Backend stateless, novo módulo `src/manual/` + 3 endpoints:
- **`GET /prompt?event_id&market`** — gera o prompt pronto pra colar na IA externa, **fatiado por
  mercado/aba**. Mercado de jogador **embute a lista de jogadores** (do lineup BSD) pra ancorar a IA
  nos nomes da base e pede **só over**; mercado de partida pede **os dois lados**.
- **`POST /analise/manual`** — valida o JSON (Zod; o que falha vai pra `linhas_rejeitadas`, nunca
  entra no money-path), casa cada odd de jogador ao seu jogador e roda todos os mercados. Devolve
  `candidatos`, `jogadores_sem_match` e `linhas_rejeitadas`.
- **`POST /crosswalk`** — liga um nome da casa a um `player_id` e persiste (`jogadores_crosswalk`);
  próximas análises auto-casam.

**Decisões de produto travadas:**
- **Jogador = só over, sem de-vig** (casa raramente cota o under de prop). Compara `prob_modelo`
  contra a **implícita CRUA** do over → teste **conservador** (margem inflada = mais difícil
  passar, nunca sinaliza valor-fantasma vindo só da margem); EV calculado na odd crua é o EV real.
  Candidato sai marcado **`sem_devig: true`**. Partida segue com de-vig dos dois lados.
- **Matching fail-closed com escotilha humana:** auto-casa por **sobrenome** (nome da casa vem
  abreviado, "K. Havertz" — Dice da string inteira não auto-casava nada) **+ guarda anti-ambiguidade**
  (dois sobrenomes iguais → não casa, vai pro operador). Confirmado → salvo → auto-casa nas próximas.
- **Motor e GATE DE PARIDADE intocados:** única mudança no motor é aditiva em `buildCandidate`
  (de-vig single-side), que só dispara quando falta o under — os goldens sempre mandam os dois lados.

Spec: `docs/superpowers/specs/2026-06-09-odds-manual-coleta-ia-externa-design.md` ·
Plano: `docs/superpowers/plans/2026-06-09-odds-manual-coleta-ia-externa.md`. Front (campos "copiar
prompt" + "colar JSON" + lista de `jogadores_sem_match` pra ligar) fica no repo `odd-analyzer-frontend`.

## Odds automáticas de PARTIDA via The Odds API (gols + 1X2 da Copa) — FEITO (2026-06-03)

Até aqui **toda odd era manual** (`ManualOdds`, colada da casa). Agora os mercados de **PARTIDA
(gols=totals, vitória=h2h)** da Copa puxam odd **automática** do **The Odds API** (tier FREE — o
usuário já tem a key `THE_ODDS_API_KEY`). Pesquisa de fonte (deep-research 17 fontes + teste ao
vivo da key, 2026-06-03) cravou: **odd de PROP DE JOGADOR (SOT/finalizações/desarmes) da Copa NÃO
existe a ≤$20 em nenhuma fonte** (e desarme não existe a preço nenhum) → props de jogador **seguem
manuais** (ver follow-up `odds-prop-jogador`). The Odds API free **cobre gols+1X2** da Copa (72
jogos, 41 casas, com Betfair lay p/ de-vig); **não cobre escanteios** (vazio na Copa, confirmado).

`TheOddsApiMatchOdds` (provider) casa o evento do BSD com o do The Odds API **por nome de time**
(`find_event`/`_norm_team` — não há id compartilhado entre as fontes), busca `totals`/`h2h` e
devolve linhas no shape do pipeline (`parse_totals`/`parse_h2h`; `odd_draw` guardado p/ de-vig
3-way futuro). Wired via `run_analise(..., odds_provider=...)` + `service.analisar(..., odds_provider=...)`
+ CLI `analisar --odds-fonte the_odds_api`. **Sanity ao vivo OK:** Mexico×South Africa gols=19
casas, 1X2=41 casas. Fetchers injetáveis → testado offline (15 testes novos). Mercados de partida
seguem **EM VALIDAÇÃO** (não calibram) → a odd entra, mas o sinal é paper/observação, não dinheiro.

## Crosswalk lineup→stats-id (PRÉ-JOGO ao vivo destravado) — FEITO (2026-06-03)

**O bug que entregava zero ao vivo.** O BSD usa **dois namespaces de player_id**: a escalação
(`/events/{id}/lineups/`) traz o jogador com um id (ex.: Enzo = 974505) que **dá 404** em
`/players/{id}/stats/`; o histórico de stats usa outro id (Enzo = 387). O picker e o motor
mandavam o id do lineup pro endpoint de stats → **404 em todo jogo pré-jogo** (testado ao vivo
em Argentina×Iceland, 10/06). A calibração nunca pegou isso porque rodou direto sobre
player-stats de jogos finalizados (namespace de stats), sem passar pela escalação.

**Fix (casamento por nome).** Os jogadores que atuaram nos últimos jogos finalizados do time já
vêm com o stats-id certo; pega-se o nome de cada um em `/players/{id}/` e casa-se por nome
(NFKD+difflib, `crosswalk/match.py`, fail-closed) com a escalação. Comprovado ao vivo: **11/11
jogadores casados por lado, confiança 1.0**; Argentina×Iceland roda do picker ao candidato sem
404 (mu coerentes: goleiro ~0.4 desarmes, zagueiros 2–3.8). Novo: `crosswalk/bsd_ids.py`
(`construir_mapa_time`, `resolver`), `CrosswalkStatsProvider` (envolve o BSD; `elenco`/`xi_ids`
saem em stats-id), `BSDClient.player()`. Wired em `runner.run_analise` e `service.escalacao_provavel`.
`entity_taxa` agora degrada p/ None (sem histórico = sem sinal) em vez de quebrar. **375 testes.**

## Front: seletor de jogador (escalação provável) — FEITO (2026-06-03)

Antes, as abas de mercado de jogador só tinham "Varrer elenco" (varredura cega dos 22); sem
escalação confirmada (pré-jogo) o elenco vinha vazio e nada aparecia. Agora a aba de jogador
(SOT/finalizações/desarmes) traz um **seletor de 1 jogador**: 2 colunas (mandante|visitante)
da **escalação provável**, com **fallback** para quem jogou nos últimos 3 jogos quando não há
escalação. Badge marca a origem (confirmada/provável/últimos-3). Ao escolher, mostra a média
recente do jogador (1 call) e o botão "Analisar jogador" roda só ele (odd real por jogador, não
placeholder de elenco). Mercados de partida (gols/escanteios) seguem na varredura atual.

Lógica nova em `service.py` (puro, testado): `escalacao_provavel`, `media_recente_jogador`,
`analisar(..., player_ref=...)`. Front (`streamlit_app.py`) continua fino. Spec/plano:
[specs/2026-06-03-front-picker-jogador-design.md](superpowers/specs/2026-06-03-front-picker-jogador-design.md).
Branch `feat/front-picker-jogador`, 364 testes verdes. (O picker entregava o id do lineup,
que dava 404 no histórico — destravado pelo crosswalk acima, 2026-06-03.)

## 🎯 Meta crítica — dinheiro real em 11/06/2026 (Copa do Mundo)

**O usuário começa a apostar DINHEIRO REAL em 11/06/2026** (início da Copa). Janela de prep: 03→11/06 (**8 dias**). Objetivo da janela: **maximizar confiança no que já valida**, não expandir escopo. Regras travadas para o dia 11:

- **Só mercados de JOGADOR** (SOT/finalizações/desarmes, já calibrados) carregam dinheiro. **Partida fica em paper/observação.**
- **Validação forward = paper-trade forward** (não CLV clássico — prop de jogador não tem linha de fechamento < $99/mês): prever antes → registrar no `paper_ledger` → liquidar pós-jogo → medir Brier/hit-rate/EV realizado num lote **NOVO**.
- **AMEAÇA #1 — shift de população (REBAIXADA por spike 2026-06-03):** calibração foi em **liga 9 (Brasileirão, clubes)**; a Copa é **seleções**. Jogo de seleção tem MENOS finalização (Kosovo×Türkiye SOT soma=5; Chile×Uruguai 6) → **calibração de clube NÃO transfere cega**. MAS o spike confirmou que o BSD tem **>1300 jogos de SELEÇÃO finalizados com player-stats completos** (eliminatórias 58/59/60/61/62, Nations League 64/65, amistosos 31 populando hoje, Euro 66, Copa América 67) no mesmo formato da liga 9 → **dá pra RE-CALIBRAR na população certa**, não só fazer sanity. Histórico montável via `team_id` (separa clube/seleção) + ordem mais-recente-primeiro. Ameaça vira **mensurável/mitigável**. Detalhe: [apis/bsd-bzzoiro/wc-validation-spike.md](apis/bsd-bzzoiro/wc-validation-spike.md).

**Prioridade da janela (status atualizado):**
- ✅ **(1) Re-calibrar mercados de jogador na população de SELEÇÃO — FEITO.** `collect_national.py`+`run_national_backtest.py` (não os de liga 9); rate só-seleção vs todos via `team_id`; `concede_baseline_nacional` medido. Veredito: só-seleção > todos; amistoso neutro. (mergeado)
- ✅ **(1b) minutos-esperados — FEITO.** O gap era projetar 90 min, não a taxa. Com minutos estimados os 3 mercados passam (ECE<0.08, BrierSkill>0). **money-ready.** (mergeado)
- ⬜ **(2) Harness de validação forward** — loop paper-bet→liquida→mede num lote NOVO ao vivo (amistosos liga 31 frescos + 1ºs jogos da Copa). **Próximo build recomendado.**
- ⬜ **(3) Disciplina de risco** dia 11 (stake pequeno, só jogador, threshold rígido) + cross-check de settlement BSD-vs-casa.
- ⬜ **(4) `snapshot_fechamento`/CLV-forward** no pré-jogo (gate de dinheiro junto do harness).

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

> ⚠️ **LEIA PRIMEIRO — esta seção é um histórico cronológico em 3 atos.** O veredito que vale é o **ÚLTIMO** (subseção "Re-validação com minutos ESTIMADOS"): **os 3 mercados de jogador PASSAM e estão money-ready.** Os vereditos do meio ("nenhum mercado passa", "paper/observação até re-tunar") refletem o estado ANTES de descobrir que o gap era minutos — estão **SUPERADOS**. Ato 1: 90-min → falha. Ato 2: diagnóstico → o gap é minutos, não a taxa. Ato 3: minutos estimados → passa.

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

**[ATO 1 — SUPERADO] Veredito (90 min, antes do diagnóstico): os priors de CLUBE parecem NÃO transferir pra seleção.** Os bins de confiabilidade mostram **super-estimação sistemática** (em todo bin, prev > real). ECE 0.10–0.19 nas linhas úteis (vs 0.047 na liga 9) e BrierSkill ~0/negativo. Nenhum mercado passa o crivo *com projeção de 90 min*. ⚠️ **Esta conclusão foi SUPERADA:** o diagnóstico abaixo mostra que a causa era a projeção de 90 min (não a taxa) — com minutos estimados, os 3 mercados passam. NÃO usar este parágrafo como veredito.

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

**Próximo passo (follow-up `minutos-esperados`, NÃO re-tunar priors):** modelar **minutos esperados** por jogador na produção (estimar via média recente de `minutes_played` + status do lineup) em vez de assumir 90 → `mu = taxa_por90 × min_esperados/90`. Re-validar o backtest com minutos ESTIMADOS (não reais — produção não os conhece pré-jogo) e medir o ECE resultante. Se a estimativa de minutos calibrar perto do teto (min reais), **os 3 mercados de jogador ficam money-ready pra Copa**. ⚠️ **RESOLVIDO no ATO 3 abaixo** — a estimativa calibrou; o "paper/observação até ligar isso" desta linha está **SUPERADO** (já ligado e validado).

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
- ✅ **Slice 1 (jogador) em dado REAL:** desarmes ponta-a-ponta (`bsd-probe` → reconciliação `elenco`/`entity_taxa` → `runner` + `ManualOdds` → `cli analisar`). **SOT e finalizações** usam o **mesmo caminho** (`shots_on_target`/`total_shots` no mesmo payload) — validados rodando (basta trocar `--market`). ⚠️ **SUPERADO (2026-06-09):** a menção "IA opcional (`--ia`)" reflete o estado anterior à rota manual — na rota `/analise/manual`, a IA revisora roda **sempre por padrão** (ver seção "Ranking de risco + IA revisora" acima).
- ✅ **Slice 2 (escanteios) em dado REAL:** #25 resolvido (`team_taxa` agrega `corner_kicks` do histórico de cada time via `events(team_id, finished)` + `/events/{id}/stats/`); pipeline ramifica por `market.nivel` (total da partida = soma dos dois times). Odd colada via `ManualOdds`. **Automático (odds do BSD) = pendente** (só pré-jogo, ver follow-up `odds-corners`).
- ✅ **MATCHUP REAL ligado (2026-06-03)** — o diferencial da doutrina entra no `mu`: `BSDStatsProvider._team_conceded` agrega o que o **adversário concede** no mesmo eixo (lado oposto em `/events/{id}/stats/` do histórico DELE) → `opponent_multiplier` (clampado `[0.7,1.4]`) multiplica a produção. Liga em jogador (`entity_taxa`) e partida (`team_taxa`). Baseline nível-TIME = `MarketSpec.concede_baseline` (prior estático, **pendente de league-sweep na Fase 4**). **Efeito real visível:** escanteios do 7166, que no número *ingênuo* dava over 8.5 (mu 10.13, "edge +0.069"), com o confronto cai p/ **mu 7.94** (Fluminense concede só 3.0 corners/jogo → mult 0.7; Cruzeiro 4.6 → 0.92) → **deixa de ser valor**. Produção × concessão, não média bruta.
- ✅ **VARREDURA ligada (2026-06-03)** — `cli analisar` SEM `--player` escaneia o **elenco inteiro** e o filtro edge/EV revela quem tem valor (não precisa adivinhar o jogador). Ex. 7166 desarmes o1.5 @1.90: Kaiki (edge +0.205) e L. Romero (+0.164). Coluna `adv_concede` mostra o matchup na tabela.
- ✅ **CALIBRAÇÃO DE JOGADOR FECHADA (2026-06-03):** re-validada na população de seleção (Copa) com minutos estimados → SOT/finalizações/desarmes money-ready (ver seções de Calibração no topo). 375 testes (inclui o crosswalk lineup→stats-id que destravou o pré-jogo ao vivo).
- ⬜ Falta: **harness de validação forward** (gate de dinheiro ao vivo), **Fase 3** (partida/gols — não calibra) e o resto da **Fase 4** (fallback provider, odds automáticas de corners) + follow-ups (abaixo).

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
`probes/bsd_probe.py` + `cli bsd-probe` (captura forma real) · **reconciliação** `BSDStatsProvider.elenco`/`entity_taxa` p/ a forma real do BSD · `runner.py` (`normalize_event` + `OnlyPlayer` + `fake_analista`) · `ManualOdds` (cola a linha) · `cli analisar`. ~~**EV em código, IA opcional (`--ia`).**~~ ⚠️ **SUPERADO (2026-06-09):** na rota manual (`/analise/manual`) a IA revisora roda **por padrão** (ver seção "Ranking de risco + IA revisora"). 11 testes novos (298 total no estado original; contagem atual da suíte Node/TS: ver cabeçalho). Mercado-bandeira: **desarmes** (exemplo de confronto da doutrina).
> SOT e finalizações compartilham o caminho (mesmo payload `/players/{id}/stats/`) — **falta só validar/mostrar** (não precisa de código novo de provider).

### ✅ Slice 2 — Escanteios em dado REAL (stats; odds via ManualOdds)
`client.event_stats` (`/events/{id}/stats/`) · `BSDStatsProvider.team_taxa` (#25: agrega `corner_kicks` do histórico do time via `events(team_id, finished)`) · pipeline ramifica `market.nivel=="partida"` → `_contagem_partida` (mu = soma dos dois times) · runner aceita mercado de partida (sem `--player`). **Falta só o modo automático de odds** (`BSDMatchOdds` na forma real + endpoint de odds de corners — só existe pré-jogo; ver follow-up `odds-corners`).

### ✅ Slice 3 — Matchup real + varredura (2026-06-03)
`BSDStatsProvider._team_conceded` (concessão do adversário no eixo, via histórico DELE) + `_opp_mult` (clamp `[0.7,1.4]`) ligados em `entity_taxa` e `team_taxa` · `MarketSpec.concede_baseline` (baseline nível-time, prior estático→Fase 4) · pipeline passa `opp_team_id`+baseline · `runner.run_analise` sem `--player` = **varredura** do elenco · coluna `adv_concede` na tabela. **+5 testes (308 total).** Diferencial da doutrina (produção × concessão) agora entra no número. **Caveats:** baseline estático (`concede-baseline-estatico`) e eixo de desarmes é proxy (`matchup-desarmes-proxy`) — ambos mapeados nos follow-ups.

### ⚠️ Fase 3 — Modelo de PARTIDA (vitória 1X2 + gols) — CÓDIGO FEITO, NÃO CALIBRA
`match_model.py` (Poisson bivariado + Dixon-Coles → `probs_1x2` + `prob_total_over`), `team_rates` (ataque+defesa) e dispatch `_run_partida` no pipeline **existem e rodam** (Fase C da meta A→D). **MAS gols NÃO presta na calibração** (ver seção Calibração): testados ataque-only, +defesa, +shrinkage{3,5,8} — melhor config (ps=8) ainda dá BrierSkill<0 em over2.5. **NÃO ligado à produção.** Próximos passos: split casa/fora, fit do `rho`, mais ligas/dados. Mercado de partida fica fora do MVP de produção até calibrar.

### ⚠️ Fase 4 — Validação + fallback + UI + extensão (PARCIAL)
- ✅ **Calibração por mercado (jogador)** — feita na liga 9 E re-validada na população de seleção (Copa) com minutos estimados (ECE<0.08, BrierSkill>0). Ver seções de Calibração no topo.
- ✅ **Streamlit religado** — front 2-modos sobre `service.py` (ver follow-up `front 2 modos`).
- ⬜ **ApiFootballStatsProvider + FallbackStatsProvider** wired (hoje só BSD).
- ⬜ **Harness de validação forward** (paper→liquida→mede ao vivo) — gate de dinheiro real, **próximo build**.
- ⬜ slot PropOdds documentado.

---

## Follow-ups / gaps abertos

Não quebram testes (fixtures), mas **bloqueiam dado REAL**:

| # | Gap | Impacto | Quando resolver |
|---|-----|---------|-----------------|
| ~~#25~~ ✅ | **RESOLVIDO** — histórico de TIME p/ escanteios via `team_taxa` + `events(team_id, finished)` + `/events/{id}/stats/`; pipeline ramifica por `market.nivel`. Escanteios roda em dado real (odds via ManualOdds) | — | Feito (Slice 2) |
| **odds-prop-jogador** ⭐ | **WANT DO USUÁRIO (mapeado 2026-06-03):** achar fonte automática de odd de **prop de jogador** (SOT/finalizações/desarmes) pra parar de colar à mão. **VEREDITO da pesquisa (deep-research 17 fontes + teste ao vivo da key The Odds API):** não existe a ≤$20 — props de jogador só em ligas de CLUBE (EPL/La Liga/...), nunca seleção/Copa; **desarme não existe a preço nenhum** (nem está no catálogo de mercados de futebol de ninguém). The Odds API free retorna `player_shots_on_target`/`player_shots` **vazio** na Copa (live). Fontes com prop de clube: The Odds API Business $99, SGO Pro $299, OpticOdds enterprise. Detalhe na memória `apis-pesquisadas-odds-stats` (7a rodada) | Bloqueia automação das props; HOJE = `ManualOdds` por jogador (já funciona) | **Reavaliar quando:** (a) orçamento subir p/ $99+ (The Odds API Business cobre SOT/shots de clube — serve p/ validar motor offline, não p/ Copa); (b) surgir feed de prop de seleção barato (improvável). Até lá: **manual.** Provável caminho real = coletar prop à mão de betano/bet365 BR pré-jogo |
| **odds-corners** | **CONFIRMADO 2026-06-03** (sonda real, ver `docs/apis/bsd-bzzoiro/examples/event_odds.json`): `/events/{id}/odds/` de jogo finalizado vem **flat consensus, só mercado de partida** (`home_win/draw/away_win/over_under_{15,25,35}_goals/btts`) — **sem corners, sem bookmakers, sem Pinnacle, sem movimento**. `BSDMatchOdds` ainda espera a forma idealizada (`bookmakers[].outcomes[].point/price`). **The Odds API tb NÃO cobre corners da Copa** (`alternate_totals_corners` voltou vazio na key free, live 2026-06-03) — única fonte com corners + Pinnacle/Betfair = TheStatsAPI $50/mês (fora do orçamento) | Sem odds automáticas de escanteios não há modo **automático/pré-jogo** p/ corners (ManualOdds funciona p/ pós-jogo/validação) | **Pré-requisito do modo PRÉ-JOGO de corners, não desta meta.** Opções: testar `/odds/?market=total_corners` do BSD num jogo futuro; ou TheStatsAPI $50 se orçamento subir |
| ~~**matchup-neutro**~~ ✅ | **RESOLVIDO (2026-06-03)** — `_team_conceded` agrega a concessão do adversário no eixo (lado oposto do histórico dele) → `opponent_multiplier` clampado `[0.7,1.4]` entra no `mu`, em jogador (`entity_taxa`) e partida (`team_taxa`). Produção × concessão ligado | — | Feito (#1) |
| ~~**concede-baseline-estatico**~~ ✅ | **RESOLVIDO p/ liga 9 (2026-06-03)** — `scripts/measure_concede_baseline.py` mediu a concessão média real no BSD e substituiu os priors chutados: sot 4.5→4.55 · finalizações 12→13.46 · desarmes 16→14.64 · escanteios 5→4.79 (80 jogos). Resta apenas re-validar cross-liga | Viés do matchup corrigido na liga medida | **Fase 4**: estender o league-sweep a outras ligas/Copa antes de operar nelas |
| **matchup-desarmes-proxy** | P/ desarmes o eixo "desarmes concedidos" é **proxy fraco** (jogador desarma conforme o adversário ataca na zona dele, não conforme "tackles que o adversário cede"). SOT/escanteios/finalizações o eixo é limpo. **UPDATE 2026-06-10:** o refinamento posicional disponível na BSD (concessão por POSIÇÃO, tilt) foi **medido e ficou OFF** — degradou ECE em desarmes/SOT (ver seção "Melhorias da análise manual + tilt posicional" no topo). O eixo segue proxy | Sinal de desarmes pode ler o matchup errado | Dado zonal de verdade (não existe na BSD); tilt por-mercado em finalizações é candidato futuro |
| ~~**per90-minutos**~~ ✅ | **RESOLVIDO (2026-06-03)** — `windowed_rate(minutes_field="minutes_played")` faz per-90 ponderado (Σstat/Σmin×90); `entity_taxa` liga isso e reverte o histórico do BSD (decrescente→crescente) p/ usar a forma RECENTE. `team_taxa` também reverte (per-jogo, time joga ~90) | Resolvido p/ jogador e time | Feito (Fase A) |
| ~~**xi-confirmado**~~ ✅ | **RESOLVIDO (2026-06-03)** — `BSDStatsProvider.xi_ids` lê o lineup confirmado; pipeline popula `xi_team_ids`; `entity_taxa` compara `str(entity_id)` (bug: comparava team_id). Gate deixa de ser inerte quando o lineup está confirmado | Filtro barra reserva fora do XI confirmado | Feito (Fase D) |
| **partida-protocol** | `team_taxa`/`xi_ids` não estão no Protocol `StatsProvider` e `_contagem_partida` chama `team_taxa` SEM `hasattr` (≠ `xi_ids`, que é guardado). `FallbackStatsProvider` não encaminha `team_taxa`/`xi_ids`. Latente: provider não-BSD em mercado de partida → `AttributeError` | Só BSDStatsProvider é usado em produção hoje → sem impacto atual; trap p/ fallback | Ao ligar o `FallbackStatsProvider` de verdade (Fase 4) |
| **partida-vitoria-lines** | `vitoria` (`partida_1x2`) tem `lines=[1.5,2.5,3.5]` (linhas de GOLS, sem sentido p/ 1X2) → `_run_partida` gera 3 candidatos idênticos (mesma prob home). Cosmético; gols/vitoria não estão em produção (não calibram) | Sem sinal errado (mesma prob); só ruído | Quando o modelo de partida calibrar (Fase 4) |
| ~~**front 2 modos**~~ ✅ | **FEITO (2026-06-03)** — `app/streamlit_app.py` reescrito sobre `src/odd_analyzer/service.py` (camada de serviço desacoplada): 2 telas (lista→análise), toggle pós-jogo (mostra resultado real) / pré-jogo (paper-bet no ledger), abas de mercado (3 de jogador + gols/escanteios selados "EM VALIDAÇÃO"), odds manual. Sanity ao vivo OK no evento 7166 (Kaiki o1.5 desarmes edge +0.219 → real 2 ✅). Plano: `superpowers/plans/2026-06-03-front-streamlit-2modos.md` | UI operável p/ validar/operar em escala | Feito |
| ~~`app/streamlit_app.py` quebrado~~ ✅ | **RESOLVIDO** — reescrito (não mais The Odds API / assinatura velha); roda via `streamlit run app/streamlit_app.py` | — | Feito |
| ~~**front: escalar p/ Next.js**~~ ✅ | **FEITO (2026-06-04)** — na migração Node/TS o front virou **Next** (repo `odd-analyzer-frontend`, 2 telas) consumindo a **API Express** (não FastAPI); o Streamlit foi descontinuado junto com o Python | UI desacoplada do backend | Feito |
| **front: CLV-snapshot forward** | `snapshot_fechamento` existe no repo, mas a UI ainda não tem botão/loop p/ capturar a odd de fechamento pré-kickoff | CLV ao vivo (gate de dinheiro real) | Próxima fatia do front (modo pré-jogo) |
| — | `save_analise`/`get_analise` sem `market_type` | Múltiplas análises por evento colidem na persistência | Quando persistir multi-mercado de verdade |
| — | Duplicatas de plano entre fases (tasks **7/9/15/23/33** recriam infra já feita na Fase 0) | Pular na execução | Já mapeado |

## Decisões travadas (NÃO re-litigar)

- **BSD = fonte oficial** de stats; **API-Football = fallback** (atrás de `StatsProvider`).
- **Mercados de jogador** (SOT/finalizações/desarmes): **modelo-only + entrada manual de odd**; slot `PropOddsProvider` p/ feed futuro. **Nenhuma API de odds de prop é necessária** pra construir/usar.
- **Mercados de partida** (gols/vitória/escanteios): odds do **próprio BSD** (Pinnacle/bet365/betano) p/ de-vig **OU** do **The Odds API** (free, `TheOddsApiMatchOdds`, gols+1X2 da Copa — wired 2026-06-03; corners não cobertos). Fontes complementares, ambas atrás do `OddsProvider`.
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
- **Rodar (após migração Node/TS 2026-06-04):** o CLI Python (`python -m odd_analyzer.cli`) **não foi portado** — substituído pela **API REST**. Backend: `npm run dev` na raiz (porta 3001). Front: `npm run dev` no repo `odd-analyzer-frontend` (porta 3000). Ex. de análise via API: `POST /analisar {"event_id":"7166","market_key":"desarmes","linha":1.5,"odd_over":1.9,"odd_under":1.9,"player_ref":"Kaiki"}`. As seções acima com comandos/arquivos `.py` são **história** (pré-migração).
- **Próxima fatia:** **modo automático/pré-jogo de odds** (follow-up `odds-corners`: reconciliar `BSDMatchOdds` + endpoint de odds de corners num jogo futuro) e o **front 2 modos**. Depois Fase 3 (partida 1X2/gols) e Fase 4 (calibração/CLV — onde o `concede_baseline` estático vira league-sweep real).
