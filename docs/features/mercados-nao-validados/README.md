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
> **Por que existe (pedido do dono, 2026-06-11):** ao adicionar faltas, a calibração reprovou
> defesas e várias linhas altas. Em vez de só descartar, registramos a hipótese de re-calibração
> pra não perder o fio — futuramente voltamos com método/dado diferente.

## Como ler a tabela
- **BrierSkill < 0** = o modelo é PIOR que chutar a média naquela linha → não pode ter estrela.
- **n** = tamanho da amostra de seleção usada na calibração offline (quanto menor, menos confiável).
- **"Outra maneira"** = a hipótese concreta a testar quando voltarmos — não é promessa, é pista.

| Mercado · linha · população | Por que NÃO validou (número-chave) | "Outra maneira" a tentar |
|---|---|---|
| **defesas de goleiro** · todas · seleção | forma-base reprovou em TODO R/linha: BrierSkill 1.5=−0.05 · 2.5=−0.11 · 3.5=−0.12 · 4.5=−0.10 (n=178, calib 2026-06-11). **Patches de motor NÃO implementados** (ver abaixo). | (a) re-calibrar **com o eixo de produção** (μ × quanto o adversário CHUTA A GOL) — o diferencial nunca foi medido offline; (b) esperar **n maior no forward** (goleiro de seleção rende pouco dado); (c) modelar `saves` a partir do **SOT que o time adversário produz** em vez da forma do goleiro. |
| **SOT (chutes a gol)** · 1.5 e 2.5 · seleção | BrierSkill 1.5=−0.047 · 2.5=−0.272. Seleção chuta a gol pouco (base 6.4% fazem 2+, 1.6% fazem 3+). | forward na Copa pode regraduar; ou **prior de seleção** próprio (não EPL); over 0.5 JÁ vale. No **clube** as linhas altas já valem (atacante de clube finaliza mais). |
| **faltas** · 1.5 e 2.5 · seleção | BrierSkill 1.5=−0.031 · 2.5=−0.060 (n=1816, calib 2026-06-11). over 0.5 graduou (+0.034). | forward pode regraduar; ou **`nb_dispersion` por linha**; ou o eixo de **árbitro** (hoje bloqueado por dado — ver CORE §5). |
| **gols · vitória · escanteios** · — · ambas | mercados de **PARTIDA** nunca calibraram (sem ⭐ em nenhuma população). | calibrar o **modelo de partida** (Poisson de gols → 1X2/totais) em jogos de seleção: medir Brier/ECE/BrierSkill do 1X2 e dos totais, como foi feito pros mercados de jogador. |
| **desarme** · todas · clube | `validated_lines.clube` ausente — o aproveitamento `won/total` foi medido na seleção, não no clube. | calibrar o **aproveitamento de desarme no clube** (pós-Copa) — já previsto em [`pos-copa/calibrar-clube`](../pos-copa/calibrar-clube/). |
| **SOT · finalizações** · — · clube | validação é **legado de Brasileirão**, a re-confirmar na população de clube. | re-confirmar offline no clube (pós-Copa) — [`pos-copa/calibrar-clube`](../pos-copa/calibrar-clube/). |

> **Fora desta tabela (NÃO re-tentar — já no [CORE §5](../../CORE.md)):** desarme over 2.5 (18
> combinações R×k todas com BrierSkill<0, evento raro); `won_tackle` direto sem decompor; tilt
> posicional cru; calibrar na Copa LITERAL passada (player-stats vazio). E **`arbitro_tendencia`**
> (a BSD não tem filtro de árbitro — agregar histórico é caro demais; reviver só com fonte de
> perfil de árbitro).

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
nasceria sem estrela, tem ROI ruim no meio da Copa. O caminho honesto: **primeiro provar o eixo de
produção offline** (a "outra maneira" (a) acima) ou **acumular dado no forward** — e só então
implementar os patches. O detalhe dos 2 patches (campo no `MarketSpec`, filtro/eixo, file:line)
está **resumido acima** — suficiente pra re-derivar quando voltarmos.

**Re-medir defesas:** `scripts/recalibrate-faltas-defesas.mts` já roda o bloco DEFESAS (forma base).
Para a "outra maneira" (a), aplicar `opponentMultiplier(sot_produzido_adversario, baseline=3.63)` ao
μ de cada amostra antes do `probOverLine` e comparar BrierSkill com vs sem o eixo de produção.
