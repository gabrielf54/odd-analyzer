# 🟡 Tier 1 — precisão segura (melhora o NÚMERO sem recalibrar)

> **O que este tier faz:** deixa o número que o produto compara contra a casa **mais honesto e
> mais preciso**, sem mexer no miolo calibrado do modelo (priors, dispersão NB2, shrinkage, μ).
> Por isso o **risco de paridade é baixo**: nenhuma ficha aqui altera as golden de `test/parity/`
> (ou, quando toca o cálculo de `prob_devig`, é fora do que está congelado — ver cada ficha).

**Criado em:** 2026-06-11. **Base factual:** sondagem real da BSD + leitura do código (ver `file:line` em cada ficha).

Leia o [README do diretório](../../README.md) primeiro (contexto + princípios + mapa do código).
Toda ficha respeita os 7 princípios inegociáveis de lá — em especial: **valor = `prob_modelo > prob_devig`**
(EV/edge+, nunca "prob alta"); **a IA explica/julga mas NÃO inventa nem calcula número**;
**validação-primeiro**; **gate de paridade 1e-9**; **Ports & Adapters**; **wire em snake_case PT**.

---

## 1. Por que este tier vem DEPOIS do Tier 0

O Tier 1 melhora a **precisão** das indicações. Mas "mais preciso" só vira **confiança** se você
estiver **medindo** se a precisão se traduz em acerto/CLV na população de seleção da Copa. Essa
medição é o **Tier 0 / I7 (loop forward: `paper_ledger` + CLV + settle)**.

Em termos diretos:

- **Sem I7 rodando**, cada ganho de precisão deste tier é **fé não medida** — você não sabe se
  capturou valor real ou só mudou números na tela. O `paper_ledger` está **vazio (0 linhas, 2026-06-11)**.
- **Com I7 rodando**, as mudanças deste tier ganham um **veredito empírico**: I1 (de-vig honesto)
  muda *quais candidatos passam o corte de edge* → o forward diz se os candidatos recém-capturados
  têm CLV+; I5 (dossiê da IA) adiciona um sinal descritivo → o forward diz se apostas com sinal
  favorável ganham mais; N4 (odds da BSD) alimenta o **próprio CLV** de mercado de partida.

> **Regra:** não "confie" num ganho deste tier sem o I7 medindo. Implementar é seguro (baixo risco
> de paridade); **declarar vitória** exige o forward.

---

## 2. As 3 fichas deste tier

| Ficha | O que melhora | Toca o money-path? | Risco paridade | Custo dado |
|---|---|---|---|---|
| **[I1 — De-vig honesto + flag one-sided](I1-devig-honesto-one-sided.md)** | `prob_devig`/edge mais honestos (de-vig de 2 vias quando há `odd_under`); corrige um **bug latente** (o `0` no lugar de `null` em mercado de partida) | Sim, só o ramo de `prob_devig` (não o μ, não a NB2) | Baixo | $0 |
| **[I5 — Dossiê da IA enriquecido](I5-dossie-ia-enriquecido.md)** | Veto/ressalva e explicação da IA com sinais de **confronto como TEXTO** (lado de ataque, posse do adversário, forma, árbitro) — **fora do cálculo do número** | **Não** (a IA não calcula; campos descritivos não entram em `prob_modelo`) | **Nenhum** | $0 |
| **[N4 — Odds automáticas da BSD (mercado de partida)](N4-odds-bsd-mercado-partida.md)** | De-vig **real** (2 lados) e **snapshot de fechamento (CLV)** automáticos em gols/1x2/BTTS, onde a BSD dá os dois lados | Sim, só `prob_devig` em mercado de partida | Baixo | $0 (BSD já assinada) |

**Nota importante de escopo (vale para todas):** estas fichas melhoram **honestidade/infra do número** e
do **veto**. Elas **não** "destravam novas apostas confiáveis": gols segue **selado** (não calibra),
1x2/BTTS precisariam de calibração própria, e o que liberta valor descartado (I1) só vale se o
forward confirmar. **Calibração manda; "ter odd limpa" ≠ "pode apostar".**

---

## 3. Ordem sugerida de ataque

1. **I1 primeiro** — além do ganho de honestidade do de-vig, ele **conserta um bug latente**
   (mercado de partida sem `odd_under` hoje passa `0` ao builder → `impliedProb(0)` lança em
   `src/value/devig.ts:3`). É a única ficha do tier que arruma algo possivelmente **quebrado agora**.
2. **N4 depois** — alimenta o CLV de mercado de partida do I7 e dá de-vig real onde a BSD entrega os
   dois lados. Baixo-Médio esforço; encaixa direto no loop forward.
3. **I5 por último (ou em paralelo)** — risco zero de paridade (a IA não calcula número), mas é o de
   maior valor de *produto* (explicação/veto de confronto). É também o **experimento barato** que
   prepara o I2 (Tier 2, matchup direcional dentro do μ): mostra-se a nota direcional como texto, o
   forward mede se ela prediz, e só então se liga o direcional dentro do cálculo.

I1 e N4 são independentes entre si (podem ir em paralelo se houver duas sessões). I5 é totalmente
ortogonal aos outros dois.

---

## 4. Critério para avançar ao Tier 2

Só passe ao [Tier 2 — diferencial / mais oportunidades](../tier-2-diferencial/) quando:

- [ ] **I7 está rodando** (`paper_ledger` recebendo linhas a cada análise; settle e relatório
      funcionando) — sem isso, o Tier 2 (que muda o μ / abre mercados) é cego.
- [ ] **I1 aplicado**: de-vig de 2 vias quando há `odd_under`; one-sided mantém conservador **e
      sinaliza** (`sem_devig=true`); o **bug do `0`** corrigido (passar `odd_under ?? null`).
      `npm test` verde, golden de `test/parity/` intactas.
- [ ] **N4 aplicado**: de-vig real e snapshot de fechamento em mercado de partida, **mantendo a
      quarentena** (gols selado, 1x2/BTTS sem recomendação até calibrar).
- [ ] **I5 aplicado**: a IA recebe ao menos 1–2 sinais descritivos novos (snake_case PT, derivados
      do dado), com a **ancoragem preservada** e sem derivar número que vire money-path por engano.
- [ ] Há **pelo menos alguns jogos da Copa no `paper_ledger`** com `resultado` preenchido, para que
      o Tier 2 (I2/N5/N2) tenha um sinal forward inicial contra o qual medir o ganho do diferencial.

> **Espírito do tier:** "primeiro pare de mentir no número (I1), depois automatize a medição de
> fechamento (N4), depois dê olhos de confronto à IA (I5) — tudo sem tocar na calibração."
