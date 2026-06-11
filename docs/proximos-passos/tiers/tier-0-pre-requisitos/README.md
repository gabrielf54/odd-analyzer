# 🔴 Tier 0 — Pré-requisitos (fazer ANTES de recomendar apostas de valor)

> Sem estes três, as indicações da Copa são **fé cega**. Nenhum deles recalibra o número
> (risco de paridade baixo/nulo) e todos são rápidos. São a base para confiar em qualquer
> melhoria dos Tiers 1 e 2.

## Por que este tier vem primeiro

O veredito da investigação (ver [README raiz](../../README.md#1-veredito-a-análise-funciona-na-copa-com-evidência))
é que **a calibração do modelo é de clube (EPL 2023) e não dá para prová-la no passado da Copa**
(BSD não guardou os detalhes de 2018/2022). Logo, a única validação possível é **forward, na própria
Copa**. Além disso, a maior fonte de perda concreta numa aposta de player prop **não é o modelo** —
é apostar em quem **fica no banco**. E o carro-chefe (desarmes) pode estar **mirando o alvo errado**
se a casa liquidar por uma definição diferente da nossa.

## As três fichas

| Ficha | O que resolve | Esforço | Risco |
|---|---|---|---|
| [I7 — Loop forward (paper_ledger + CLV + settle)](I7-loop-forward-paper-ledger-clv.md) | Passa a **medir** se o número acerta nas seleções | Médio | Baixo (aditivo) |
| [N1 — Gate de lineup confirmado](N1-gate-de-lineup.md) | Não recomendar/registrar quem pode ficar no banco | Baixo-Médio | Baixo (não toca número) |
| [I8 — Settlement do desarme](I8-settlement-desarme.md) | Garantir que modelamos o que a casa liquida | Baixo (verificar) | Baixo/Médio (se trocar stat) |

## Ordem sugerida e dependências

1. **I8 primeiro** (é só uma verificação; o resultado decide se o settle do I7 lê `total_tackle` ou `won_tackle`).
2. **N1** (define o que conta como "recomendado/apostado" — o I7 só deve registrar como aposta o que o N1 libera).
3. **I7** (consome as decisões de N1/I8: registra as recomendações confirmadas e faz o settle automático lendo player-stats).

I8 → N1 → I7 é a cadeia limpa, mas N1 e I7 podem andar em paralelo se quem fizer I7 souber que
"aposta registrada = titularidade confirmada" (saída do N1).

## Critério para avançar ao Tier 1

- `paper_ledger` recebe linhas a cada análise; existe comando de **settle** que preenche `resultado`
  lendo `/events/{id}/player-stats/`; existe relatório que agrega **Brier/ECE/CLV por mercado**.
- Pré-lineup, **nenhum** candidato sai como `recomendado=true` firme (há aviso de escalação pendente);
  pós-confirmação, só **confirmados** são recomendados.
- Está **documentado** qual definição de "desarme" a casa usa, e modelo+settle usam a mesma.
