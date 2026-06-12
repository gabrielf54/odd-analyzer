# Mercados não validados — backlog de re-calibração ("outra maneira")

> **O que é esta pasta:** o catálogo dos **(mercado, população, linha)** que **NÃO viraram
> aposta de valor** — porque reprovaram a calibração, não foram calibrados, ou falta dado. Para
> cada um: **por que não validou** (número-chave) e a **"outra maneira"** a tentar no futuro.
>
> **Isto é BACKLOG (ação futura), não estado.** O **estado vivo** (o que vale HOJE) é o
> [`CORE §3.1`](../../CORE.md); o que está **morto de vez** (NÃO re-tentar) é o
> [`CORE §5`](../../CORE.md). Aqui é diferente: é o que **queremos voltar a calibrar de outra
> maneira**. Quando um item graduar, a essência sobe pro CORE §3.1 e some daqui. Quando um item
> morrer de vez, vai pro CORE §5 e some daqui.
>
> **Atualizado pela AUDITORIA 2026-06-11** (`scripts/audit-player-markets.mts`,
> `scripts/audit-match-markets.mts`): leave-one-out, **medindo NO PONTO DE APOSTA** (banda
> `prob∈[0.35,0.65]`, onde a casa põe a linha) e no campo que a casa **liquida** (settleField).
> A banda é o que separa estrela real de **estrela-fantasma**: um BrierSkill agregado positivo
> pode esconder miscalibração no ponto de aposta (artefato de pooling de linhas óbvias).
>
> **EXPERIMENTO 2026-06-12 — prior + dispersão POR POSIÇÃO: REPROVADO** (ver seção dedicada
> abaixo). A hipótese "o pooling de posições infla a cauda" foi **refutada**. A alavanca de
> **posição** está RISCADA das "outras maneiras" das linhas mortas de jogador — sobra só o forward.

## 🎯 PLACAR das tentativas de calibração (varredura 2026-06-12)

Bateria de 6 alavancas testadas offline ($0) p/ tentar graduar os mercados não validados. Cada uma
com prova (script + número). Detalhe nas seções "Experimento" abaixo.

| Alavanca | Mercado(s) alvo | Veredito | Ação |
|---|---|---|---|
| **Ratings de força (Elo) no λ** | gols / vitória (1X2) | 🟢 **VENCE** — ECE 0.13→0.04; clube 1X2 e gols 3.5 seleção viram **candidatos a graduar** | ✅ **PRODUCTIONIZADO 2026-06-12** (`pipeline.runMatch` + `model/ratings.ts`, com fallback). Falta **forward** p/ graduar `validated_lines` |
| **SOT por decomposição** (×taxa-no-alvo) | SOT | 🟡 **melhora** — aprimora a estrela 0.5; aproxima o 1.5 (−0.6→−0.1) mas não gradua | ✅ **PRODUCTIONIZADO 2026-06-12** (`markets.ts`: sot = decomp base `total_shots`; settle/concessão/display em `shots_on_target`). Estrela 0.5 mais calibrada; 1.5 = forward |
| **Matchup axis (oppMult) ligado** | linhas mortas de jogador | 🟡 ajuda marginal (SOT 1.5 −0.61→−0.36), **gradua nada**; já em prod | nada a fazer (já ligado) |
| **Prior + dispersão por posição** | linhas mortas de jogador | 🔴 **REPROVADO** nas 2 pops — é variância de cauda, não posição; ainda piora as vivas | riscado → Cemitério (CORE §5) |
| **Escanteios: eixo de concessão** | escanteios (clube) | 🔴 **REPROVADO** — pior que baseline (n=917) | riscado; escanteios = forward |
| **Passes: accurate_pass + R<8** | passes | 🔴 **sem edge** (off=0 BrierSkill +0.0005) | diagnóstico; só N5 (posse) resta |

**Saldo:** 1 vitória clara (ratings → destrava o grupo de partida), 1 melhoria (SOT decomp), 3
alavancas mortas-com-prova, 1 marginal. As linhas mortas de **jogador** (sot 1.5/2.5, fin 2.5 sel,
desarme 1.5, faltas 1.5) esgotaram as alavancas offline de forma base → **só forward** as regrada.

## 📋 Mercados que SEGUEM não validados (sem ⭐) — estado pós-varredura 2026-06-12

Inventário do que **ainda não vira aposta de valor recomendada**, por que, e o que falta. (O que
JÁ é validado/tem ⭐ está no [`CORE §3.1`](../../CORE.md): finalizações [clube todas · seleção
0.5/1.5], sot 0.5, desarme 0.5, faltas 0.5 — nas 2 pops.)

| Mercado · linha · pop | Estado | O que falta p/ graduar |
|---|---|---|
| **gols** (totais 1.5/2.5/3.5) · ambas | 🟢 **ratings PRODUCTIONIZADOS** (λ calibrado em prod, ECE ~0.04); `validated_lines` ainda vazio | **forward/CLV** na Copa (seleção) e em clube → flippar `validated_lines` |
| **vitória (1X2)** · ambas | 🟢 **ratings PRODUCTIONIZADOS** (clube 1X2 banda +0.013/+0.030 offline); sem ⭐ | **forward/CLV** → flippar |
| **sot** · 1.5 e 2.5 · ambas | 🔴 offline ESGOTADO (posição, matchup, decomp testados; 2+ é cauda rara). **decomp JÁ PRODUCTIONIZADA** (estrela 0.5 mais calibrada) | só **forward** (o 1.5 pode regraduar agora que o modelo melhorou) |
| **finalizações** · 2.5 · **seleção** | 🔴 offline esgotado (banda −0.094/fantasma). **clube 2.5 JÁ vale** | só **forward** de seleção |
| **desarmes** · 1.5 · ambas (2.5 morto §5) | 🔴 offline esgotado (posição/matchup sem ganho) | só **forward**; eixo direcional bloqueado por dado (§5) |
| **faltas** · 1.5 e 2.5 · ambas | 🔴 offline esgotado | só **forward**; eixo de árbitro bloqueado por dado (§5) |
| **escanteios** (total) · ambas | 🔴 clube: baseline sem edge (+0.007); concessão reprovada. seleção: sem `corner_kicks` (data-dead) | só **forward** (clube); seleção espera dado de corner ao vivo |
| **passes** (escada) · ambas | ⬛ diagnóstico, sem edge (off=0 +0.0005); accurate_pass/R<8/posição testados | só **N5** (fator de posse) ou **forward** |

**Resumo:** das alavancas offline, **só os ratings de partida graduaram um caminho novo** (e já estão
em produção, à espera do forward). Todo o resto que segue sem ⭐ ou (a) esgotou o offline → **forward**
regrada, ou (b) depende de **dado que a BSD free não dá** (§5: direcional, árbitro, corner de seleção,
xG). Nada aqui está "parado por falta de tentativa" — está parado por prova ou por dado.

## Como ler a tabela
- **BrierSkill < 0** = o modelo é PIOR que chutar a média naquela linha → não pode ter estrela.
- **full** = sobre TODA a amostra; **banda** = só onde `prob∈[0.35,0.65]` (o ponto de aposta).
  Uma linha com **full + mas banda −/ECE alto** é **fantasma** (passa só no pooling).
- **n** = tamanho da amostra (sel=seleção n≈2392, clube n≈2800; partida sel≈351, clube≈480).
- **"Outra maneira"** = a hipótese concreta a testar quando voltarmos — não é promessa, é pista.

| Mercado · linha · população | Por que NÃO validou (número-chave, auditoria 2026-06-11) | "Outra maneira" a tentar |
|---|---|---|
| **finalizações** · 2.5 · **seleção** | **estrela-FANTASMA**: full +0.111 (parecia ok) MAS no ponto de aposta banda **−0.094** / **ECE 0.13** (super-prevê ~13pp), em TODO R. Seleção finaliza menos que clube. | ⛔ posição **testada 2026-06-12 → reprovada** (banda COND −0.059, pior que o global). **Resta só forward.** No **clube** 2.5 já vale (full +0.127, banda marginal). |
| **chutes a gol (sot)** · 1.5 e 2.5 · **seleção** | full 1.5=−0.012, 2.5=−0.182; banda 1.5=−0.59. Seleção chuta a gol pouco. | ⛔ posição **testada 2026-06-12 → reprovada** (banda COND segue −0.51). SOT 2+ é evento raro. **Resta só forward.** over 0.5 vale. |
| **chutes a gol (sot)** · 1.5 e 2.5 · **clube** | **legado fantasma**: o "todas as linhas" do clube vinha do Brasileirão no motor ANTIGO e nunca foi re-confirmado. Auditoria: 1.5 full +0.003 MAS banda **−0.32** / **ECE 0.23**; 2.5 full −0.067. **DEMOVIDO** p/ só 0.5. | ⛔ posição **testada nas DUAS pops 2026-06-12 → reprovada** (clube n=2816 replicou; banda SOT 1.5 −0.22 / ECE 0.19). SOT 2+ raro. **Resta só forward de clube.** |
| **desarmes** · 1.5 · **ambas** | **seleção**: full só +0.0085 (≈ruído) e banda **−0.081**/ECE 0.13 → fantasma, **DEMOVIDO**. **clube**: full +0.047 (real) mas banda **−0.045**/ECE 0.09 (marginal) → sem estrela. O modelo super-prevê 2+ ganhos no ponto de aposta. | ⛔ **condicionar à posição testado 2026-06-12 → reprovado** (banda COND seleção −0.081, ≈ global; dentro de D/M já é −0.04/−0.12). Resta: **eixo de confronto** do desarme (quem ataca o lado dele — bloqueado por dado direcional, §5) e **forward**. over 0.5 vale nas duas. |
| **faltas** · 1.5 e 2.5 · **ambas** | seleção full 1.5=−0.039, 2.5=−0.077; clube full 1.5=−0.007, 2.5=−0.096 (n=2800). over 0.5 graduou nas duas (sel +0.033, clube +0.063). | ⛔ posição **testada 2026-06-12 → reprovada** (banda COND seleção 1.5 −0.059). Resta: **`nb_dispersion` por linha** (não testado); eixo de **árbitro** (bloqueado por dado — CORE §5); forward. |
| **passes** · todas · **ambas** | NO ponto de aposta (off=0, linha≈μ) BrierSkill ≈ 0 nas duas: **seleção** melhor −0.011; **clube** melhor +0.003 (ruído, embora ECE 0.013 — calibrado mas SEM edge). O agregado +0.10 é **artefato de pooling**. Diagnóstico (analisa + acumula forward, SEM ⭐). | (a) **fator de posse/estado-de-jogo** (a alavanca real — passe é posse-dominado; é o N5); (b) **prior por posição** (zagueiro ≫ atacante); (c) **`accurate_pass`**; (d) varrer **R<8** (o sweep não achou virada). |
| **gols** · totais · **ambas** | modelo de partida (λ=média-gols-últimos-10 → Dixon-Coles) **não calibra**: seleção (n=351) BrierSkill 1.5/2.5/3.5 = −0.033/−0.053/+0.023, ECE **0.10–0.15**; clube (n=480) = −0.062/−0.022/−0.059, ECE 0.08–0.11. | ✅ **RATINGS tipo Elo — VENCE e JÁ PRODUCTIONIZADO 2026-06-12** (ECE 0.13→0.04; `pipeline.runMatch`+`model/ratings.ts`, com fallback). Falta só **forward** p/ graduar. xG no λ bloqueado (§5). |
| **vitória (1X2)** · — · **ambas** | mando seleção +0.042 mas **ECE 0.126** (jogo de seleção é em campo neutro → mando ambíguo); clube mando **−0.065**/ECE 0.137, visitante −0.094/ECE 0.148. O λ cru não dá 1X2 honesto. | ✅ **RATINGS — VENCE e JÁ PRODUCTIONIZADO 2026-06-12** (clube banda mandante +0.013/ECE 0.026, visitante +0.030/ECE 0.047). **Mando sozinho insuficiente** (o rating subsume). Falta só **forward**. |
| **escanteios** · total · **ambas** | clube (n=476): melhor linha (10.5) BrierSkill **+0.002** (ruído) / ECE 0.027 — calibrado mas SEM edge; 8.5/9.5 negativos. seleção: **falta dado** — `eventStats` de seleção não traz `corner_kicks` (9/480 amostras). | ⛔ **eixo de concessão TESTADO 2026-06-12 → reprovado** (pior que baseline, n=917). Baseline over 10.5 só +0.007 (sem edge). Resta forward; p/ seleção, esperar **dado de corner no forward**. |

> **Fora desta tabela (NÃO re-tentar — já no [CORE §5](../../CORE.md)):** desarme over 2.5 (robustamente
> morto, evento raro); `won_tackle` direto sem decompor; tilt posicional cru; calibrar na Copa
> LITERAL passada (player-stats vazio); e **`arbitro_tendencia`** (a BSD não tem filtro de árbitro).

---

## Experimento 2026-06-12: prior + dispersão POR POSIÇÃO — REPROVADO

**Hipótese:** as linhas mortas de jogador (sot 1.5, finalizações 2.5 seleção, desarme 1.5,
faltas 1.5) falham todas igual — `full +` mas **banda −/ECE alto** (super-prevê 2+/3+ no ponto
de aposta). Suposição: o motor usa **UM prior e UM `nb_dispersion` global por mercado**, jogando
zagueiro/volante/lateral/atacante no mesmo saco → a cauda (over 1.5/2.5) infla pros jogadores
errados. **Logo, condicionar prior + R por posição (D/M/F) consertaria a banda.**

**Método** (`scripts/recalibrate-position-conditioned.mts <selecao|clube>`): espelha
`audit-player-markets.mts` (leave-one-out, settleField, banda `prob∈[0.35,0.65]`, oppMult
neutro), e adiciona a posição do jogador (`client.player().position`). Compara 3 modelos por
(mercado, linha): **SHIPPED** (prior+R do código) · **GLOBAL-BEST** (prior global + melhor R
varrido = teto SEM posição) · **COND** (prior por posição [mediana per90 da posição] + melhor R
por posição = teto COM posição). Roda na **seleção** (Copa = arena ativa), n=2406 (D=890/M=897/F=375).

**Resultado — a hipótese CAIU:**
1. As posições **são** heterogêneas (prior medido: sot D=0.14/M=0.41/F=1.02; desarme
   D=1.54/M=1.57/F=0.73; finaliz. D=0.54/M=1.35/F=2.62; cada uma quer R diferente). A premissa
   "posições diferem" é verdadeira.
2. **MAS dividir NÃO conserta a banda em nenhuma linha morta.** Mesmo **dentro de cada posição** a
   banda segue negativa → a causa **não é o pooling de posição**, é que **2+/3+ é cauda de alta
   variância**, mal prevista pela forma (com ou sem posição).

   | linha morta | banda COND | banda GLOBAL-BEST | dentro da posição (banda) | veredito |
   |---|---|---|---|---|
   | sot 1.5 | **−0.513** (ECE 0.27) | −0.570 | F −0.42 | morta (absoluto catastrófico; "vitória" relativa é falso-positivo) |
   | finalizações 2.5 | −0.059 (ECE 0.12) | −0.034 | M −0.05 / F −0.06 | morta (COND **pior** que o global) |
   | faltas 1.5 | −0.059 (ECE 0.10) | −0.057 | D −0.02 / M −0.12 | morta (empate ruim) |
   | desarme 1.5 | −0.081 (ECE 0.13) | −0.076 | D −0.04 / M −0.12 | morta (empate ruim) |
3. **Custo colateral:** COND **piora as linhas VIVAS** — finalizações 0.5 full BrierSkill cai de
   **+0.154** (global) p/ **+0.097** (o prior por posição super-personaliza e descalibra o pooled);
   e descarta G/? (244 amostras). → **não shipar** sob nenhuma hipótese.

**Confirmado no CLUBE 2026-06-12** (n=2816, D=1019/M=1052/F=474): **mesmo padrão** — COND não gradua
nenhuma linha morta (SOT 1.5 banda absoluta −0.22; fin 2.5/faltas 1.5/desarme 1.5 sem ganho) e
**piora as vivas** (finalizações 0.5 full +0.20→+0.12). O mecanismo replicou nas DUAS populações.

**Veredito:** alavanca de **posição ESGOTADA** nas DUAS populações. Riscada das "outras maneiras"
(tabela acima) → Cemitério (CORE §5). Sobra **forward** (a Copa ao vivo pode regraduar — CORE §4 ①).
`nb_dispersion` **por linha** já estava coberto pelo GLOBAL-BEST (melhor R por linha) — também
reprovou. Resta o eixo de **confronto direcional** do desarme (bloqueado por dado, §5). A doutrina
valida o negativo: agora **sabemos** que não é a posição — sem auto-engano.

---

## Experimento 2026-06-12b: RATINGS de força no λ de partida — VENCE 🟢

**Alavanca:** trocar o λ de **média-gols-crua** (que reprovou gols/vitória nas 2 pops) por
**ratings de ataque/defesa estilo Elo**, atualizados CRONOLOGICAMENTE (causal — só usa o passado),
+ termo de **mando** populacional (clube>0, seleção=0 campo neutro).
`scripts/recalibrate-match-strength.mts <selecao|clube>`, leave-one-out natural pelo passe
cronológico, métricas na banda. n eval: seleção 583, clube 930 (params Elo NÃO tunados no eval:
LR=0.08, mando_log=0.18, μ0=1.3 — o fato de já vencer com defaults é evidência de robustez).

**Resultado — primeira alavanca que FUNCIONA em mercado de partida:**
- **ECE colapsa** de 0.10–0.16 (baseline miscalibrado) → **0.03–0.05** (calibrado) em todos.
- **Full BrierSkill flippa pra +** em gols e 1X2 nas duas populações.
- **No ponto de aposta (banda):**

  | mercado · pop | baseline (banda) | RATINGS (banda) | veredito |
  |---|---|---|---|
  | **1X2 mandante · clube** | −0.009 / ECE 0.062 | **+0.013 / ECE 0.026** (n=577) | ✅ candidato a graduar |
  | **1X2 visitante · clube** | −0.110 / ECE 0.164 | **+0.030 / ECE 0.047** (n=356) | ✅ candidato a graduar |
  | **gols 3.5 · seleção** | +0.005 / ECE 0.061 | **+0.047 / ECE 0.064** (n=170) | ✅ candidato a graduar |
  | gols 2.5 · ambas | clube +0.004 | clube +0.006 / ECE 0.036; sel ~0 / ECE 0.031 | calibrado, edge marginal |
  | gols 1.5 · ambas | negativo | full + / ECE crush; banda rala (alta-prob) | calibrado, banda fina |
  | 1X2 · seleção | mandante +0.033 | mandante full **+0.078**, banda −0.019 | full +, banda marginal |

- **MANDO sozinho (ablação "+MANDO"):** insuficiente — melhora o Brier mas não o ECE; quem carrega
  é o **rating** (força + mando juntos). O baseline não tinha termo de mando nenhum (por isso o 1X2
  de clube sub-previa o mandante).

**Veredito:** ratings **muda o status** de gols/vitória de "não calibram" → **calibram; candidatos a
graduar** (1X2 clube e gols 3.5 seleção passam na banda). **NÃO graduar ainda** — falta (a)
**productionizar** os ratings no motor de partida (`matchModel.ts`/`pipeline.ts` hoje usam média
crua) e (b) **forward/CLV**. É a feature de partida de maior valor agora. xG no λ segue bloqueado (§5).

## Experimento 2026-06-12c: escanteios com eixo de concessão — REPROVADO

`recalibrate-match-strength.mts clube` (n=917 com corner). Multiplicar o μ de escanteios pelo
**multiplicador de escanteios concedidos** pelo adversário **PIORA** em toda linha/R (over 9.5 R=3:
baseline +0.042 → concessão −0.040; over 10.5: +0.007 → −0.007). O baseline (sem concessão) é só
**marginalmente** calibrado (over 10.5 BrierSkill ~+0.007 / ECE ~0.02 — sem edge real). **Eixo de
concessão RISCADO** de escanteios. Seleção segue data-dead (sem `corner_kicks`). Resta forward.

## Experimento 2026-06-12d: SOT por DECOMPOSIÇÃO — melhora a estrela, não gradua 1.5 🟡 ✅ PRODUCTIONIZADO

**Alavanca:** modelar SOT como `μ_finalizações(total_shots) × taxa-no-alvo(sot/total_shots, encolhida)`
— igual ao desarme (won/total). Hipótese: total_shots (o mercado mais forte) prevê a cauda melhor
que o SOT direto. `scripts/recalibrate-sot-decomp.mts`, n=2406 seleção / 2816 clube.

| linha | DIRETO (atual) banda | DECOMP banda | veredito |
|---|---|---|---|
| **over 0.5** (estrela VIVA) | sel +0.018/ECE 0.082 · clube +0.002/ECE 0.036 | sel +0.013/ECE 0.020 · **clube +0.046/ECE 0.041** | ✅ **decomp é modelo MELHOR** (full BrierSkill clube +0.10→+0.15; ECE menor) |
| **over 1.5** (morta) | sel **−0.61**/ECE 0.29 · clube −0.26/ECE 0.21 | sel −0.11/ECE 0.17 · clube **−0.09**/ECE 0.10 | 🟡 muito melhor (−0.6→−0.1) mas **ainda não passa**; vira candidato a **forward-regrade** |

**Veredito:** decomp **não ressuscita SOT 1.5** (banda segue −0.1), MAS é um **modelo estritamente
melhor pro SOT** — aprimora a calibração da estrela 0.5 existente (nas 2 pops) e aproxima o 1.5 do
ponto de virada. → **candidato a productionizar** (trocar SOT direto por decomp, como o desarme;
config a tunar k≈20-40, R≈2-3). SOT 2+ segue cauda dura; só forward pode graduar o 1.5.

**✅ PRODUCTIONIZADO 2026-06-12** (`markets.ts`: sot vira decomp — `stat_field=total_shots` base,
`mu_decomp.num_field=shots_on_target`, `settle_field`/`concede_field=shots_on_target`, R=2.0,
wr_shrink=40, wr_prior=0.35). A reutilização da máquina de decomp do desarme expôs e **consertou um
bug latente**: `recentPlayerAverage`/`realPlayerResult` (display+resultado) e `stats_detalhadas`
(drawer) liam `stat_field` — pro desarme isso mostrava `total_tackle` (tentativas) em vez de
`won_tackle` (ganhos, o que a casa paga). Agora todos usam `settleField`. **312 testes verdes, gate
de paridade intacto** (o gate testa `probOverLine` com μ hardcoded → não lê `stat_field`).

## Experimento 2026-06-12e: eixo de matchup (oppMult) ligado nas linhas mortas — ajuda marginal, gradua nada

`scripts/recalibrate-matchup-axis.mts selecao`. A auditoria neutraliza oppMult; aqui medimos as
linhas mortas COM o multiplicador de concessão ligado (idêntico à produção, clamp [0.7,1.4]). O mult
médio ~0.94 **encolhe** o μ → reduz a super-previsão 2+: **SOT 1.5** banda −0.61→**−0.36** (ECE
0.29→0.23); **finalizações 2.5** banda −0.094→**−0.046** (ECE 0.13→0.11). Mas **nenhuma fica
positiva** → gradua nada. **Faltas 1.5 / desarme 1.5:** sem ganho. Como o eixo **já está ligado na
produção**, isto confirma que o confronto está na direção certa (ajuda, não atrapalha) — só não
resgata cauda. Combinado com a decomp (exp d), aproxima SOT 1.5 da virada, mas segue **forward-only**.

---

## Detalhe: defesas de goleiro (o caso que originou esta pasta)

**Estado:** ADIADA antes de implementar. A calibração de forma base reprovou todas as linhas e a
amostra é pequena (n=178). Os **2 patches de motor** que defesas exige **não foram feitos** — ficam
aqui registrados pra quando voltarmos:

1. **`posicao_filtro`** no `MarketSpec` + filtro em `playerCandidates` (`src/manual/analyze.ts`):
   processar SÓ goleiro. Valor da posição confirmado: **`"G"`** (lineups da BSD, spike 2026-06-11).
2. **`eixo_producao`** no `MarketSpec` + método `teamProduced` no provider
   (`src/providers/stats.ts`): o multiplicador escala com o **SOT que o adversário PRODUZ** (lado
   próprio dele), não com o que ele concede. Sem isso, defesas é cego ao confronto (o ponto do
   mercado). Baseline de produção de SOT medido: **3.63/time/jogo** (seleção).

**Settlement:** a casa liquida `saves` (padrão Opta). Cobertura: bet365 costuma precificar defesas.

**Por que adiar e não implementar sem estrela:** a doutrina é "poucas oportunidades fortes > muitas
fracas". Gastar 2 patches de motor num mercado que (a) reprovou a forma base, (b) tem n=178, e (c)
nasceria sem estrela, tem ROI ruim. O caminho honesto: **primeiro provar o eixo de produção offline**
(a "outra maneira" (a) acima) ou **acumular dado no forward** — e só então implementar os patches.

**Re-medir defesas:** `scripts/recalibrate-faltas-defesas.mts` já roda o bloco DEFESAS (forma base).
Para a "outra maneira" (a), aplicar `opponentMultiplier(sot_produzido_adversario, baseline=3.63)` ao
μ de cada amostra antes do `probOverLine` e comparar BrierSkill com vs sem o eixo de produção.

---

## Detalhe: passes (cobertura existe, mas o modelo não bate o livro NO ponto da linha)

**Estado:** IMPLEMENTADO como **diagnóstico** (`opp_mode:"none"`, `ladder:true`, **sem
`validated_lines`**), com de-vig de escada (`src/value/ladderDevig.ts`) e wiring no fluxo manual.
Aparece na análise e acumula no `paper_ledger` forward — mas **nunca ganha ⭐**.

**Por que reprovou** (auditoria 2026-06-11, `audit-player-markets.mts`): a casa põe a linha **no µ
esperado do jogador** (off=0). Ali o modelo precisaria saber **quando** o jogador passa mais/menos
que a **própria média** — e isso é **posse e estado de jogo**, não a forma (que só acerta a média).
No off=0: **seleção** melhor BrierSkill −0.011; **clube** melhor +0.003 (ruído — embora o ECE de
clube seja baixíssimo, 0.013: o modelo é bem CALIBRADO mas não DISCRIMINA no ponto da linha → sem
edge). O "+0.10" do agregado é **artefato de pooling**: junta linhas óbvias (passar 20+ é quase
certo; 60+ quase impossível). A casa não cota o óbvio — cota o meio, e no meio o modelo empata.
Comparação no ponto de aposta: faltas +0.033 · sot +0.050 · desarme +0.077 · **passes ≈ 0**.

**Settlement (⚠️ item aberto):** a casa (Betano) liquida **`total_pass`** (tentados) pela Opta, que
**exclui cruzamentos**. O BSD tem `total_cross` separado, mas **não foi confirmado** se o `total_pass`
do BSD já exclui cruzamento. Viés pequeno na média (~4.6%) mas até **21% num ala**. Confirmar contra
um jogo de referência Opta antes de qualquer dinheiro. (Hoje é diagnóstico, então não bloqueia.)

**Outra maneira (ordem sugerida):** (a) **fator de posse esperada** com sinal correto [a alavanca de
verdade — depende do N5]; ~~(b) prior por posição~~ (testada 2026-06-12, reprovada nas linhas mortas);
~~(c) accurate_pass; (d) R<8~~ **TESTADOS 2026-06-12** (`recalibrate-passes-v2.mts`): no off=0,
accurate_pass PS=5 R=3 = **BrierSkill +0.0005 / ECE 0.026** (calibrado, **zero edge**); total_pass
−0.003. accurate_pass é levemente melhor que total_pass mas **nenhum discrimina** → segue diagnóstico.
**Só o N5 (posse) resta** como alavanca não testada. Re-graduar só se o off=0 virar BrierSkill
claramente >0 com ECE ≤ ~0.05 — accurate_pass ainda é o campo a usar se um dia shipar.
