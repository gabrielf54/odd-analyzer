# CORE — O Cérebro do odd-analyzer

> **ESTE É O DOCUMENTO VIVO ÚNICO.** Objetivo + doutrina + features que existem + próximas
> features (Copa / pós-Copa) + o que NÃO re-tentar. **Atualize-o a CADA feature** (estado,
> veredito, escopo). Regras de **código/engenharia** ficam no [`CLAUDE.md`](../CLAUDE.md);
> **referência de dado/custo** em [`docs/apis/`](apis/). Detalhe de cada feature **pendente** vive em
> [`docs/features/`](features/) (uma pasta por feature) — **a pasta é APAGADA quando a feature shipa**
> (a essência sobe pra §3 e o git guarda o detalhe). Ver a regra de não-poluição no `CLAUDE.md`.
>
> **Atualizado:** 2026-06-22 (**CLV AGREGADO POR MERCADO (TDD, 511 testes back + 100 front, gate intacto):**
> o CLV por jogo (`GET /jogos/:id/clv`) já existia, mas o `report.ts` mostrava o CLV agregado como `n/d`.
> Agora há o **CLV médio por `market_type` entre TODOS os jogos**: função PURA `aggregateClvByMarket`
> (`src/backtest/clvByMarket.ts`, reusa `lineupEdge` p/ média + IC bootstrap + n) + serviço
> `clvPorMercadoService` (percorre o `paper_ledger`, casa cada aposta aos retratos do seu evento como o
> `clvService`, calcula o CLV-total entrada→fechamento via `clvSegments`, agrega) + `GET /clv/por-mercado`
> + painel **CLV POR MERCADO** no `report.ts` + **tela `/clv`** no front (`ClvMarketPanel`, só-leitura,
> verde = a meu favor, selo de confiança pelo IC). **Limitação anotada (honestidade, não escondida):** CLV
> só existe p/ prop com odd de entrada; gols/vitória (forwardLog, `odd_flag=null`) ficam de fora; medir
> EDGE exige odds dos 2 lados (gap da Rec 1). Branch `feat/clv-por-mercado`.) · 2026-06-22 (**AGENDADOR 24h IN-PROCESS (TDD, 498 testes back + 96 front, gate intacto):**
> subir a API liga um daemon (`src/scheduler/`) que coleta odds nos marcos de cada jogo da Copa (abertura/
> deriva/**salto da escalação**/fechamento) + roda `forwardLog`/`settle` em varredura, **sozinho e sem custo**
> (sem Claude, sem OpenRouter). Núcleo PURO (`plan`/`lineupWatch`) + casca (`runner`): fila serializada,
> dedup restart-safe, erro isolado. Diário `scheduler_runs` + `mark`/`origem` em `odds_snapshots` (migrações
> aplicadas) + `GET /scheduler/status` + painel **Agendador** no front. Portas trocadas (back **5926**/front
> **5927**, fora das genéricas). Ver §3.2 + `docs/superpowers/`.) · 2026-06-22 (**VALIDAÇÃO HONESTA + CLV AUTOMÁTICO (TDD, 463 testes, gate intacto):**
> (1) **Painel de validação no `report.ts`** (`src/backtest/validation.ts`): **modelo×casa** (Brier do nosso
> número × o de-vig da casa, ambos vs resultado — só linhas de 2 lados) revela que **a CASA ainda ganha em
> gols/vitória** (sem edge mensurável); **IC 95% por bootstrap** no BrierSkill revela que **TODOS os skills
> positivos cruzam o zero** (n pequeno) → protege de graduar por sorte. Bater a média ≠ bater a casa. (2)
> **CLV DERIVADO ciente da ESCALAÇÃO** (`src/backtest/clvSegments.ts` + tabela `odds_snapshots`): cada coleta
> FOTOGRAFA as odds no histórico IMUTÁVEL (com `lineup_status` do momento); o CLV é CALCULADO na LEITURA
> (`clvService` → `GET /jogos/:id/clv`), segmentado em pré-escalação / **salto-da-escalação** / pós / total +
> recomendação de TIMING (apostar pré-escalação quando o IC do salto não cruza zero). Desacoplado da coleta —
> coletar N vezes só acrescenta retratos, NÃO contamina. Aba "CLV · Linha" no front. **Substituiu a 1ª versão
> por-gatilho (`clvCapture.ts`), que acoplava coleta×CLV e era frágil — REMOVIDA.** Migrações
> `create_odds_snapshots` + `add_fechamento_em`. Spec/plano em `docs/superpowers/`.
> (3) **odds 2 lados (Rec 1) ESCOPADO**: pipeline já suporta `odd_under`; KTO captura, mas Betnacional/Betano/
> Stake/Superbet só pegam o over → falta parsing por-casa com payload real (ritual `IMPLEMENTAR-CASA.md`) p/
> destravar edge/CLV em player props. Branch `feat/validacao-edge-clv-odds`.) · 2026-06-22 (**FORWARD LIMPO — 2 bugs de MEDIÇÃO consertados (TDD, 452 testes,
> gate de paridade intacto), não o motor:** (1) **settle da vitória** liquidava os 3 lados (1/X/2)
> como "mandante venceu?" → (2)/(X) recebiam resultado ERRADO; `settleMatchRows` agora lê o lado do
> rótulo → vitória forward **BrierSkill −0.33→+0.14** (ECE 0.26→0.10). (2) **gate de minutos no settle**
> (≥60min, espelha a calib offline) + limpeza retroativa de **112 linhas DNP** (reserva/banco logado como
> aposta, ex.: Berhalter 16') → **sot +0.016→+0.26** (linha validada disse 28%/real 26%, calibrado),
> **faltas +0.18→+0.31**. Resíduo REAL único: **finalizações over-prediz seus picks de edge** (linha
> validada disse 40%/real 17%, n=35) = **maldição do vencedor** (edge>0 seleciona os exageros) + viés
> de zagueiro; offline a banda é ~OK → NÃO mexer no μ, precisa de forward limpo p/ calibrar o corte de
> edge (não overfitar n=35). **NADA gradua ainda** (ECE>0.05/n modesto); o loop agora acumula HONESTO.
> Ver §3.1 e [`forward-loop-copa`](features/forward-loop-copa/)) · 2026-06-15 (**PAINEL DE ATAQUE + round de validação** — montado o painel em
> [`features/mercados-nao-validados/`](features/mercados-nao-validados/) com protocolo anti-retrabalho;
> round offline ($0): **escanteios-produção, faltas-R-por-linha e o EIXO DIRECIONAL inteiro REPROVARAM**
> → §5. O **eixo direcional (a "alma do produto") está MORTO com prova** — StatsBomb (dado posicional rico,
> grátis), chutes E desarme-por-flanco, **placebo-tested**: não é falta de dado, é falta de sinal; matchup
> fica por-mercado. Forward operado [gols n=43 BrierSkill +0.16]. **Vitória miscalibrava (ECE 0.32, probs
> extremas tipo `Iran×NZ 85%/16%`) → causa-raiz: time de histórico raso caía no fallback média-crua cego
> que invertia o mismatch → FIX shipado (floor=1 usa o rating, não o fallback; + `shrinkK=3`; TDD, 430
> testes verdes, gate de paridade intacto); `Iran×NZ`→60%/50% são.** Ver §Experimentos 2026-06-15 e §3.1)
> · 2026-06-15 (**4ª casa de coleta: Stake** — motor de preço PRÓPRIO [1ª fonte independente
> = diversidade real], headless p/ JA3, de-para por `marketId` base; rito E2E `docs/coleta-odds/IMPLEMENTAR-CASA.md`
> — ver INFRA abaixo)
> · 2026-06-15 (**odds unificadas** — tabela `odds_unificadas` = espelho canônico do cru
> [line shopping por identidade], re-gerado a cada escrita; a análise consome ELA; tela única decisão+log
> + botão "Unificar odds"; line shopping agrupa por identidade normalizada — ver §3.2)
> · 2026-06-14 (**casamento odd↔jogador robusto** — squad = elenco completo, não só o
> XI; `normalize` entende "Sobrenome, Nome"; mononímico; 90→6 sem-match no Spain×Cabo Verde — ver §3.2)
> · 2026-06-12 (varredura de calibração: **prior+dispersão por posição REPROVADO** p/
> as linhas mortas de jogador — é variância de cauda, não posição; **RATINGS tipo Elo no λ de partida
> VENCE** — primeira alavanca que calibra gols/1X2, candidatos a graduar pós-productionização+forward;
> escanteios-concessão reprovado; **COMBINADO de contexto (posse/mismatch/mando) testado out-of-fold:
> só finalização CLUBE ganha (posse+mando), desarme/falta/SOT redundantes → §5; finalização na
> prateleira pro clube + registro-sombra forward na Copa**. Provas em
> [`mercados-nao-validados`](features/mercados-nao-validados/))
> · 2026-06-11 (auditoria de
> calibração de TODOS os mercados, no ponto de aposta — ver §3.1) · **Suíte:** 430 testes Vitest
> verdes (gate de paridade intacto) · **Custo até aqui:** $0 · **Arena ativa:** Copa do Mundo 2026
> (seleções), abriu 2026-06-11; **clube ATIVO** (auditado). **Ratings de força no λ de partida
> PRODUCTIONIZADOS 2026-06-12** (`src/model/ratings.ts` + `pipeline.runMatch`, com fallback) ·
> **SOT por DECOMPOSIÇÃO PRODUCTIONIZADO 2026-06-12** (base total_shots × taxa-no-alvo; settle/
> display/concessão em shots_on_target — melhora a estrela 0.5; consertou bug de settle do desarme).

---

## 1. Objetivo & doutrina (inegociável)

**Em uma frase:** para um jogo com odds, o sistema compara a **probabilidade do nosso modelo**
(calculada em **código**) com a **odd da casa sem a margem** (de-vig) e **só sinaliza quando o
modelo está claramente à frente** — e só em mercado/linha **validado na população do jogo**. A
IA escreve a explicação; **nunca inventa o número**.

1. **Valor = `prob_modelo > prob_devig`** (EV/edge positivo). **NUNCA** filtrar por "probabilidade
   alta" — selecionar favoritos é −EV sistemático, **proibido**.
2. **A IA explica e julga; NÃO calcula número.** O número vem do código (`model/`/`value/`).
3. **Validação-primeiro, sem auto-engano:** calibração offline (Brier/ECE/leave-one-out) → CLV
   forward → só então vira aposta de valor recomendada. Ideia que não dá pra validar **não entra
   no money-path**.
4. **Poucas oportunidades fortes > muitas fracas.** Se não há aposta de valor no jogo, o honesto é
   **dizer que não tem** — não forçar.
5. **Gate de paridade 1e-9** (`test/parity/`): mudança no money-path não quebra as golden sem
   re-congelar de propósito. **Não quebrar `npm test`.**

**Mentalidade de análise — o diferencial:** o modelo **não olha média bruta, olha o CONFRONTO**.
Todo sinal nasce do encaixe **oferta × concessão no mesmo eixo**:
`μ_base(quem produz a ação) × multiplicador_concessão(adversário no mesmo eixo) → P(evento) →
compara com odd de-vig`. Ex.: time que ataca pela direita + lateral-direito adversário que desarma
muito → over desarmes daquele lateral tem valor.

**Arena:** Copa 2026 (validação forward ao vivo) → depois **ligas de clube** (ver §4 pós-Copa).
**Custo:** ~$20; só o dado BSD já assinado. Não pagar fonte cara.

## 2. Como funciona (money-path, 1 parágrafo)

Forma do jogador (per90, janela 3/5/10 ponderada por minutos) → **encolhimento** bayesiano p/ a
média → **× multiplicador de concessão** do adversário (e mando) → **μ** → **NB2** dá P(X≥linha)
para contagem (sot/finalizações/desarmes/escanteios); gols/1x2 usam Poisson de partida → **de-vig**
tira a margem da odd → **edge & EV** → cortes (edge≥0.04, ev≥0.05, amostra≥10, titular) → **ranking**
por risco com a ⭐ no melhor **pronto** (titular confirmado + mercado/linha validado na população).
Tudo são **funções puras** testadas; a IA entra uma vez no fim, só pra explicar/julgar. Mapa de
arquivos (file:line) no [`CLAUDE.md`](../CLAUDE.md).

## 3. Features que EXISTEM hoje (estado)

### 3.1 Mercados & validação CIENTE DE POPULAÇÃO
`validated_lines` é mapa `{selecao?, clube?}` roteado auto pela liga (`populacaoFor`: seleção =
`NATIONAL_LEAGUE_IDS` {27,31,58-67}; resto/desconhecida = clube). Só **(mercado, população, linha)
validado** ganha a ⭐. **Anti-lock-in:** apertar a seleção não trava o clube.

**AUDITORIA 2026-06-11** (`scripts/audit-player-markets.mts`, `audit-match-markets.mts`):
leave-one-out, **medindo NO PONTO DE APOSTA** (banda `prob∈[0.35,0.65]`, onde a casa põe a linha)
e no campo que a casa **liquida**. A banda separa estrela real de **fantasma** (full + mas banda
−/ECE alto = miscalibrada na linha, artefato de pooling). seleção n=2392, clube n=2800.

| Mercado | Seleção (Copa, ATIVO) | Clube (ATIVO) | Veredito-chave (no ponto de aposta) |
|---|---|---|---|
| **finalizações** | **0.5/1.5** ✅ | **todas as linhas** ✅ | o mercado mais forte. clube banda +0.028/+0.036 (0.5/1.5), 2.5 marginal-OK. seleção 2.5 era **fantasma** (full +0.111 MAS banda **−0.094**/ECE 0.13) → **DEMOVIDA** |
| **chutes a gol (sot)** | **só 0.5** ✅ | **só 0.5** ✅ | SOT 2+ é raro/mal previsto. clube 1.5/2.5 era **legado fantasma** (1.5 banda **−0.32**/ECE 0.23) → **DEMOVIDO**. `nb_dispersion` 3.0→**2.0**. **DECOMP PRODUCTIONIZADA 2026-06-12** (base total_shots × taxa-no-alvo, settle shots_on_target — estrela 0.5 mais calibrada; 1.5 pode regraduar no forward) |
| **desarmes** | **só 0.5** ✅ | **só 0.5** ✅ (**GRADUOU**) | decomp `μ_tentativas × aproveitamento(won/total)`, paga `won_tackle`. clube 0.5 full +0.110/banda +0.008. seleção 1.5 era fantasma (full +0.0085, banda **−0.081**/ECE 0.13) → **DEMOVIDA**. **2.5 morto** |
| **faltas** | **só 0.5** ✅ | **só 0.5** ✅ (**GRADUOU**) | comete `fouls` × adversário provoca `was_fouled`. clube 0.5 full +0.063/banda ~0. 1.5/2.5 negativos nas duas → sem ⭐ |
| **passes** | ⬛ **diagnóstico** | ⬛ **diagnóstico** | off=0 ≈ 0 nas duas (sel −0.011, clube +0.003); posse-dominado. **de-vig de escada** `value/ladderDevig.ts`; acumula forward, SEM ⭐ → [`mercados-nao-validados`](features/mercados-nao-validados/) |
| **gols / vitória** | ratings em prod | ratings em prod | λ=média-gols-cru REPROVOU (gols ECE 0.10-0.15; vitória mando ECE 0.13). **RATINGS tipo Elo VENCEM e estão PRODUCTIONIZADOS 2026-06-12** (`model/ratings.ts`+`runMatch`, fallback; ECE→0.03-0.05). **FIX 2026-06-15:** o forward expôs vitória miscalibrando (ECE 0.32, probs extremas tipo `Iran×NZ 85%/16%`) — causa: time de histórico raso (NZ 2 jogos) era **inelegível (floor=5) → caía na média-crua cega** que invertia o mismatch. Corrigido: **floor=1 (usa o rating encolhido, não o fallback) + `shrinkK=3`** (sweep `sweep-shrink-selecao.mts` n=1006: floor=1 dá vitória full BrierSkill +0.10; Elo de LR lento já regulariza raso). `Iran×NZ` → 60%/50% (são). **FORWARD LIMPO 2026-06-22** (após consertar o bug de settle dos lados 1/X/2): vitória BrierSkill **+0.14**/ECE 0.10 (n=57) — **mandante SUBESTIMADO** (disse 40%/venceu 57%; resíduo Modo 2 cross-confederação); gols +0.06/ECE 0.11 (n=82, leve sub). **Falta só forward/CLV** (ECE ainda >0.05) p/ flippar `validated_lines` → sem ⭐ ainda |
| **escanteios** | corner ausente | sem edge | clube baseline over 10.5 só +0.007 (sem edge); **eixo de concessão TESTADO 2026-06-12 → reprovado**. seleção sem `corner_kicks`. sem ⭐ → forward |

Graduação **gradual por (mercado, população, linha)** conforme calibração/forward provar. Config:
`src/model/markets.ts`. O resultado carrega badge `populacao`/`populacao_motivo` (texto, fora do
número).

### 3.2 Pipeline & validação que já roda
- **Coleta de odds — 1 prompt "tudo" cobre o jogo inteiro** (`buildOddsPrompt(event,"tudo",lineup)`,
  `src/manual/prompt.ts`): UM prompt coleta PARTIDA + JOGADOR numa só sessão da IA-navegador
  (computer-use), em vez de dois. Mais barato (screenshots da página compartilhados, não duplicados) e
  **não estoura o output** pós-pipe (`76c4141`; partida é migalha sobre o volume de jogador). Saída pipe
  com **um** header `book=`, partida-primeiro→jogador; downstream já era unificado (`parseManualOdds`
  despacha por `market_type`). Chaves antigas `jogador`/`partida`/individuais seguem (compat). Listas de
  mercado em fonte ÚNICA (`PLAYER_MARKETS_LIST`/`MATCH_MARKETS_LIST`) p/ não driftar entre prompts.
  **Front:** trocar 2 botões/caixas por 1 ("Analisar tudo") — repo `odd-analyzer-frontend`.
- **Análise manual** (`/analise/manual`): cola odds → cobre todos os mercados → ranqueia por risco
  (`seguro/moderado/tiro_longo`) com ⭐ no melhor pronto → **IA revisora** (veto/ressalva/concorda
  por candidato, ancorada nos campos do dossiê, degrada graciosa se a IA falhar).
- **Casamento odd↔jogador robusto (2026-06-14):** o squad que casa as odds é o **elenco COMPLETO**
  (pool nacional / quem atuou no clube), **não só o XI** — o banco (Yamal, Merino…) era perdido como
  "sem correspondência". `CrosswalkStatsProvider.squad` monta do pool; `xiIds` resolve a escalação à
  parte só p/ a titularidade. `normalize` inverte **"Sobrenome, Nome"** (formato Betnacional) e
  `scoreName` trata **mononímico** (casa "Gavi" ⇄ "Pablo Gavi"); `sem_match` deduplica por nome
  normalizado (contagem honesta). Medido no jogo real Spain×Cabo Verde: **90 → 6 sem-match** (e os 6
  são grafia já casada por outra forma ou jogador ausente do pool da BSD). Fail-closed intacto, gate
  de paridade intacto (mexe só no reconhecimento de nome, não no número).
- **Gate de lineup (N1):** ⭐ exige `titularidade="confirmado"`; pré-escalação → `pendente_lineup`
  (UI: "análise provisória, aguarde ~1h antes"). `lineup_status` da Copa: `predicted`→`confirmed`.
- **Loop forward (I7) LIGADO:** `analyzeManual` grava `paper_ledger` (edge>0, com `player_id`);
  CLIs `settle` (liquida pelo resultado real; desarme por `won_tackle`), `report` (Brier/ECE/CLV por
  mercado), `snapshotClosing`. **É o que valida a seleção AO VIVO** (a calib offline foi em AFCON/
  amistoso, não na Copa).
- **CLV AGREGADO por mercado (2026-06-22):** o `report.ts` e a tela `/clv` mostram o **CLV médio
  entrada→fechamento por `market_type`, juntando TODO o `paper_ledger`** (`aggregateClvByMarket` puro +
  `clvPorMercadoService` + `GET /clv/por-mercado`; reusa `lineupEdge`=média+IC bootstrap+n e a regra de
  casamento aposta↔retratos do `clvService`). Antes o agregado era `n/d` no `report` (o CLV só vinha
  por jogo). **Só cobre prop com odd de entrada;** gols/vitória (forwardLog) sem odds ficam de fora, e
  o EDGE (modelo×casa) ainda depende de odds dos 2 lados (Rec 1) — anotado na tela e no relatório.
- **Agendador 24h IN-PROCESS (2026-06-22):** subir a API (`npm run dev`) já liga um daemon
  (`src/scheduler/`) que, **sozinho e sem custo** (sem Claude, sem OpenRouter), fotografa odds nos
  **marcos que movem a linha** (deriva K−3h · **salto da escalação** via vigília K−90→−15min ·
  fechamento K−3min; abertura K−6h se ainda futura), e em varreduras roda `forwardLog` (6h) +
  `settle` (1h) + re-descoberta (1h). **GATILHO "após a 1ª busca" (decisão do dono):** a coleta de
  odds só rastreia jogos que o dono **JÁ BUSCOU** (têm linhas em `odds`) — a 1ª busca = a entrada/CLV;
  o `POST /coletar-odds` dá `kick()` → o jogo entra no rastreio na hora. Jogo nunca aberto = não
  coletado (não se apostaria nele). **`forwardLog`/`settle` (gols/vitória, $0) seguem GLOBAIS** (todos
  os jogos da Copa). Núcleo PURO (`plan`/`lineupWatch`) + casca (`runner`, deps injetadas): **fila
  serializada de 1 coleta** (headless não tolera concorrência) com **timeout** (não trava 24/7),
  **dedup restart-safe** e **erro isolado**. Diário em **`scheduler_runs`** (auditável) e cada snapshot
  carrega **`mark`+`origem`** (`odds_snapshots`). Flag `SCHEDULER_ENABLED=false` desliga;
  `GET /scheduler/status` + painel **Agendador** no front. Não toca money-path (gate intacto).
  Substitui o "cron manual" do runbook.
- **Sinais de contexto p/ a IA (texto, fora do número):** `forma_tendencia` (alta/queda/estável) e
  `posse_adversario` (% posse do rival, com orientação por-mercado). `populacao_motivo` (selo).
- **Odds unificadas — espelho canônico (2026-06-15):** tabela `odds_unificadas` = 1 linha por aposta
  após line shopping (PK por identidade NORMALIZADA → colapsa grafias: "Llorente, Marcos"+"Marcos
  Llorente"), com `casas_comparadas` e marca de divergência. **NUNCA editada à mão** — `reprojectUnifiedOdds`
  a re-gera do cru a CADA escrita em `odds` (coletar/colar/apagar/CLI) → nunca envelhece. **A ANÁLISE lê
  DELA** (`analyzeManualService` reprojeta e passa as linhas unificadas → o que a tela mostra É o que a
  análise usa). `odds` segue como LOG cru. Projeção PURA em `src/collect/unify.ts::buildUnifiedOdds`.
  Endpoints `POST /jogos/:id/unificar-odds` (botão) + `GET /jogos/:id/odds-unificadas`. Front: tela única
  (decisão + log) com botão "Unificar odds". Validado live (8299): 1485 cruas → 982 apostas, 27 divergências.
- **Persistência:** Supabase — `odds` (LOG cru das odds), `odds_unificadas` (espelho canônico = o que a
  análise considera), `odds_snapshots` (histórico IMUTÁVEL p/ CLV, com `lineup_status`/`mark`/`origem`),
  `analises` (resultado completo por jogo), `paper_ledger` (apostas-papel + CLV), `scheduler_runs`
  (diário do agendador 24h), `jogadores_crosswalk`.
- **Stack:** Node/TS (raiz, `src/`+`test/`), Express **:5926**, front Next **:5927** (portas
  específicas, fora das genéricas), em repo separado. Ports & Adapters; motor são funções puras;
  gate de paridade protege os números.

## 4. Próximas features

> Detalhe de cada uma em [`docs/features/<...>/`](features/). Ordem = valor.

### 🔴 DURANTE a Copa (população seleção)
| # | Feature | Por que na Copa | Detalhe |
|---|---|---|---|
| ① | **Forward (RODAR)** | não é feature nova — é OPERAR. Confirma a seleção ao vivo (calib foi em AFCON, não Copa), valida **gols/vitória** (ratings) e regrada as linhas demovidas se mostrarem skill ao vivo. **Agora AUTOMÁTICO:** o agendador 24h (§3.2) roda `forwardLog`/`settle` sozinho; o `report.ts`/painel CLV dão o veredito. RUNBOOK (`forwardLog`→`settle`→`report`) segue válido p/ rodar à mão — **Claude: siga** [`features/forward-loop-copa`](features/forward-loop-copa/). | [`forward-loop-copa`](features/forward-loop-copa/) |
| ①b | **RATINGS de força no λ de partida** ✅ **FEITO 2026-06-12** | gols/1X2 reprovaram com média-cruda; ratings tipo Elo VENCEM (ECE 0.13→0.04). **PRODUCTIONIZADO** (`src/model/ratings.ts` puro + `pipeline.runMatch` com fallback + `leaguePool` no provider; 17 testes novos, gate intacto). **Resta:** acumular **forward/CLV** → flippar `validated_lines` de gols/vitória. | prova em [`mercados-nao-validados`](features/mercados-nao-validados/) (exp. 2026-06-12b); `recalibrate-match-strength.mts` |
| ② | **N5 — mismatch/posse** | fase de grupos = jogos MUITO desiguais; favorito massacra → afeta os props direto | [`features/durante-copa/N5-mismatch-posse`](features/durante-copa/N5-mismatch-posse/) |
| ④ | **N2 — prior por força de liga** | forma de seleção fraca é ruidosa → aperta a precisão nos times menores | [`features/durante-copa/N2-prior-forca-liga`](features/durante-copa/N2-prior-forca-liga/) |
| ⑤ | **I6 — 2ª chamada de IA** (promotor × cético) | IA propõe hipótese, código decide; melhora explicação (fora do número) | [`features/durante-copa/I6-segunda-ia`](features/durante-copa/I6-segunda-ia/) |

(`arbitro_tendencia` saiu daqui — está **morto por dado** no §5, não é próxima feature.)

### 🟢 PÓS-Copa (população clube)
A **calibração offline de clube está FEITA** (auditoria 2026-06-11, ver §3.1): sot **só 0.5**,
finalizações **todas**, desarme **0.5** (graduou), faltas **0.5** (graduou) — `validated_lines.clube`
preenchido. **Clube já é ATIVO.** Falta só **acumular forward de clube** (o `paper_ledger` é
população-agnóstico: análise + `settle` em jogos de clube → CLI `report` mede Brier/ECE/CLV no clube).

**Fator de CONTEXTO na finalização (posse+mando) — PRONTO PRA CLUBE, na prateleira:** o combinado
de contexto (testado out-of-fold 2026-06-12f) **afia a finalização no clube** (over 1.5 BrierSkill
+0.012→+0.025, via posse +1.15× e mando +1.27×). Na Copa o dado de posse não existe → fica **só pro
clube**: ao virar a chave pós-Copa, implementar o fator calibrado no μ de finalização (+ re-freeze de
paridade). Detalhe/prova em [`mercados-nao-validados`](features/mercados-nao-validados/) (exp. 12f).
Durante a Copa, um **registro-sombra forward** (`src/cli/forwardShadowFinalizacao.ts`, diagnóstico
isolado) acumula se o mismatch ajuda a finalização ao vivo.

**Backlog de re-calibração ("outra maneira"):** os `(mercado, linha, população)` que **reprovaram
a calibração** (defesas, **passes** nas duas, SOT 1.5/2.5 nas duas, finalizações 2.5 seleção,
desarme 1.5 nas duas, faltas 1.5/2.5 nas duas, gols/vitória/escanteios nas duas) ficam catalogados em
[`features/mercados-nao-validados`](features/mercados-nao-validados/) — cada um com o **porquê** (full
vs banda de aposta) e a **hipótese de re-calibrar de outra maneira**. É backlog de ação; o estado vivo
continua aqui (§3.1) e o que está morto de vez no §5.

### 🔵 INFRA — Coleta automática de odds (em andamento)
Trocar a coleta MANUAL (colar prompt no Claude do Chrome, 1 casa) por **coleta server-side
multi-casa** + **line shopping** (apostar no melhor preço). Avaliação de viabilidade FEITA
(2026-06-13): legal no BR (odd pública deslogado); **rodar local no BR mata o geoblock**; as casas
**não são iguais** — **KTO** (Kambi), **Betnacional** (Sportradar), **Superbet** (Betler/Fastly) e
**Stake** (motor PRÓPRIO) = GO (ao vivo), **Betano** (Kaizen, geoblock+Turnstile+props em camada GameplAI
separada) = FORA do v1 (vai pro balde manual, junto da bet365). **Motor de coleta + KTO + Betnacional
+ Superbet + Stake FUNCIONANDO ao vivo (2026-06-15, 425 testes, gate de paridade intacto).** `src/collect/`:
normalizer fail-closed, line shopping, anti-armadilha cross-casa, orquestração "pula e avisa", parsers
KTO (Kambi, `fetch` puro), Betnacional (Bet6/REST — **não** era GraphQL, headless p/ Cloudflare),
Superbet (Betler/Fastly, `fetch` puro, **sem anti-bot/geoblock**; de-para por `marketId` numérico) e
**Stake** (motor próprio `sbweb.stake.bet.br` → **1ª casa com fonte de preço INDEPENDENTE** = diversidade
real; de-para por `marketId` base, headless), crosswalk de jogo `matchEventByName` + `teamNames.canonicalTeam`
(PT/EN/FR de seleção). **Cloudflare/JA3** (Betnacional e Stake) vencido por **Chromium headless local**
(Playwright, `src/cli/browserFetch.ts`, gets **serializados** — página única, casas em paralelo colidiam).
**CLI `src/cli/collectOdds.ts <event_id_BSD>`** acha as casas sozinho, coleta, line-shop, flaga
divergência → grava no `odds` (a análise manual já lê daí). PROVADO em `--dry` no 8300 (Belgium×Egypt):
**4 casas juntas** (kto 371/betnacional 3213/superbet 1622/stake 217), Stake→178 canônicas
(sot 46/fin 41/des 18/fal 73). **Liquidação confirmada:** desarme=won_tackle (KTO + Superbet + Stake),
faltas=cometidas, SOT/finalizações Opta/Sportradar. **Lição (rito):** "200 deslogado no navegador" **não**
significa que o `fetch` do Node passa — Stake dá 403 por **fingerprint TLS/JA3** mesmo com headers → headless.
**Rito E2E p/ a próxima casa: [`docs/coleta-odds/IMPLEMENTAR-CASA.md`](coleta-odds/IMPLEMENTAR-CASA.md)**
(prompts p/ o Claude-no-Chrome + checklist + DONE = botão do front). **Resta:** clicar **"obter odds"** no
front (F4) num jogo real + merge da branch `feat/coleta-stake`; Betano 2ª onda. Estado de produção (casa a
casa) = [`docs/coleta-odds/`](coleta-odds/) (doc vivo); pendente em features só Betano
([`features/coleta-odds-automatica/`](features/coleta-odds-automatica/)). N4 (odds de PARTIDA via BSD)
segue morto no §5 — esta é PROP multi-casa.

## 5. Cemitério — NÃO re-tentar (sem perder o aprendizado)

| Item | Por que está morto | Quando reviver |
|---|---|---|
| **I2 — matchup direcional** (lado de ataque × posição) | BSD não tem o dado; **e quando TESTADO com StatsBomb (dado rico, grátis) 2026-06-15 não houve sinal** (ver "eixo DIRECIONAL" abaixo) | **NÃO reviver** — o eixo não funciona nem com dado posicional; não é a fonte, é o sinal |
| **nota_confronto / lado de ataque** | mesma causa do I2 — **eixo direcional morto com prova (placebo) 2026-06-15** | idem (não reviver) |
| **I4 — xG/xA no μ** | `expected_goals` vem **NULL** em seleção | só se a Copa ao vivo trouxer xG preenchido |
| **N4 — odds automáticas BSD** | **descartado pelo dono**; BSD só dá mercado de partida não recomendável, zero player prop | — |
| **SOT over 1.5 / 2.5** (ambas pops) | seleção: BrierSkill negativo (chuta a gol pouco). clube: era legado, a auditoria 2026-06-11 mostrou fantasma (1.5 banda −0.32/ECE 0.23) → demovido nas DUAS. SOT 2+ é raro/mal previsto | forward pode regraduar; **prior/dispersão por posição TESTADO 2026-06-12 e REPROVADO** (banda segue −0.51; não é posição, é cauda) — ver [`mercados-nao-validados`](features/mercados-nao-validados/) |
| **desarme over 2.5** | robustamente morto (18 combinações R×k, BrierSkill<0; evento raro) | só observação forward |
| **`won_tackle` direto (sem decompor)** | reprovou (ganhar é alta-variância) | não reverter — usar a decomposição |
| **tilt posicional** | degradou ECE em 2 dos 3 mercados | candidato só p/ finalizações, com re-teste |
| **prior/dispersão por posição** (D/M/F no μ do jogador) | TESTADO nas 2 pops 2026-06-12 (`recalibrate-position-conditioned.mts`): não gradua NENHUMA linha morta (a causa é variância de cauda, não pooling de posição) e ainda PIORA as vivas | não re-tentar; só forward regrada as linhas mortas de jogador |
| **escanteios — concessão E produção** | concessão TESTADA 2026-06-12 (pior que baseline, n=917); **rating de PRODUÇÃO TESTADO 2026-06-15** (`recalibrate-corner-production.mts`, n=908: over 8.5/9.5 banda negativa, 10.5 +0.018 mas ECE↑ 0.026→0.041 = fantasma) — corner **não separa por força de time** como gol | não re-tentar; escanteios = forward |
| **faltas — `nb_dispersion` por linha** | TESTADO 2026-06-15 (`recalibrate-faltas-dispersion.mts`): GLOBAL-BEST já cobria 0.5/1.5; a varredura fechou o 2.5 → nada gradua (banda 1.5≈−0.06; 2.5 −0.32 sel / −0.49 clube). R é só a cauda da NB2, não cria sinal | não re-tentar; faltas = forward + árbitro (bloqueado) |
| **eixo DIRECIONAL — chutes E desarme** (lado de ataque × defensor; o "alvo" do CLAUDE.md) | **TESTADO com StatsBomb (dado posicional RICO e grátis) 2026-06-15 — MORTO nos 2 casos.** Chutes (`statsbomb-directional-scout.mts`, WC2022, 724 chutes): r²≈0.01. **Desarme-por-flanco** (`statsbomb-tackle-flank-scout.mts`, n=199 jogos seleção, o caso CANÔNICO): r²=0.008, **teste de PLACEBO REPROVA** (ganho real não bate flanco embaralhado), split-half inverte. Flanco da origem da jogada (`key_pass`). **Não é falta de dado — é falta de SINAL** | **NÃO reviver** — nem fonte paga resolve (não há sinal a comprar). Matchup fica por-mercado (concessão), validado |
| **combinar CONTEXTO (posse/mismatch/mando) em desarme/falta/SOT** | TESTADO out-of-fold 2026-06-12f (regressão Poisson, 5-fold, ~40k obs): redundante com a forma — o "sinal" agregado é **viés de elenco**, some no teste intra-jogador. Fecha o "desarme condicionado" | não re-tentar nesses mercados; **só finalização ganha** (posse+mando, CLUBE) — ver [`mercados-nao-validados`](features/mercados-nao-validados/) |
| **Calibrar na Copa LITERAL passada** | seasons 2018/2022 têm player-stats **VAZIO** na BSD | impossível offline → só forward |
| **arbitro_tendencia** (sinal de árbitro p/ IA) | BSD não tem filtro `/events/?referee_id=` (param ignorado, listagem traz `referee_id=null` — spike 2026-06-11); agregar histórico do árbitro = varrer N eventos um a um, caro demais p/ um sinal de texto | só com fonte de **perfil de árbitro** pronta |

## 6. Glossário leigo (o dono não lê código)

- **Calibração:** detector de mentira do modelo (homem do tempo: disse 70%, choveu ~70%?). Feita
  ANTES de arriscar — por isso vem primeiro.
- **CLV forward:** "comprei antes do preço subir". Bater a odd de fechamento = bom de verdade. Só dá
  pra medir ao vivo, daqui pra frente.
- **Lineup:** os 11 confirmados (sai ~1h antes). Não recomendar quem pode ficar no banco.
- **De-vig:** tirar o lucro embutido na odd pra achar a probabilidade "justa" da casa.
- **Edge/EV:** tamanho da vantagem / quanto se ganha por R$1 no longo prazo. Só aposta com os dois +.
- **Brier/ECE/BrierSkill:** notas da prova de calibração (menor Brier/ECE = melhor; BrierSkill>0 =
  melhor que chutar a média).
- **Shift de população:** calibrar num grupo (seleção) e usar noutro (clube) — re-medir no grupo
  certo. É o motivo da **validação ciente de população**.

---
*Histórico detalhado (specs/planos de features já feitas) foi removido do `docs/` — está no git.
Referência de APIs/dado em [`docs/apis/`](apis/).*
