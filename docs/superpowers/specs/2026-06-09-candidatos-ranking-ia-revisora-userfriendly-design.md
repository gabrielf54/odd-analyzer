# Ranking risco/retorno + IA revisora + tela userfriendly

**Data:** 2026-06-09
**Repos:** `odd-analyzer` (backend) + `odd-analyzer-frontend` (frontend)
**Estado:** aprovado no brainstorming, pronto pra plano.

## Problema

A rota de análise manual devolve N candidatos (todos com edge>0) ordenados por **EV puro**.
O dono abre a tela e **não consegue decidir qual apostar**:

1. EV puro joga o **tiro-longo** pro topo (ex.: Rice over 4.5 desarmes @ 8.0, EV +1.09, mas modelo só 26% — acerta 1 em 4). Parece "a melhor" e não é a mais sólida.
2. O **mesmo jogador aparece várias vezes** (Rice em 4 linhas) solto na lista → parece 4 apostas, quando é "escolha UMA linha".
3. **Sem veredito**: a IA está desligada na rota manual (`app.ts` chama `analyzeManualService` sem `useAi`), então `melhor_aposta` vem `null` e a tela mostra rascunho cru.
4. Números crus (`edge +0.136`, `ev +1.090`) **não significam nada pro dono leigo**.

## Doutrina respeitada

- **Código calcula e decide o número; IA nunca inventa** (princípio inegociável do produto).
- Classificar/ordenar por probabilidade do modelo é **apresentação**, NÃO o proibido "filtrar por probabilidade alta": ninguém é removido — todos já passaram no corte edge>0; o tiro-longo +EV continua visível.
- Money-path (`model/`, `value/`) **não muda** → gate de paridade (1e-9) intacto. As peças novas (`rank`, `reviewer`) são camadas acima, puras e testáveis.

## Decisões do brainstorming

1. **Ranking = equilíbrio risco/retorno** (não EV puro). Tiro-longo continua visível como alternativa marcada.
2. **Código decide + ordena + marca a ⭐ melhor. IA revisa** (✅ concorda / ⚠️ ressalva / ⛔ veta) **e explica**. Se **código aprovou mas IA vetou → mostrar o conflito** ao usuário, em linguagem clara.
3. **IA roda sempre, automático**, em **1 chamada** que revisa todos os candidatos + explica o topo.
4. **Tudo userfriendly** — nada de jargão cru na tela.

---

## Parte 1 — Motor de decisão (backend, código puro)

### Faixas de risco (pela `prob_modelo`)

| Faixa (`risco`) | Regra | Significado plano |
|---|---|---|
| `seguro` | prob_modelo ≥ 0.50 | "acontece mais vezes que não" |
| `moderado` | 0.35 ≤ prob_modelo < 0.50 | "acontece com frequência razoável" |
| `tiro_longo` | prob_modelo < 0.35 | "paga muito, acerta pouco" |

Cortes `0.50` / `0.35` ficam em **constantes nomeadas e exportadas** (ajustáveis num lugar só), com comentário.

### Ordenação

1. Faixa primeiro: todos os `seguro`, depois `moderado`, depois `tiro_longo`.
2. Dentro da faixa: **EV decrescente**.
3. A ⭐ **recomendada = primeiro da lista** (melhor seguro; se não houver seguro, melhor moderado; etc.).

Validação na massa real (England × Costa Rica): a ⭐ cai em **Rice over 2.5 desarmes @ 2.37** (modelo 54%), e Rice 4.5 @ 8.0 vai pro fim como `tiro_longo` — bate exatamente com a intenção aprovada.

### Módulo novo: `src/candidates/rank.ts`

Funções puras (sem I/O):

```ts
export type Risco = "seguro" | "moderado" | "tiro_longo";
export const RISK_SEGURO = 0.50;   // ajustável
export const RISK_MODERADO = 0.35; // ajustável

export function classifyRisk(probModelo: number): Risco;

/** Devolve cópia ordenada (faixa → EV desc); anexa `risco` a cada um e
 *  `recomendado: true` só no primeiro. Lista vazia → vazia. */
export function rankCandidates(approved: Candidate[]): Candidate[];
```

Campos novos por candidato (no fio, **snake_case PT**):
- `risco: "seguro" | "moderado" | "tiro_longo"`
- `recomendado: boolean` (true só no ⭐)

---

## Parte 2 — IA revisora (backend)

Substitui, **só na rota manual**, o `melhor_aposta`-picker por um **revisor cético**. O fluxo ao vivo (`runner`/`pipeline`/`analyze`/`fakeAnalyst`) **não muda** (mantém shape antigo `{melhor_aposta, outras, alertas}`).

### Contrato

Entrada: candidatos **já ranqueados** (com `risco` + `recomendado`).
Uma chamada → saída JSON:

```json
{
  "topo_explicacao": "1-2 frases sobre a ⭐ recomendada, ancoradas SÓ nos campos recebidos",
  "revisoes": [
    { "jogador": "Declan Rice", "linha": 2.5, "market_type": "desarmes",
      "stance": "concorda|ressalva|veta", "nota": "curta, ou null se concorda" }
  ],
  "alertas": ["..."]
}
```

Regras do prompt (sistema): é revisor conservador; **usa só os números recebidos, nunca inventa**; dá `stance` por candidato; `veta` quando há motivo concreto pra não apostar mesmo com edge>0 (ex.: amostra fraca, incerteza alta, linha muito esticada); explica a ⭐ em 1-2 frases. `stance ∈ {concorda, ressalva, veta}`.

### Módulo novo: `src/ai/reviewer.ts`

```ts
export async function reviewCandidates(
  candidatos: Candidate[], contexto: any, chatFn?: ChatFn
): Promise<ReviewResult>;
```

- 1 tentativa + 1 retry; saída validada (mesmo padrão do `analyst` atual). Validador novo seguindo o estilo de `ai/schema.ts`.
- **Fail-closed gracioso (revisor):** se a IA falhar OU não houver chave OpenRouter → **não veta nada nem aprova falso**: `ia_revisao = null` em todos, `topo_explicacao = null`, `alertas = ["IA indisponível — exibindo só o veredito do código"]`. O ranking do código segue funcionando sozinho.
- **Merge:** casa cada `revisao` ao candidato por `(jogador, linha, market_type)`; sem match → `ia_revisao = null`.
- Injetável (`chatFn`) → testes offline com fake.

### Resposta da rota manual (mudança de shape — só manual)

Cada candidato ganha:
- `ia_revisao: { stance: "concorda"|"ressalva"|"veta", nota: string | null } | null`

Topo da resposta:
- `ia: { topo_explicacao: string | null, alertas: string[] }` (substitui o `{melhor_aposta,outras,alertas}` **na rota manual**).

`analyzeManual` passa a: (a) `rankCandidates(approved)`, (b) `reviewCandidates(...)`, (c) mesclar revisões, (d) montar `ia`. `analystFn` da rota manual deixa de ser `fakeAnalyst`; injeção vira `reviewerFn` (default = real), tests injetam fake. `app.ts` continua sem precisar de flag (revisor é default na rota manual; degrada sozinho se faltar chave).

---

## Parte 3 — Tela userfriendly (frontend, `/coletar`)

Só a página `/coletar` muda. A página ao vivo (`app/page.tsx`, `CandidatesTable`, `AiVerdict`) fica intacta.

### 3.1 `RecommendationCard` (novo) — o herói no topo

Mostra a candidata `recomendado: true`, grande:
- Jogador + **linha amigável** ("3+ desarmes" em vez de "over 2.5").
- Barra modelo-vs-casa (reusa visual do `ProbBars`).
- **Tag de risco** (🟢 SEGURO / 🟡 MODERADO / 🔴 TIRO-LONGO).
- **EV em reais**: "+R$2,75 a cada R$10 apostado (média no longo prazo)".
- **Selo da IA** (✅ concorda / ⚠️ ressalva / ⛔ veta) + `ia.topo_explicacao`.
- **Conflito:** se `ia_revisao.stance === "veta"` no recomendado → estilo de alerta:
  *"O modelo viu valor aqui, mas a IA segurou: [nota]."* + ponteiro pra **próxima candidata sem veto**.

### 3.2 `CandidatesByPlayer` (novo) — lista agrupada

Substitui a `CandidatesTable` plana na página manual. **Agrupa por jogador** (resolve o "parece 4 apostas"):
- Cada jogador = um card; dentro, suas linhas na ordem global (risco → EV).
- Cada linha: linha amigável, odd, **tag de risco**, mini-barra, **EV em reais**, ícone de stance da IA (✅/⚠️/⛔ com a `nota` em tooltip). A linha ⭐ destacada.
- Mantém o `<details> mostrar investigação` por linha.

### 3.3 Linguagem amigável

- Cabeçalhos: "vantagem" (edge) e "retorno esperado" (EV); número cru fica secundário/tooltip.
- Helper `lib/format.ts`:
  - `friendlyLine(market_type, linha)` → "3+ desarmes" (usa `linha_label` se vier no futuro; senão deriva `ceil(linha)+`).
  - `evToReais(ev)` → "+R$2,75 / R$10".
  - `riscoLabel(risco)` → rótulo + cor + emoji.

### 3.4 Tipos (`lib/types.ts`)

- `Candidate` ganha `risco`, `recomendado`, `ia_revisao`.
- Novo `ManualIa { topo_explicacao: string | null; alertas: string[] }`.
- `ManualAnalysisResult.ia: ManualIa`. (O `Ai` antigo continua pro fluxo ao vivo.)

---

## Testes

**Backend (Vitest):**
- `rank.ts`: `classifyRisk` nos cortes (0.50, 0.35, bordas), ordenação faixa→EV, `recomendado` no primeiro, lista vazia, caso "sem nenhum seguro".
- `reviewer.ts`: fake chat → saída válida mescla por chave; saída inválida/erro/sem-chave → degrada (todos `null`, alerta certo); `veta` no recomendado é propagado.
- `analyzeManual`: integração com fakes (estende `manualPrompt.test.ts`) — candidatos saem ranqueados + com `ia_revisao`.

**Frontend:**
- `format.ts`: `friendlyLine` (over 2.5 → "3+"), `evToReais`, `riscoLabel`.
- Render mínimo: `RecommendationCard` no caso veto (mostra conflito) e no caso normal.

**Gate de paridade:** inalterado (money-path intocado).

## Fora de escopo (YAGNI)

- Não mexer no prompt de coleta nem no schema de entrada (`linha_label` é usado **se vier**, não exigido).
- Não mexer no fluxo ao vivo (`app/page.tsx`, runner).
- Sem stake-sizing/Kelly nesta entrega (só veredito + risco + EV legível).

## Docs vivos

Atualizar `docs/ROADMAP.md` e `docs/PITCH.md` no mesmo trabalho (novo veredito de UX da rota manual + IA revisora). Contagem de testes e data no cabeçalho do ROADMAP.
