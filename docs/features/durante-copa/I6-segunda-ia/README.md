# I6 — Segunda chamada de IA (geração por confronto / promotor × cético)

> **Índice/estado vivo:** [`docs/CORE.md`](../../../CORE.md) (esta pasta é o detalhe da feature). Refs a `ROADMAP`/`PITCH`/`proximos-passos` abaixo são **históricas** — unificados no CORE (conteúdo no git). Ao mexer no estado, atualize o **CORE**.

## 1. TL;DR
Hoje os candidatos nascem por **força bruta** (todo jogador × mercado × linha) → o **código filtra**
→ a **IA revisa** numa única chamada. Uma **segunda IA** pode (a) **propor hipóteses de confronto**
para priorizar quem tem matchup direcional forte, ou (b) fazer um **veto adversarial (promotor ×
cético)** para afiar o veto e reduzir falso-positivo. **Em ambos, o número e a decisão continuam no
código** — a IA propõe/critica, **nunca seleciona por feeling**.

## 2. Status
- **Ajuda à meta:** **Médio** (melhora a **qualidade do veto** e a **priorização**, não o número).
- **Pronto p/ Copa:** ⏳ Útil, mas precisa **medir utilidade** (reduz falso-positivo sem matar valor?).
- **Esforço:** **Médio-Alto**.
- **Risco de calibração/paridade:** **Nenhum no número** — não toca o money-path (sem paridade). O
  risco é **de processo**: a IA influenciar a seleção por feeling (proibido).
- **Custo de dado:** **$0** de dado; **+chamadas LLM** (custo $ **irrisório** via OpenRouter).

## 3. Problema / fundamento (confronto × concessão × EV)
A geração atual é **cega ao confronto**: monta candidatos de **todo** jogador × mercado × linha e
deixa o filtro de `edge/EV` peneirar. Isso (1) **não prioriza** os encaixes oferta × concessão mais
fortes (o "norte" do produto) e (2) confia o veto a **uma só** passada de IA, que pode deixar passar
um falso-positivo (linha esticada, amostra frágil, risco de banco) que um segundo olhar pegaria.

Uma segunda IA ataca os dois pontos **sem violar o princípio inegociável**: ela **não calcula o
número nem decide a aposta**. Em (a) ela só **sugere onde olhar** (quais matchups), e **o código**
computa o edge desses e decide. Em (b) ela só **tenta refutar** um recomendado, e **o código/regra**
mantém ou corta. O valor continua sendo `prob_modelo > prob_devig`, calculado em código.

## 4. Evidência real (números + file:line)
- **Revisão hoje é 1 chamada, contexto pobre:** `reviewCandidates` (`src/ai/reviewer.ts:72`) faz **uma**
  chamada ao LLM com `contexto` mínimo — no fluxo manual, só `{ jogo: event.jogo ?? event.id }`
  (`src/manual/analyze.ts:77`). O prompt já **proíbe a IA de inventar número** e a obriga a ancorar
  só nos campos (`src/ai/reviewer.ts:12-24`) — é exatamente a fronteira que I6 deve preservar.
- **Geração é força bruta:** no manual, `playerCandidates` varre **todos** os jogadores casados ×
  linhas (`src/manual/analyze.ts:101-144`); no pipeline, `playerCount` faz o mesmo
  (`src/pipeline.ts:133`). Nenhuma priorização por confronto.
- **Já existem DUAS IAs para fluxos diferentes** (reusar o padrão, não inventar do zero):
  - **Revisora (manual):** `src/ai/reviewer.ts` — dá `stance` (concorda/ressalva/veta) + `nota` por candidato.
  - **Analista (pipeline):** `src/ai/analyst.ts` — dá `melhor_aposta`/`veredito` (`APOSTAR`/`NAO_APOSTAR`/`PASSAR`),
    com a regra "só `APOSTAR` se `edge>0` E `ev` claramente positivo E `xi_confirmado` E amostra
    suficiente" (`src/ai/analyst.ts:9-11`). **Já é conservador e ancorado** — bom alicerce para o cético.

## 5. Estado atual no código (file:line exatos)
- **Revisora:** `src/ai/reviewer.ts` — `PROMPT_REVISOR:5`, `reviewCandidates:72` (1 tentativa + 1 retry,
  fail-closed: falha → `ia_revisao=null`, não veta nem aprova falso, `src/ai/reviewer.ts:104-108`).
- **Analista:** `src/ai/analyst.ts` — `PROMPT_SISTEMA:5`, `analyze:20` (mesmo padrão fail-closed,
  `src/ai/analyst.ts:36`; `fakeAnalyst:40` = IA desligada).
- **Onde a 2ª chamada se encaixa (manual):** entre `rankCandidates` e a entrega, perto de
  `src/manual/analyze.ts:77` (hoje 1 chamada via `reviewerFn`). A `reviewerFn` é **injetável**
  (`AnalyzeManualOpts.reviewerFn`, `src/manual/analyze.ts:16,43`) → dá para **compor** um fluxo de 2
  passadas atrás da mesma porta, sem mexer no resto.

## 6. Proposta de implementação
**Ports & Adapters:** ambas as variantes entram pela **interface de IA já injetável** (`ReviewerFn`/
`ChatFn`) — o domínio não importa o LLM; testes usam um `chatFn` fake. **Sem money-path:** o número
nunca passa pela IA, então **não há gate de paridade** — mas há **gate de utilidade** (§7).

**(a) Gerador de hipótese de confronto (prioriza, não decide).**
1. 1ª IA recebe **perfis de time/jogador** (produção por eixo/corredor — reusa o dado de I2/I3) e
   devolve uma **lista de matchups a olhar** (ex.: `[{jogador, mercado, motivo_confronto}]`).
2. **O código** computa o `edge/EV` **desses** candidatos pelo motor de sempre (`probOverLine` →
   `buildCandidate` → `evaluateCandidates`) e **decide**.
3. A 2ª IA (a revisora atual) explica/veta como hoje.
- **Wire (snake_case PT):** saída da 1ª IA é só **roteamento** (`hipoteses_confronto: [{jogador,
  market_type, motivo}]`), **nunca** `prob_modelo`/`edge`. O candidato final mantém o contrato atual.
- ⚠️ **Limite duro:** a IA **não** pode encurtar a busca a ponto de **esconder** valor que o código
  acharia — ou a hipótese é **aditiva** (prioriza ordem/explicação, mas a força bruta continua
  rodando por baixo), ou é só um **ranqueador** do que o código já gerou. Nunca deixar a IA ser o
  **filtro** que define o universo.

**(b) Veto adversarial (promotor × cético).**
Para **cada recomendado** (`recomendado=true`), rodar N "céticos" (chamadas LLM com o prompt afiado
para **refutar**: "aponte o motivo concreto, ancorado em campo recebido, para NÃO apostar"). **Regra
de código** decide: mantém o recomendado **só se sobrevive** (nenhum cético produz um veto válido
ancorado em campo). Reaproveita o `stance: "veta"` que a revisora já produz (`src/ai/reviewer.ts:60`).
- **Pseudo-código (domínio orquestra; IA é injetada):**
  ```ts
  // após reviewCandidates; chatFn injetada, fail-closed mantém o status quo
  async function adversarialVeto(rec: Candidate, chatFn: ChatFn, n = 2): Promise<boolean> {
    for (let i = 0; i < n; i++) {
      const veto = await skepticRefute(rec, chatFn);     // só lê campos; nunca cria número
      if (veto?.valido) return false;                    // refutado → cai
    }
    return true;                                          // sobreviveu → mantém
  }
  ```
- **Fail-closed:** IA indisponível/saída inválida → **não** muda a decisão do código (igual ao retry
  atual, `src/ai/reviewer.ts:104`). O cético só pode **cortar** um recomendado, nunca **promover** um
  reprovado.

**Recomendação:** começar por **(b)** — mais barato, mais seguro, ataca diretamente o falso-positivo.
(a) depende dos perfis de confronto de I2/I3 e tem mais risco de processo.

## 7. Plano de validação
- **Não muda o número → sem paridade**, mas precisa **medir utilidade**:
  - Comparar decisões **2ª-IA vs single-call** em **backtest/forward**: quantos recomendados o veto
    adversarial cortou, e desses, quantos **teriam perdido** (resultado 0) vs **teriam ganho** (1).
  - **Critério de aceite:** o fluxo de 2 passadas **reduz falso-positivo** (corta mais perdedores que
    vencedores) **sem matar valor** — ou seja, não derruba candidatos de `edge/EV` saudáveis que
    venceriam. Medir via `paper_ledger` (I7): comparar Brier/acerto do subconjunto recomendado com e
    sem o veto.
- **Determinismo de teste:** `chatFn` fake → testar que (i) veto válido corta, (ii) fail-closed
  preserva, (iii) a IA **nunca** altera `prob_modelo`/`edge`/`recomendado` por conta própria.

## 8. Riscos & armadilhas
- **PROIBIDO a IA selecionar por feeling:** o número **e a decisão final** ficam no **código**. A IA
  **propõe** (hipótese) ou **critica** (veto ancorado em campo) — fim. Qualquer desenho em que a saída
  do LLM **vire** a recomendação viola o princípio inegociável (`docs/proximos-passos/README.md:63`).
- **Hipótese que esconde valor:** se (a) virar **filtro**, a IA pode podar candidatos que o código
  acharia bons → perda de valor silenciosa. Manter aditivo/ranqueador (ver §6a).
- **Complexidade e latência:** +chamadas LLM = mais latência e mais pontos de falha. Manter o
  **fail-closed** (degradar para o fluxo atual) em toda falha.
- **Alucinação no veto:** o cético tem que ancorar em **campo recebido** (mesma trava do prompt atual,
  `src/ai/reviewer.ts:17-24`); veto sem âncora = inválido (não corta).

## 9. Dependências
- **I7** (loop forward / `paper_ledger`) para **medir** se a 2ª IA reduz falso-positivo sem matar valor.
- **(a) apenas:** os perfis de confronto de **I2/I3** (a hipótese precisa de algo concreto para sugerir).
- Reuso de `src/ai/reviewer.ts` e `src/ai/analyst.ts` (padrão fail-closed + ancoragem já prontos).

## 10. Esforço estimado
**Médio-Alto:** (b) veto adversarial ≈ 1-1.5 dia (orquestração + prompt do cético + regra de corte +
testes com `chatFn` fake). (a) gerador de hipótese ≈ +1-2 dias e **depende** de I2/I3. Medir utilidade
(harness comparando decisões) ≈ +0.5-1 dia.

## 11. Checklist de aceite
- [ ] 2ª chamada entra pela interface injetável (`ReviewerFn`/`ChatFn`); domínio não importa LLM.
- [ ] Veto adversarial **só corta** recomendados (nunca promove reprovado); fail-closed preserva a decisão do código.
- [ ] Teste com `chatFn` fake prova que a IA **não** altera `prob_modelo`/`edge`/`recomendado`.
- [ ] (Se a) hipótese é **aditiva/ranqueadora**, nunca filtro que esconde valor.
- [ ] Harness compara decisões 2ª-IA vs single-call (corta mais perdedores que vencedores).
- [ ] `npm test` verde (sem paridade tocada — é só IA).
- [ ] `docs/ROADMAP.md` / `docs/PITCH.md` atualizados (utilidade medida, não só "implementado").

## 12. Como verificar
```bash
npm test                 # testes da 2ª IA com chatFn fake (corte/fail-closed/não-altera-número)
npm run typecheck
```
```sql
-- utilidade via paper_ledger (I7): acerto do recomendado com vs sem o veto adversarial
select market_type, count(*) n,
       avg(resultado) taxa_acerto
from paper_ledger where resultado is not null group by market_type;
```
