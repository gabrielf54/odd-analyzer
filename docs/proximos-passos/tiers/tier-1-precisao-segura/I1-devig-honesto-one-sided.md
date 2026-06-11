# I1 — De-vig honesto + flag one-sided

## 1. TL;DR
Quando a casa der os **dois lados** (over **e** under), tirar a margem de verdade (de-vig de 2 vias)
para achar a `prob_devig` justa; quando só houver o over (player prop = **one-sided**), **manter o
teste conservador** (implícita crua, com margem) **mas sinalizar** — nunca assumir uma margem fixa
para "destravar" valor (criaria valor-fantasma, proibido). De quebra, **corrigir um bug latente**:
mercado de partida sem `odd_under` hoje passa `0` ao builder e faz `impliedProb(0)` lançar exceção.

## 2. Status
- **Ajuda à meta:** **Médio** (não muda `prob_modelo`; muda *quais candidatos passam o corte de edge* e conserta um caminho possivelmente quebrado).
- **Pronto p/ Copa:** ✅ Sim (a correção do bug é urgente; o de-vig de 2 vias só age quando há `odd_under`).
- **Esforço:** **Médio**.
- **Risco de calibração/paridade:** **Baixo** — não toca μ, NB2, shrinkage nem o modelo de partida; só o ramo de `prob_devig`/edge. As golden de `test/parity/` testam o número do modelo, não o de-vig de odds coladas; confirmar que seguem verdes.
- **Custo de dado:** **$0** — a coluna `odd_under` já existe na tabela `odds` (`src/store/schema.sql:43`); é só capturá-la e passá-la adiante.

## 3. Problema / fundamento
**De-vig = tirar o lucro embutido da casa.** A casa embute uma margem (a "vig"/"juice") no preço.
A probabilidade implícita crua (`1/odd`) está **inflada** por essa margem. Para comparar honestamente,
precisamos do número **justo** (sem margem) — e comparamos **nosso `prob_modelo` contra esse justo**,
**não contra a odd crua** (princípio inegociável: valor = `prob_modelo > prob_devig`, EV/edge+).

Com os **dois lados** (over+under), dá para remover a margem: as duas implícitas somam > 1 (o excesso
é a vig); normaliza-se (multiplicativo) ou acha-se o expoente que as faz somar 1 (power). Com **um
lado só** (player prop, a casa dá só o over), **não há como separar margem de probabilidade** — então
hoje usa-se a implícita **crua** do over. Isso é **conservador** (a margem está dentro, então o número
"justo" sai maior do que o real → exige edge maior para passar → mais difícil sinalizar). É a escolha
certa para **não inventar valor**, mas é **cega**: descarta valor real (falso-negativo) e impede medir
CLV limpo (o "fechamento" também viria com margem desconhecida).

Em termos de **confronto × concessão**: o motor já fez o trabalho (μ de quem produz a ação × concessão
do adversário → `prob_modelo`). O de-vig é o **outro lado da balança** — o número justo da casa. Se ele
está inflado, a balança pende artificialmente contra nós e **boas oportunidades de confronto morrem no
corte de edge** sem que o modelo esteja errado.

## 4. Evidência real (números + `file:line`)
- **One-sided é o padrão em player prop, e a margem NÃO é removida:**
  `src/candidates/builder.ts:34` — `const semDevig = a.odd_under == null;` e
  `:35` — `const prob_devig = semDevig ? impliedProb(a.odd_over) : fairProbOver(...)`.
  No dossiê real do Rice (event 9099, amistoso England) **todos os candidatos têm `sem_devig=true`**
  e `prob_devig = 1/odd` exato — ex.: `prob_devig ≈ 0.42194 = 1/2.37` (margem dentro, não removida).
- **A BSD só dá odds de mercado de PARTIDA** (1x2 / over-under gols / BTTS — com os dois lados);
  **player prop não existe na BSD** → as odds de desarmes/sot/finalizações/escanteios são **coladas
  manualmente, tipicamente só o over** → `sem_devig=true`. (Sondagem 2026-06-11; ver ficha N4.)
- **A flag já trafega no fio e chega à IA:** `builder.ts:44` — `sem_devig: semDevig` (no candidato);
  o prompt da IA lista `sem_devig` entre as palavras proibidas de citar, mas o campo existe para a
  lógica (`src/ai/reviewer.ts:39`).
- **A coluna do outro lado existe no banco:** `src/store/schema.sql:43` — `odd_under numeric` (nullable)
  na tabela `odds`.

## 5. Estado atual no código (o que existe / o que falta)
**Já existe:**
- `src/value/devig.ts` — toda a matemática de de-vig:
  - `impliedProb:2` (e o **throw** em `:3` — `if (odd <= 1.0) throw ... "odd decimal deve ser > 1.0"`).
  - `devigMultiplicative:8` (normalização proporcional).
  - `devigPower:15` (acha `k` por bisseção tal que `io^k + iu^k = 1`).
  - `fairProbOver:29` — **conservador**: `Math.max` dos dois métodos.
- `src/candidates/builder.ts:34-35` — o ramo `semDevig`; `:36` `edgeEv(prob_modelo, prob_devig, odd_over)`; `:44` expõe `sem_devig` no fio.
- A tabela `odds` já guarda `odd_under` (`schema.sql:43`).

**Falta / GOTCHA latente (o ponto mais importante desta ficha):**
- **Bug do `0` em mercado de partida.** Em `src/manual/analyze.ts:64-67`, o ramo de mercado de
  partida monta o `ManualOdds` assim:
  ```ts
  const provider = new ManualOdds(lines.map((l) => ({
    entidade: l.entidade, linha: l.linha, odd_over: l.odd_over,
    odd_under: l.odd_under ?? 0, book: l.book,         // ← coalescência para 0 quando não há under
  })));
  ```
  `ManualOdds.lines()` (`src/providers/odds.ts:17-20`) devolve essas linhas **cruas** (não filtra o
  `0`). O candidato é montado com `odd_under = 0`. No builder, `a.odd_under == null` é **false** para
  `0` (`builder.ts:34`), então cai no ramo de-vig: `fairProbOver(odd_over, 0)` → dentro,
  `devigMultiplicative(odd_over, 0)` → `impliedProb(0)` → **lança** `"odd decimal deve ser > 1.0"`
  (`devig.ts:3`). **Resultado:** um mercado de partida colado **sem under** quebra a análise inteira
  (a exceção sobe por `matchCount`/`runMatch` até `analyzeManual`). Confirme lendo `src/providers/odds.ts`
  (`ManualOdds.lines()`) e `src/manual/analyze.ts:64-67`.
- **Captura do `odd_under` real:** quando a casa **oferece** o under (em mercado de partida, ou raros
  prop com 2 lados), ele precisa **chegar ao builder** para o de-vig de 2 vias acontecer. Hoje o
  player-flow (`playerCandidates`, `analyze.ts:132-141`) passa `odd_under: od.odd_under` vindo do
  match — então prop já está pronto **se** a odd colada tiver under; o problema concentra-se no ramo
  de partida (o `?? 0`).

## 6. Proposta de implementação
**Princípio que NÃO se viola:** quando genuinamente one-sided, **continua conservador**. Não se assume
margem fixa para inflar o edge — isso fabricaria valor onde não há (proibido).

**Passo 1 — corrigir o bug do `0` (urgente, isolado).** Em `src/manual/analyze.ts:64-67`, trocar a
coalescência para **`null`**, não `0`:
```ts
const provider = new ManualOdds(lines.map((l) => ({
  entidade: l.entidade, linha: l.linha, odd_over: l.odd_over,
  odd_under: l.odd_under ?? null,   // ← null, não 0: deixa o builder cair no ramo conservador
  book: l.book,
})));
```
Assim, mercado de partida **sem** under vira `sem_devig=true` (conservador, como prop), em vez de
estourar `impliedProb(0)`. **Defesa em profundidade (opcional):** em `src/value/devig.ts`, antes de
chamar `impliedProb`, tratar `odd <= 1.0` (inclui `0`) como "lado ausente" e cair no conservador — mas
a correção na origem (`?? null`) é a principal; mexer no `devig.ts` exige rodar `test/parity/` por
precaução.

**Passo 2 — de-vig de 2 vias quando houver `odd_under`.** Nenhuma mudança de assinatura é necessária:
`buildCandidate` já chama `fairProbOver(a.odd_over, a.odd_under)` quando `odd_under != null`
(`builder.ts:35`). Basta **garantir que o `odd_under` real flua** ponta a ponta:
- na coleta/persistência (tabela `odds` já tem a coluna) → na entrada da análise (`ManualOddsLine.odd_under`)
  → ao builder. Para mercado de partida, o **Passo 1** já passa `odd_under ?? null` (real quando existir).
- **Contrato no fio (snake_case PT) — inalterado, só passa a ter valor quando há 2 lados:**
  ```jsonc
  // entrada (linha de odds)
  { "entidade": "partida", "market_type": "gols", "linha": 2.5,
    "odd_over": 1.90, "odd_under": 1.95, "book": "bet365" }
  // saída (candidato) — quando under presente:
  { "prob_devig": 0.512, "sem_devig": false, "edge": 0.03, "ev": 0.02, ... }
  // saída — one-sided (só over), conservador:
  { "prob_devig": 0.5263, "sem_devig": true, ... }   // 1/1.90, margem dentro
  ```

**Passo 3 — one-sided: manter conservador E sinalizar (já existe, reforçar).** `sem_devig=true` já vai
ao fio (`builder.ts:44`) e a IA já o conhece (`reviewer.ts:39`). Garantir que o **front/IA comuniquem**
"este número é conservador (sem o outro lado da casa para tirar a margem)" — sem que isso vire um
ajuste numérico. **Não** transformar `sem_devig` em multiplicador.

**Passo 4 (ideia avançada, NÃO-default, documentar apenas).** Estimar a **margem típica da casa** a
partir dos **mercados de PARTIDA da mesma casa** (que têm os dois lados → margem mensurável) e usá-la
como **teto** para descontar do one-sided. É plausível (a vig de uma casa é relativamente estável
entre mercados), mas **arriscado** (margem de prop costuma ser **maior** que a de 1x2 → subestimaria a
margem → inflaria o edge → valor-fantasma). **Só** entra se: (a) for explicitamente um **teto
conservador** (nunca reduz a margem assumida abaixo da medida em partida) e (b) for **validado no
forward** (CLV) antes de virar default. Por ora: **documentado como norte, desligado.**

**Ports & Adapters:** `devig.ts` e `builder.ts` são domínio puro (sem I/O) — permanecem assim. A
captura do `odd_under` é responsabilidade da borda (schema/provider de odds), não do motor.

## 7. Plano de validação
Não há recalibração (o μ/`prob_modelo` não muda). A validação é de **corretude** + **forward**:
- **Testes unitários (offline, determinísticos):**
  - De-vig de 2 vias: dado `odd_over` e `odd_under`, `prob_devig` bate com `fairProbOver` calculado à
    mão; `sem_devig=false`.
  - One-sided: `odd_under=null` → `prob_devig = 1/odd_over` exato; `sem_devig=true`; **não lança**.
  - **Teste de regressão do bug do `0`:** mercado de partida com linha **sem** `odd_under` → a análise
    completa **não lança**, e o candidato sai `sem_devig=true` (antes do fix: `impliedProb(0)` estourava).
  - Gate de paridade: `test/parity/` segue verde (o número do modelo não mudou).
- **Forward (depende de I7):** I1 muda **quais** candidatos passam o corte `edge≥0.04` (em mercados
  com 2 lados). **Critério de aceite empírico:** registrar no `paper_ledger` os candidatos recém-
  capturados (antes descartados por edge inflado) e, ao longo da Copa, conferir que **não pioram**
  Brier/CLV — idealmente o CLV médio desses confirma que era valor real escondido pela margem.

## 8. Riscos & armadilhas
- **Assumir margem fixa = valor-fantasma (PROIBIDO).** O Passo 4 só existe como teto conservador
  validado; o **default é manter conservador** no one-sided.
- **O bug do `0` pode estar quebrando mercado de partida sem under HOJE.** Priorizar o Passo 1; é a
  parte com efeito imediato (uma exceção que aborta a análise).
- **Não confundir conservador com "errado".** One-sided conservador **subestima** o edge de propósito;
  isso é o lado seguro (falso-negativo, não falso-positivo). Comunicar via `sem_devig`, não "corrigir"
  numericamente sem validação.
- **Paridade:** se mexer em `devig.ts` (defesa em profundidade), rodar `test/parity/` antes/depois.
  A correção em `analyze.ts` (`?? null`) não toca o motor.
- **`fairProbOver` é `max` dos dois métodos** (`devig.ts:32`) — deliberadamente conservador mesmo com 2
  lados. Não trocar por `min`/média sem validar (mudaria o edge para mais agressivo).

## 9. Dependências
- **Nenhuma para os Passos 1–3** (são correção + fluxo de um campo já existente).
- **Para medir o ganho:** **I7** (loop forward / `paper_ledger`) — sem ele, o efeito "captura valor
  antes descartado" não tem como ser confirmado.
- **Sinergia com N4:** N4 traz `odd_under` automático de mercado de partida (BSD), que é exatamente o
  insumo do de-vig de 2 vias do Passo 2.

## 10. Esforço estimado
**Médio.** Passo 1 (fix do `0`) + Passo 2/3 (fluxo do `odd_under` + testes): ~0,5–1 dia, a maior parte
em testes (2 vias, one-sided, regressão do `0`). Passo 4 fica só **documentado** (não implementado agora).

## 11. Checklist de aceite
- [ ] `src/manual/analyze.ts:64-67` passa `odd_under: l.odd_under ?? null` (não `0`).
- [ ] Mercado de partida colado **sem** under **não lança** mais; sai `sem_devig=true` (teste de regressão).
- [ ] Quando há `odd_under`, `prob_devig` usa de-vig de 2 vias (`sem_devig=false`) e bate com cálculo à mão.
- [ ] One-sided segue conservador (`prob_devig = 1/odd_over`, `sem_devig=true`) e a IA/front comunicam isso.
- [ ] **Nenhuma** margem fixa assumida por default (Passo 4 só documentado, desligado).
- [ ] `npm test` verde; golden de `test/parity/` intactas.
- [ ] `docs/ROADMAP.md` atualizado (de-vig honesto + fix do bug do under).

## 12. Como verificar
```bash
npm test                  # suíte verde; inclui os testes de de-vig 2-vias / one-sided / regressão do 0
npm run typecheck
```
Reproduzir o bug do `0` (antes do fix) com um mercado de partida sem under — em um teste, montar uma
linha `{ market_type: "gols", linha: 2.5, odd_over: 1.90 }` (sem `odd_under`) e rodar `analyzeManual`:
antes do fix estoura `"odd decimal deve ser > 1.0"` (de `src/value/devig.ts:3`); depois sai
`sem_devig=true` sem exceção.

Conferir no banco que a coluna do outro lado já existe e quantas odds têm under (insumo do de-vig real):
```sql
-- Supabase MCP (execute_sql)
select market_type,
       count(*) total,
       count(odd_under) com_under
from odds
group by market_type
order by market_type;
```
Player prop deve vir majoritariamente **sem** `odd_under` (one-sided → conservador); mercado de partida
é onde o de-vig de 2 vias passa a agir (e onde N4 vai preencher `odd_under` automaticamente).
