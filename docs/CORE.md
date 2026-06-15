# CORE — O Cérebro do odd-analyzer

> **ESTE É O DOCUMENTO VIVO ÚNICO.** Objetivo + doutrina + features que existem + próximas
> features (Copa / pós-Copa) + o que NÃO re-tentar. **Atualize-o a CADA feature** (estado,
> veredito, escopo). Regras de **código/engenharia** ficam no [`CLAUDE.md`](../CLAUDE.md);
> **referência de dado/custo** em [`docs/apis/`](apis/). Detalhe de cada feature **pendente** vive em
> [`docs/features/`](features/) (uma pasta por feature) — **a pasta é APAGADA quando a feature shipa**
> (a essência sobe pra §3 e o git guarda o detalhe). Ver a regra de não-poluição no `CLAUDE.md`.
>
> **Atualizado:** 2026-06-15 (**odds unificadas** — tabela `odds_unificadas` = espelho canônico do cru
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
> calibração de TODOS os mercados, no ponto de aposta — ver §3.1) · **Suíte:** 415 testes Vitest
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
| **gols / vitória** | ratings em prod | ratings em prod | λ=média-gols-cru REPROVOU (gols ECE 0.10-0.15; vitória mando ECE 0.13). **RATINGS tipo Elo VENCEM e estão PRODUCTIONIZADOS 2026-06-12** (`model/ratings.ts`+`runMatch`, fallback; ECE→0.03-0.05; clube 1X2 banda +0.013/+0.030; gols 3.5 seleção banda +0.047). **Falta só forward/CLV** p/ flippar `validated_lines` → sem ⭐ ainda |
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
  análise considera), `analises` (resultado completo por jogo), `paper_ledger` (apostas-papel + CLV),
  `jogadores_crosswalk`.
- **Stack:** Node/TS (raiz, `src/`+`test/`), Express :3001, front Next em repo separado. Ports &
  Adapters; motor são funções puras; gate de paridade protege os números.

## 4. Próximas features

> Detalhe de cada uma em [`docs/features/<...>/`](features/). Ordem = valor.

### 🔴 DURANTE a Copa (população seleção)
| # | Feature | Por que na Copa | Detalhe |
|---|---|---|---|
| ① | **Forward (RODAR)** | não é feature nova — é OPERAR. Confirma a seleção ao vivo (calib foi em AFCON, não Copa), valida **gols/vitória** (ratings) e regrada as linhas demovidas se mostrarem skill ao vivo. **RUNBOOK pronto** (3 comandos: `forwardLog`→`settle`→`report`) — **Claude: siga** [`features/forward-loop-copa`](features/forward-loop-copa/). 40 previsões já logadas (2026-06-12). | [`forward-loop-copa`](features/forward-loop-copa/) |
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
(2026-06-13): legal no BR (odd pública deslogado); **rodar local no BR mata o geoblock**; as 4
"casas moles" **não são iguais** — **KTO** (Kambi), **Betnacional** (Sportradar) e **Superbet**
(Betler/Fastly) = GO (ao vivo), **Betano** (Kaizen, geoblock+Turnstile+props em camada GameplAI
separada) = FORA do v1 (vai pro balde manual, junto da bet365). **Motor de coleta + KTO + Betnacional
+ Superbet FUNCIONANDO ao vivo (2026-06-15, 396 testes, gate de paridade intacto).** `src/collect/`:
normalizer fail-closed, line shopping, anti-armadilha cross-casa, orquestração "pula e avisa", parsers
KTO (Kambi, `fetch` puro), Betnacional (Bet6/REST — **não** era GraphQL, headless p/ Cloudflare) e
Superbet (Betler/Fastly, `fetch` puro, **sem anti-bot/geoblock**; de-para por `marketId` numérico,
linha em `specifiers.total`), crosswalk de jogo `matchEventByName` + `teamNames.canonicalTeam`
(PT/EN/FR de seleção). **Cloudflare da Betnacional** vencido por **Chromium headless local**
(Playwright, `src/cli/browserFetch.ts`). **CLI `src/cli/collectOdds.ts <event_id_BSD>`** acha as 3
casas sozinho (listView KTO `world_cup_2026` + events-by-seasons Bet6 `950049532` + events/by-date
Superbet), coleta, line-shop, flaga divergência → grava no `odds` (a análise manual já lê daí).
PROVADO em `--dry` no 8295 (Germany×Curaçao): KTO+Bet6 conf 1.0; Superbet provada ao vivo no 12512182
(Suécia×Tunísia, 795 linhas canônicas, conf 1.0). **Liquidação confirmada:** desarme=won_tackle
(KTO + Superbet), faltas=cometidas, SOT/finalizações Opta/Sportradar. **Resta:** rodar **sem `--dry`**
(grava em produção — exige OK explícito do dono); Betano 2ª onda. Estado de produção (casa a casa) =
[`docs/coleta-odds/`](coleta-odds/) (doc vivo); pendente em features só Betano
([`features/coleta-odds-automatica/`](features/coleta-odds-automatica/)). N4 (odds de PARTIDA via BSD)
segue morto no §5 — esta é PROP multi-casa.

## 5. Cemitério — NÃO re-tentar (sem perder o aprendizado)

| Item | Por que está morto | Quando reviver |
|---|---|---|
| **I2 — matchup direcional** (lado de ataque × posição) | BSD **não tem** `average_positions`/`shotmap`/lado de ataque (sonda 2026-06-11); `position` só G/D/M/F | só com fonte posicional **paga** (fora do orçamento) |
| **nota_confronto / lado de ataque** | mesma causa do I2 | idem |
| **I4 — xG/xA no μ** | `expected_goals` vem **NULL** em seleção | só se a Copa ao vivo trouxer xG preenchido |
| **N4 — odds automáticas BSD** | **descartado pelo dono**; BSD só dá mercado de partida não recomendável, zero player prop | — |
| **SOT over 1.5 / 2.5** (ambas pops) | seleção: BrierSkill negativo (chuta a gol pouco). clube: era legado, a auditoria 2026-06-11 mostrou fantasma (1.5 banda −0.32/ECE 0.23) → demovido nas DUAS. SOT 2+ é raro/mal previsto | forward pode regraduar; **prior/dispersão por posição TESTADO 2026-06-12 e REPROVADO** (banda segue −0.51; não é posição, é cauda) — ver [`mercados-nao-validados`](features/mercados-nao-validados/) |
| **desarme over 2.5** | robustamente morto (18 combinações R×k, BrierSkill<0; evento raro) | só observação forward |
| **`won_tackle` direto (sem decompor)** | reprovou (ganhar é alta-variância) | não reverter — usar a decomposição |
| **tilt posicional** | degradou ECE em 2 dos 3 mercados | candidato só p/ finalizações, com re-teste |
| **prior/dispersão por posição** (D/M/F no μ do jogador) | TESTADO nas 2 pops 2026-06-12 (`recalibrate-position-conditioned.mts`): não gradua NENHUMA linha morta (a causa é variância de cauda, não pooling de posição) e ainda PIORA as vivas | não re-tentar; só forward regrada as linhas mortas de jogador |
| **escanteios — eixo de concessão** | TESTADO 2026-06-12: pior que baseline (n=917) | não re-tentar; escanteios = forward |
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
