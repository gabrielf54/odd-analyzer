# CLV honesto + scoped à validação — design (2026-06-23)

> Approach A do brainstorming. Aprovado pelo dono. Money-path intocado (`model/`/`value/`),
> gate de paridade intacto.

## Contexto / causa-raiz (investigada com evidência)

O CLV agregado por mercado (`GET /clv/por-mercado`, `clvPorMercadoService`) mede o movimento
de preço (entrada→fechamento) das **escolhas de valor (edge>0)** do modelo, por mercado. A
investigação (systematic-debugging) estabeleceu, com evidência de código + banco:

1. **População = edge>0**, não "recomendadas". Único filtro ao gravar o ledger é `edge>0`
   (`analyze.ts:152`); a IA não descarta ninguém (`reviewer.ts:116`). Os campos
   `recomendado`/`pronto_para_apostar` **nem existem** no `paper_ledger` (só no JSON do
   resultado) → CLV não consegue filtrar por eles.
2. **"Só recomendadas" seria errado**: `prontoParaApostar` exige `isValidated(...)` (`rank.ts:23`)
   → seria circular (mercado não-validado teria zero CLV → nunca validaria).
3. **97% do pool é só-over** (SQL: 0 linhas com de-vig de 2 lados em sot/finalizações/desarmes).
   PORÉM o edge só-over é **conservador** (o preço cru super-estima a prob justa do over → o
   filtro `edge>0` exige um teto mais alto → sub-seleciona). Logo a população é um **subconjunto
   conservador** das escolhas de valor reais, e o CLV (movimento de linha) sobre ela é um sinal de
   validação **válido**. O que o só-over quebra é o **tamanho do edge / EV** e o **modelo×casa** —
   não o CLV.

**Conclusão:** a população do CLV está certa pro propósito (portão de validação). O problema é
de **honestidade do enquadramento** (a tela deixa o número parecer EV/edge, que não temos) e de
**ruído** (apostas de quem não jogou).

## Objetivo

Tornar o CLV-por-mercado honesto e scoped à validação, sem trocar a população central nem tocar
o money-path.

## Escopo (o que muda)

### Parte 1 — Enquadramento honesto (texto)
Separar três coisas que o dono confunde, na `/clv`, no `report.ts` e na string `limitacao` do
backend:
- **Calibração** = o número (probabilidade) está certo? (prova offline, já existe)
- **CLV** = o preço andou a meu favor depois que escolhi? (← o que a `/clv` mede)
- **EV/edge** = quanto ganho por real? (precisa odds dos 2 lados — **não temos**)

A cópia passa a dizer, em linguagem leiga: *"isto mostra que o mercado andou a favor das suas
escolhas mais fortes (sinal bom); NÃO diz quanto você ganha (EV) — pra isso falta a odd do outro
lado (Rec 1)."*

### Parte 2 — CLV agregado conta só apostas LIQUIDADAS
`clvPorMercadoService` passa a incluir só apostas com `resultado` preenchido (não-nulo). O settle
só liquida quem jogou ≥60min → exclui de graça **DNP/banco** e **jogos não terminados**, e alinha
a população do CLV com a da calibração.

**Tradeoff (anotado):** o agregado reflete **jogos já encerrados**; um jogo recém-fechado só
aparece após o settle (de hora em hora). O "ao vivo, hoje" segue na tela por-jogo
(`/jogos/:id/clv`), que **não muda**.

### Parte 3 — Fora de escopo (trava)
- NÃO vira "só recomendadas" (circular).
- NÃO exige de-vig de 2 lados aqui (isso é a Rec 1 — próximo marco real, registrado no CORE).
- NÃO toca `model/`/`value/`.

## Arquitetura / componentes

- **`src/service.ts::clvPorMercadoService`** — adiciona o filtro `resultado` não-nulo no laço do
  ledger; reescreve `CLV_LIMITACAO` pro enquadramento honesto.
- **`src/cli/report.ts`** — painel "CLV POR MERCADO" ganha a linha de enquadramento (prova
  movimento, não EV).
- **Front `components/ClvMarketPanel.tsx`** — reescreve intro + painel "o que isto NÃO cobre"
  (calibração vs CLV vs EV). Sem lógica nova (texto).
- **`docs/CORE.md` §3** — anota o scope de validação + enquadramento honesto; **runbook
  forward-loop-copa** ganha 1 linha (CLV prova movimento, não EV).

## Testes (TDD)
- `clvPorMercadoService`: aposta **liquidada** entra; **não-liquidada/DNP** (resultado nulo) fica
  fora; agregação por mercado segue correta. (Atualizar os testes existentes pra setar `resultado`.)
- O teste de determinismo (seed) segue válido com `resultado` setado.
- Front: cópia estática; helpers (`clvConfidence`/`marketLabelPt`) inalterados.

## Pronto quando
- `report.ts` e `/clv` exibem o enquadramento honesto; CLV agregado conta só liquidadas.
- `npm test` verde back + front; `typecheck` limpo; gate de paridade intacto; `next build` OK.
- CORE.md §3 atualizado; spec some do fluxo (essência no CORE; git guarda o detalhe).
