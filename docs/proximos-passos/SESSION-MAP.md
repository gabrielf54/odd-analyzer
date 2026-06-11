# Mapa das fatias — produto validado p/ Copa SEM lock-in só-Copa

> **Contexto:** session de 2026-06-11 decompôs o objetivo ("deixar o produto perfeito p/ a Copa,
> e usável depois nas ligas de clube") em fatias sequenciais. A **Fatia 0 (fundação) está FEITA**;
> as demais ficam **mapeadas aqui** para implementar em sessions futuras — uma de cada vez, cada
> uma com seu brainstorming → spec → plano → TDD. Princípios inegociáveis: ver `../../CLAUDE.md`
> e o README deste diretório.

## ✅ Fatia 0 — Validação ciente de população (FEITA, 2026-06-11)

`validated_lines` por população (seleção × clube), roteado auto pela liga (`populacaoFor`).
Anti-lock-in: apertar sot na seleção não trava o clube. Badge `populacao`/`populacao_motivo`.
Doc da virada pós-Copa: `docs/pos-copa-ligas-nacionais.md`.
Spec/plano: `docs/superpowers/{specs,plans}/2026-06-11-validacao-ciente-populacao*`.

---

## ⏳ Fatia 1 — Calibrar mercados existentes na população de CLUBE

- **Objetivo:** preencher/confirmar `validated_lines.clube` com evidência do motor ATUAL (não só
  o legado): sot/finalizações de clube + medir `desarmes.clube` (aproveitamento won/total de clube,
  que pode diferir do 0.622 da seleção).
- **Onde mexe:** `scripts/recalibrate-sot-fin-selecao.mts` e `recalibrate-desarmes-decomp.mts`
  apontados a uma liga de CLUBE do BSD (ex.: liga 9 do league-sweep). `src/model/markets.ts`
  (valores `clube`). Doc viva.
- **Validação:** leave-one-out, BrierSkill>0 + ECE aceitável por linha. Critério de aceite igual
  ao da seleção.
- **Dependência:** Fatia 0 (mecanismo já existe). **Destrava o pós-Copa** (checklist em
  `docs/pos-copa-ligas-nacionais.md`).
- **Status:** PENDENTE (session futura).

## ⏳ Fatia 2 — I3: novos mercados de contagem

- **Objetivo:** adicionar cross, dribles, faltas, duelos, interceptações — reusa o motor NB2.
- **Onde mexe:** `src/model/markets.ts` (novos specs), `PLAYER_MARKETS` em `src/manual/analyze.ts`,
  settle/odds. Ficha: `tiers/tier-2-diferencial/I3-novos-mercados-contagem.md`.
- **Validação:** calibrar cada mercado novo nas DUAS populações (seleção agora, clube na Fatia 1);
  só vira `validated` o que passar. BSD tem os campos (cross/contest/duel/interception).
- **Dependência:** idealmente depois da Fatia 1 (ter a receita das duas populações redonda).
- **Status:** PENDENTE.

## ⏳ Fatia 3 — N2: prior/shrinkage por força de liga

- **Objetivo:** forma de seleção fraca é mais ruidosa → encolher mais conforme a força da liga.
- **Onde mexe:** `src/model/shrinkage.ts` / `params.ts` (prior_strength por liga). Ficha:
  `tiers/tier-2-diferencial/N2-prior-por-forca-de-liga.md`.
- **Validação:** backtest com/sem o ajuste; ECE não pode piorar; gate de paridade (mexe no número
  → cuidado, pode exigir re-congelar golden de propósito e documentar).
- **Status:** PENDENTE.

## ⏳ Fatia 4 — N5: mismatch / posse (favorito × zebra)

- **Objetivo:** Copa tem muito jogo desigual; usar o desequilíbrio (posse/força) no μ.
- **Onde mexe:** `src/model/adjustments.ts` (multiplicador de mismatch). Ficha:
  `tiers/tier-2-diferencial/N5-mismatch-posse.md`. (`ball_possession` já existe — usado no I5.)
- **Validação:** backtest; mexe no número → paridade. Critério: melhora ECE sem overfit.
- **Status:** PENDENTE.

## ⏳ Fatia 5 — I6: segunda chamada de IA (promotor × cético)

- **Objetivo:** a IA propõe hipótese de confronto; o **código decide** (a IA nunca calcula número).
- **Onde mexe:** `src/ai/reviewer.ts` (2ª chamada), prompt. Ficha:
  `tiers/tier-2-diferencial/I6-segunda-chamada-ia.md`. **Fora do money-path** (texto).
- **Validação:** não toca número → paridade trivial; medir se a explicação melhora sem inventar.
- **Status:** PENDENTE.

## ⏳ Fatia 6 — arbitro_tendencia (resto do I5)

- **Objetivo:** agregar histórico do árbitro (faltas/cartões) como sinal de TEXTO p/ a IA.
- **Onde mexe:** novo agregador de `referee_id` (existe no event), `src/ai/reviewer.ts` (dossiê).
  Ficha: `tiers/tier-1-precisao-segura/I5-dossie-ia-enriquecido.md` (§ árbitro).
- **Validação:** texto, fora do número. Valor incerto (esforço médio) → fatia de menor prioridade.
- **Status:** PENDENTE.

---

## ❌ Bloqueados por DADO (não implementar sem fonte paga)

- **I2 — matchup direcional dentro do μ** (lado de ataque × posição): a BSD **não** tem
  `average_positions`/`shotmap`/lado de ataque (sonda 2026-06-11). Só com fonte posicional paga.
- **nota_confronto / lado de ataque** (parte do I5): mesma causa — morto sem dado posicional.
- **I4 — xG/xA no μ:** `expected_goals` vem NULL em seleção. Reavaliar só se a Copa ao vivo trouxer.

## 🗑️ Descartado (decisão do dono)

- **N4 — odds automáticas da BSD (mercado de partida):** o dono decidiu **não** usar odds
  automáticas. BSD só dá mercado de partida não recomendável (gols selado; 1x2/BTTS sem
  calibração) — zero player prop (o MVP). Banner de descartado na ficha.

## ✅ Já era o default certo

- **N3 — escopo histórico (clube+seleção):** já é o default; manter, validar forward.
