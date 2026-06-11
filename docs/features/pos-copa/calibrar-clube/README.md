# Calibrar a população de CLUBE (destrava o pós-Copa)

> **Índice/estado vivo:** ver [`docs/CORE.md`](../../../CORE.md). Esta pasta é o detalhe da feature.
> **Por que existe:** objetivo do dono — usar o produto **depois da Copa nas ligas de clube**, sem
> seleção. A fundação anti-lock-in já está no código (validação ciente de população); falta
> **preencher/confirmar os números de clube** com o motor atual.

## TL;DR
Re-confirmar a calibração de **sot/finalizações** e **medir desarme** na população de **clube**
(com o motor atual, não só o legado) → preencher `validated_lines.clube` honesto em `markets.ts`.

## Status
- Ajuda à meta: **Alto** (é o que torna o produto usável pós-Copa).
- Pronto p/ Copa: ❌ **não é da Copa** — é o pivô pós-Copa. Não bloqueia usar na Copa.
- Esforço: **Médio.** Risco de paridade: cuidado (mexe em `validated_lines`, não no número puro).

## Fundamento
Seleção e clube são populações diferentes. Hoje `validated_lines.clube` de sot/finalizações vem da
**calibração legada** (~3300 jogos Brasileirão, que originou o `validated:true`) — evidência real,
mas **anterior** ao motor atual (pós minutos-esperados). E `desarmes.clube` está **ausente** (não
validado) porque o `wr_prior=0.622` (aproveitamento won/total) foi medido **na seleção**.

## Checklist do pivô (executar antes de operar ligas de clube)
- [ ] Confirmar que a(s) liga(s) de clube alvo **não** estão em `NATIONAL_LEAGUE_IDS` (devem cair em
      `populacaoFor`="clube"). Se algum id colidir, ajustar o set.
- [ ] **Re-confirmar sot/finalizações de clube**: `scripts/recalibrate-sot-fin-selecao.mts` apontado
      a uma liga de CLUBE do BSD (ex.: liga 9 do league-sweep). Critério: BrierSkill > 0 + ECE
      aceitável por linha → confirmar/ajustar `validated_lines.clube`.
- [ ] **Medir `desarmes.clube`**: `scripts/recalibrate-desarmes-decomp.mts` numa liga de clube; o
      `wr_prior` de clube pode diferir de 0.622. Se passar, adicionar `clube:[...]` ao desarme.
- [ ] **Revisar o default de liga desconhecida** (`populacaoFor`→"clube"): pós-Copa já é o certo.
- [ ] **Acumular forward de clube** (o `paper_ledger` é população-agnóstico): análise + `settle` em
      jogos de clube → medir Brier/ECE/CLV na população clube (CLI `report`).
- [ ] Atualizar o `CORE.md` marcando os mercados de clube como validados conforme passarem.

## O que muda AUTOMATICAMENTE (já implementado, Fatia 0)
Jogo de liga de clube → `populacaoFor`="clube" → entra `concede_baseline` de clube e
`validated_lines.clube`. **SOT 1.5/2.5 re-abrem sozinhos** (clube valida todas as linhas), sem
mexer em nada. Badge `populacao`="clube" no resultado. Apertar a seleção **não** travou o clube.

## Mapa de re-validação por mercado
- **finalizações:** já validado nas duas; só confirmar forward de clube.
- **sot:** clube herda "todas as linhas" do legado → **re-confirmar**. Se confirmar, é o mercado
  mais forte no clube (linhas altas voltam).
- **desarmes:** clube **do zero** — medir aproveitamento de clube. Até lá, sem estrela no clube.
- **gols/vitória/escanteios:** seguem em validação nas duas; só ligar com prova.
