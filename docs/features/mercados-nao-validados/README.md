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

## Como ler a tabela
- **BrierSkill < 0** = o modelo é PIOR que chutar a média naquela linha → não pode ter estrela.
- **full** = sobre TODA a amostra; **banda** = só onde `prob∈[0.35,0.65]` (o ponto de aposta).
  Uma linha com **full + mas banda −/ECE alto** é **fantasma** (passa só no pooling).
- **n** = tamanho da amostra (sel=seleção n≈2392, clube n≈2800; partida sel≈351, clube≈480).
- **"Outra maneira"** = a hipótese concreta a testar quando voltarmos — não é promessa, é pista.

| Mercado · linha · população | Por que NÃO validou (número-chave, auditoria 2026-06-11) | "Outra maneira" a tentar |
|---|---|---|
| **finalizações** · 2.5 · **seleção** | **estrela-FANTASMA**: full +0.111 (parecia ok) MAS no ponto de aposta banda **−0.094** / **ECE 0.13** (super-prevê ~13pp), em TODO R. Seleção finaliza menos que clube. | forward na Copa pode regraduar; ou **prior de seleção** próprio. No **clube** 2.5 já vale (full +0.127, banda marginal). |
| **chutes a gol (sot)** · 1.5 e 2.5 · **seleção** | full 1.5=−0.012, 2.5=−0.182; banda 1.5=−0.59. Seleção chuta a gol pouco. | forward; ou prior de seleção. SOT 2+ é evento raro. over 0.5 vale. |
| **chutes a gol (sot)** · 1.5 e 2.5 · **clube** | **legado fantasma**: o "todas as linhas" do clube vinha do Brasileirão no motor ANTIGO e nunca foi re-confirmado. Auditoria: 1.5 full +0.003 MAS banda **−0.32** / **ECE 0.23**; 2.5 full −0.067. **DEMOVIDO** p/ só 0.5. | **prior de clube por posição** (atacante ≫ volante); SOT 2+ segue raro/mal previsto mesmo em clube. forward de clube. |
| **desarmes** · 1.5 · **ambas** | **seleção**: full só +0.0085 (≈ruído) e banda **−0.081**/ECE 0.13 → fantasma, **DEMOVIDO**. **clube**: full +0.047 (real) mas banda **−0.045**/ECE 0.09 (marginal) → sem estrela. O modelo super-prevê 2+ ganhos no ponto de aposta. | **condicionar à posição** (lateral/volante desarmam mais e mais previsível); **eixo de confronto** do desarme (quem ataca o lado dele); forward. over 0.5 vale nas duas. |
| **faltas** · 1.5 e 2.5 · **ambas** | seleção full 1.5=−0.039, 2.5=−0.077; clube full 1.5=−0.007, 2.5=−0.096 (n=2800). over 0.5 graduou nas duas (sel +0.033, clube +0.063). | forward; ou **`nb_dispersion` por linha**; ou o eixo de **árbitro** (hoje bloqueado por dado — CORE §5). |
| **passes** · todas · **ambas** | NO ponto de aposta (off=0, linha≈μ) BrierSkill ≈ 0 nas duas: **seleção** melhor −0.011; **clube** melhor +0.003 (ruído, embora ECE 0.013 — calibrado mas SEM edge). O agregado +0.10 é **artefato de pooling**. Diagnóstico (analisa + acumula forward, SEM ⭐). | (a) **fator de posse/estado-de-jogo** (a alavanca real — passe é posse-dominado; é o N5); (b) **prior por posição** (zagueiro ≫ atacante); (c) **`accurate_pass`**; (d) varrer **R<8** (o sweep não achou virada). |
| **gols** · totais · **ambas** | modelo de partida (λ=média-gols-últimos-10 → Dixon-Coles) **não calibra**: seleção (n=351) BrierSkill 1.5/2.5/3.5 = −0.033/−0.053/+0.023, ECE **0.10–0.15**; clube (n=480) = −0.062/−0.022/−0.059, ECE 0.08–0.11. | **força de time tipo Elo/rating** no λ (a média-gols crua é fraca); xG no λ (bloqueado: xG NULL em seleção, CORE §5). |
| **vitória (1X2)** · — · **ambas** | mando seleção +0.042 mas **ECE 0.126** (jogo de seleção é em campo neutro → mando ambíguo); clube mando **−0.065**/ECE 0.137, visitante −0.094/ECE 0.148. O λ cru não dá 1X2 honesto. | mesma do gols (força de time); p/ seleção, **remover o fator de mando** (campo neutro). |
| **escanteios** · total · **ambas** | clube (n=476): melhor linha (10.5) BrierSkill **+0.002** (ruído) / ECE 0.027 — calibrado mas SEM edge; 8.5/9.5 negativos. seleção: **falta dado** — `eventStats` de seleção não traz `corner_kicks` (9/480 amostras). | **eixo de concessão** (hoje neutralizado no backtest — medir com o multiplicador de escanteios concedidos); p/ seleção, esperar **dado de corner no forward**. |

> **Fora desta tabela (NÃO re-tentar — já no [CORE §5](../../CORE.md)):** desarme over 2.5 (robustamente
> morto, evento raro); `won_tackle` direto sem decompor; tilt posicional cru; calibrar na Copa
> LITERAL passada (player-stats vazio); e **`arbitro_tendencia`** (a BSD não tem filtro de árbitro).

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
verdade — depende do N5]; (b) **prior por posição**; (c) modelar `accurate_pass`; (d) varrer **R<8**
(o sweep 8→Poisson não achou virada). Só re-graduar se o **off=0** virar BrierSkill claramente >0 com
ECE ≤ ~0.05.
