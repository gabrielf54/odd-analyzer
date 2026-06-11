# N1 — Gate de lineup confirmado

## 1. TL;DR
Pré-escalação, o sistema hoje marca **todo mundo** como titular (`xi_confirmado=true` por default) e
**recomenda** jogadores "prováveis". Corrigir para **não recomendar/registrar** ninguém enquanto a
escalação não sair confirmada — porque apostar em quem fica no banco é a maior perda concreta.

## 2. Status
- **Ajuda à meta:** **Alto** (a maior fonte de perda real numa indicação de player prop).
- **Pronto p/ Copa:** ✅ Sim.
- **Esforço:** Baixo-Médio.
- **Risco de calibração/paridade:** Baixo — **não toca o número** (`prob_modelo`/`edge`/`ev`), só a
  decisão de recomendar/registrar. Mexe em testes de comportamento.
- **Custo de dado:** $0 (`/events/{id}/lineups/` já dá `lineup_status`).

## 3. Problema / fundamento
**Lineup** = lista dos 11 titulares, que o time só anuncia ~1h antes. Antes disso não há certeza de
quem joga. Uma indicação de "Rice 3+ desarmes" só vale se o Rice **jogar** — se ficar no banco ou sair
cedo, a aposta perde por um motivo que **nada tem a ver com a qualidade do modelo**. No dossiê real do
Rice (amistoso 9099), **todos os 3 alertas da IA** eram "ninguém está 100% confirmado" — ou seja, a
incerteza dominante pré-jogo é escalação, não estatística. O modelo não conserta isso; só o **timing**
(esperar a escalação) conserta.

## 4. Evidência real
Dossiê do Rice (event 9099, `tmp-out-england-v2.json`): candidato recomendado com
`xi_confirmado: true` **e** `titularidade: "provavel"` ao mesmo tempo — **incoerência**. A IA
recomendou e ainda assim alertou "escalação não confirmada". O gate de titular **não cortou ninguém**
porque a escalação ainda não tinha saído.

## 5. Estado atual no código
- `src/providers/stats.ts:195` — `const xiConfirmed = xiTeamIds.size > 0 ? xiTeamIds.has(String(entityId)) : true;`
  → **quando não há escalação confirmada (`xiTeamIds` vazio), `xi_confirmado = true` para todos** (default otimista).
- `src/providers/stats.ts:224-236` — `xiIds(event)`: só retorna ids **se `lineup_status === "confirmed"`**
  (ou algum `lineups[side].confirmed`); senão retorna `Set` vazio. → pré-confirmação, `xiTeamIds` é vazio.
- `src/manual/analyze.ts:122-124` (e `src/pipeline.ts:142-144`) — `titularidade`:
  `xiTeamIds.size > 0 ? (has ? "confirmado" : "fora_do_xi") : "provavel"`.
- `src/candidates/filter.ts:25-31` — `failedCuts`: corta `"titular"` se `xi_confirmado !== true`.
  Como o default é `true`, **pré-lineup ninguém é cortado**.
- `src/candidates/rank.ts:39` — `recomendado` = primeiro candidato **sem `alerta_minutos`** —
  **não olha `titularidade`** → marca a estrela em quem está só "provavel".

**Resumo da falha:** pré-lineup, `xi_confirmado=true` (default) → corte de titular não corta →
`recomendado` ignora titularidade → o sistema **recomenda firme um "provável"**. Pós-confirmação o
gate já funciona certo (quem não está no XI vira `fora_do_xi` → `xi_confirmado=false` → cortado por `"titular"`).

## 6. Proposta de implementação
**Separar dois estados do jogo** e tratar o pré-lineup explicitamente. Decidir o design fino no
brainstorming; a direção recomendada:

**(a) `recomendado` consciente de titularidade** (`src/candidates/rank.ts:39`): a estrela só vai para
quem `titularidade === "confirmado"` **e** sem `alerta_minutos`. Se ninguém está confirmado (pré-lineup),
**nenhum** `recomendado=true`; em vez disso, sinalizar estado provisório.

**(b) Sinalizar pré-lineup no fio** (snake_case PT): adicionar ao `result` um campo claro, ex.
`pendente_lineup: true` (ou por candidato `pronto_para_apostar: boolean`), para a UI mostrar
"análise provisória — aguarde a escalação (~1h antes)" e **não** exibir selo de recomendado.

**(c) Não registrar como aposta pré-confirmação** (liga com I7): o `paper_ledger` pode até registrar
o candidato para **calibração** (com `edge>0`), mas o flag de "apostado/recomendado" (o que entra no
CLV) só quando `titularidade === "confirmado"`.

**(d) Opcional — modo "só confirmados"** no corte: um parâmetro em `Cuts`/opts que, ligado, exige
`titularidade === "confirmado"` (não o `xi_confirmado` default-true). Útil para um "modo aposta" que
devolve lista vazia até a escalação sair.

> **Não** mude `xi_confirmado` para `false` por default de forma cega: isso cortaria **todos** por
> `"titular"` pré-lineup e quebraria o fluxo de "análise provisória antes da escalação". A correção é
> separar *mostrar análise provisória* (mantém) de *recomendar/apostar* (bloqueia até confirmar).

**TODO de verificação (1 chamada):** confirmar os valores possíveis de `lineup_status` na Copa
(`/events/{id}/lineups/` retornou `lineup_status` + `beta` no event 8287 mesmo `notstarted`). Saber
quando vira `"confirmed"` (provavelmente ~1h antes) e se há um estado intermediário "provável/beta".

## 7. Plano de validação
**Comportamental (não precisa calibração — é regra de decisão):** testes Vitest em
`test/manualAnalyze.test.ts` (já modificado no working tree):
- Pré-lineup (`lineup_status != "confirmed"`): `result.pendente_lineup === true`; **nenhum**
  candidato com `recomendado === true`.
- Pós-confirmação: jogador no XI → pode ser `recomendado`; jogador fora do XI confirmado → cortado por `"titular"`.
- **Critério de aceite:** os dois cenários passam; nada no money-path (`prob_modelo`/`edge`/`ev`) muda.

## 8. Riscos & armadilhas
- **Quebra de testes existentes:** muda o que é `recomendado`/cortado → atualizar `test/manualAnalyze.test.ts`
  (já em modificação) e quaisquer testes do `rank`/`filter`.
- **Não confundir** `xi_confirmado` (no XI confirmado) com `alerta_minutos` (minutos esperados < 60):
  são riscos diferentes; o gate é sobre titularidade.
- **UX:** pré-lineup ainda deve **mostrar a análise** (o dono quer ver o confronto), só não recomendar/apostar.

## 9. Dependências
Nenhuma dura. Sinergia com **I7** (define o que vira "aposta" registrada).

## 10. Esforço estimado
Baixo-Médio: ~0.5 dia (ajustar `rank`/sinalização + testes) + verificação de `lineup_status`.

## 11. Checklist de aceite
- [ ] Pré-lineup: `recomendado=true` em ninguém; `result` traz sinal de escalação pendente.
- [ ] Pós-confirmação: só `titularidade==="confirmado"` é recomendado; fora do XI é cortado.
- [ ] `prob_modelo`/`edge`/`ev` inalterados (gate de paridade intacto; `npm test` da paridade verde).
- [ ] `test/manualAnalyze.test.ts` cobre ambos os cenários.
- [ ] Valores de `lineup_status` da Copa documentados.

## 12. Como verificar
```bash
npm test                                  # comportamento novo + paridade intacta
# inspecionar lineup_status de um jogo da Copa (usa BZZOIRO_API_KEY do .env):
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/8287/lineups/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log("status=",j.lineup_status,"beta=",j.beta))'
```
