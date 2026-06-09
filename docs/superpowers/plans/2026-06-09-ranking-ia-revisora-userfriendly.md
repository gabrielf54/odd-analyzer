# Ranking risco/retorno + IA revisora + tela userfriendly — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a saída crua de candidatos da rota manual numa decisão clara — código classifica risco e marca a ⭐ melhor, IA revisa (concorda/ressalva/veta) e explica, e a tela mostra tudo agrupado por jogador e em linguagem leiga.

**Architecture:** Duas camadas novas e puras acima do money-path intocado: `rank` (ordena por faixa de risco → EV) e `reviewer` (1 chamada de IA que anota cada candidato + explica o topo, com degradação graciosa). A rota manual passa a chamar as duas; o fluxo ao vivo não muda. O frontend ganha um card-herói + lista agrupada + helpers de formatação amigável.

**Tech Stack:** Backend Node/TS (ESM, NodeNext, strict), Vitest. Frontend Next.js + Tailwind, Vitest. Spec: `docs/superpowers/specs/2026-06-09-candidatos-ranking-ia-revisora-userfriendly-design.md`.

**Repos:**
- Backend: `C:\Users\gabri\Documents\projects\odd-analyzer` (rodar `npm test` / `npm run typecheck` da raiz)
- Frontend: `C:\Users\gabri\Documents\projects\odd-analyzer-frontend`

---

## File Structure

**Backend (cria):**
- `src/candidates/rank.ts` — classificação de risco + ordenação faixa→EV + marca `recomendado`.
- `src/ai/reviewSchema.ts` — validador da saída da IA revisora (anti-alucinação).
- `src/ai/reviewer.ts` — `reviewCandidates`: 1 chamada, merge por chave, degradação graciosa.
- `test/rank.test.ts`, `test/reviewer.test.ts` — testes das peças novas.

**Backend (modifica):**
- `src/manual/analyze.ts` — chamar `rankCandidates` + `reviewCandidates`; opt `reviewerFn`.
- `src/service.ts` — `analyzeManualService` passa o revisor real (default).
- `test/manualFixtures.ts` — adicionar `fakeReviewer`.
- `test/manualAnalyze.test.ts` — usar `reviewerFn` + asserts de `risco`/`recomendado`/`ia_revisao`.
- `docs/ROADMAP.md`, `docs/PITCH.md` — registrar a entrega.

**Frontend (cria):**
- `lib/format.ts` + `lib/format.test.ts` — `friendlyLine`, `evToReais`, `riscoLabel`.
- `components/RecommendationCard.tsx` — herói (⭐ + selo da IA + conflito).
- `components/CandidatesByPlayer.tsx` — lista agrupada por jogador.

**Frontend (modifica):**
- `lib/types.ts` — `Candidate` ganha `risco`/`recomendado`/`ia_revisao`; novo `ManualIa`.
- `app/coletar/page.tsx` — usar os componentes novos no lugar de `AiVerdict`/`CandidatesTable`.

---

## Task 1: Motor de risco e ranking (backend)

**Files:**
- Create: `src/candidates/rank.ts`
- Test: `test/rank.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/rank.test.ts
import { describe, it, expect } from "vitest";
import { classifyRisk, rankCandidates, RISK_SEGURO, RISK_MODERADO } from "../src/candidates/rank.js";

describe("classifyRisk", () => {
  it("usa os cortes 0.50 / 0.35 (bordas inclusivas no piso da faixa)", () => {
    expect(classifyRisk(0.50)).toBe("seguro");
    expect(classifyRisk(0.54)).toBe("seguro");
    expect(classifyRisk(0.49)).toBe("moderado");
    expect(classifyRisk(0.35)).toBe("moderado");
    expect(classifyRisk(0.34)).toBe("tiro_longo");
    expect(classifyRisk(0.10)).toBe("tiro_longo");
    expect(RISK_SEGURO).toBe(0.50);
    expect(RISK_MODERADO).toBe(0.35);
  });
});

describe("rankCandidates", () => {
  const mk = (jogador: string, prob: number, ev: number) =>
    ({ jogador, prob_modelo: prob, ev });

  it("ordena faixa (seguro→moderado→tiro_longo) e por EV desc dentro da faixa", () => {
    const out = rankCandidates([
      mk("longo_alto_ev", 0.26, 1.09),  // tiro_longo, EV altíssimo
      mk("seguro_baixo_ev", 0.54, 0.27), // seguro
      mk("moderado", 0.38, 0.66),        // moderado
      mk("seguro_alto_ev", 0.60, 0.40),  // seguro, EV maior
    ]);
    expect(out.map((c) => c.jogador)).toEqual([
      "seguro_alto_ev", "seguro_baixo_ev", "moderado", "longo_alto_ev",
    ]);
    expect(out[0].risco).toBe("seguro");
    expect(out[3].risco).toBe("tiro_longo");
  });

  it("marca recomendado=true só no primeiro", () => {
    const out = rankCandidates([mk("a", 0.6, 0.4), mk("b", 0.55, 0.3)]);
    expect(out[0].recomendado).toBe(true);
    expect(out[1].recomendado).toBe(false);
  });

  it("lista vazia → vazia", () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it("não muta a entrada", () => {
    const input = [mk("a", 0.6, 0.4)];
    rankCandidates(input);
    expect(input[0]).not.toHaveProperty("risco");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rank`
Expected: FAIL — não encontra `../src/candidates/rank.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/candidates/rank.ts
/** Faixa de risco de um candidato, derivada da prob_modelo. Valor no fio (PT). */
export type Risco = "seguro" | "moderado" | "tiro_longo";

// Cortes ajustáveis num lugar só. Âncoras leigas:
// 0.50 = "acontece mais vezes que não"; 0.35 = "acontece com frequência razoável".
export const RISK_SEGURO = 0.50;
export const RISK_MODERADO = 0.35;

export function classifyRisk(probModelo: number): Risco {
  if (probModelo >= RISK_SEGURO) return "seguro";
  if (probModelo >= RISK_MODERADO) return "moderado";
  return "tiro_longo";
}

const ORDEM: Record<Risco, number> = { seguro: 0, moderado: 1, tiro_longo: 2 };

/** Cópia ordenada por faixa (seguro→moderado→tiro_longo) e EV desc dentro da faixa.
 * Anexa `risco` a cada candidato e `recomendado: true` só no primeiro.
 * Isto é APRESENTAÇÃO (ninguém é removido — todos já passaram no edge>0), não o
 * proibido "filtrar por probabilidade alta". Lista vazia → vazia. */
export function rankCandidates(
  approved: Record<string, unknown>[],
): Record<string, unknown>[] {
  const withRisk = approved.map((c) => ({
    ...c,
    risco: classifyRisk((c["prob_modelo"] as number) ?? 0),
  }));
  withRisk.sort((a, b) => {
    const d = ORDEM[a.risco as Risco] - ORDEM[b.risco as Risco];
    if (d !== 0) return d;
    return ((b["ev"] as number) ?? -Infinity) - ((a["ev"] as number) ?? -Infinity);
  });
  return withRisk.map((c, i) => ({ ...c, recomendado: i === 0 }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rank`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/candidates/rank.ts test/rank.test.ts
git commit -m "feat: ranking por faixa de risco (seguro/moderado/tiro_longo) + marca recomendado"
```

---

## Task 2: IA revisora — validador + reviewer (backend)

**Files:**
- Create: `src/ai/reviewSchema.ts`, `src/ai/reviewer.ts`
- Test: `test/reviewer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/reviewer.test.ts
import { describe, it, expect } from "vitest";
import { validateReview } from "../src/ai/reviewSchema.js";
import { reviewCandidates } from "../src/ai/reviewer.js";

const cands = [
  { jogador: "Declan Rice", linha: 2.5, market_type: "desarmes", recomendado: true },
  { jogador: "Bukayo Saka", linha: 1.5, market_type: "desarmes", recomendado: false },
];

const validOut = {
  topo_explicacao: "Rice pega adversário que concede muitos desarmes; modelo 54%.",
  revisoes: [
    { jogador: "Declan Rice", linha: 2.5, market_type: "desarmes", stance: "concorda", nota: null },
    { jogador: "Bukayo Saka", linha: 1.5, market_type: "desarmes", stance: "veta", nota: "amostra fraca" },
  ],
  alertas: [],
};

describe("validateReview", () => {
  it("aceita saída bem-formada que só cita candidatos recebidos", () => {
    expect(validateReview(validOut, cands)).toBe(true);
  });
  it("rejeita stance inválido", () => {
    const bad = { ...validOut, revisoes: [{ ...validOut.revisoes[0], stance: "talvez" }] };
    expect(validateReview(bad, cands)).toBe(false);
  });
  it("rejeita revisão de candidato inexistente (anti-alucinação)", () => {
    const bad = { ...validOut, revisoes: [
      { jogador: "Fantasma", linha: 9.5, market_type: "desarmes", stance: "concorda", nota: null },
    ] };
    expect(validateReview(bad, cands)).toBe(false);
  });
  it("rejeita estrutura sem as chaves obrigatórias", () => {
    expect(validateReview({ revisoes: [], alertas: [] }, cands)).toBe(false);
  });
});

describe("reviewCandidates", () => {
  it("mescla ia_revisao por chave (jogador|linha|market_type) e devolve topo_explicacao", async () => {
    const fakeChat = async () => JSON.stringify(validOut);
    const out = await reviewCandidates(cands, { jogo: "x" }, fakeChat);
    const rice = out.candidatos.find((c: any) => c.jogador === "Declan Rice");
    const saka = out.candidatos.find((c: any) => c.jogador === "Bukayo Saka");
    expect(rice.ia_revisao).toEqual({ stance: "concorda", nota: null });
    expect(saka.ia_revisao).toEqual({ stance: "veta", nota: "amostra fraca" });
    expect(out.ia.topo_explicacao).toContain("Rice");
  });

  it("saída inválida → degrada (ia_revisao null em todos, alerta)", async () => {
    const fakeChat = async () => "{ lixo nao-json";
    const out = await reviewCandidates(cands, { jogo: "x" }, fakeChat);
    expect(out.candidatos.every((c: any) => c.ia_revisao === null)).toBe(true);
    expect(out.ia.topo_explicacao).toBeNull();
    expect(out.ia.alertas[0]).toMatch(/indispon/i);
  });

  it("chat lança (sem chave/erro de rede) → degrada", async () => {
    const fakeChat = async () => { throw new Error("OPENROUTER_API_KEY ausente"); };
    const out = await reviewCandidates(cands, { jogo: "x" }, fakeChat);
    expect(out.candidatos.every((c: any) => c.ia_revisao === null)).toBe(true);
    expect(out.ia.alertas[0]).toMatch(/indispon/i);
  });

  it("lista vazia → vazia, sem chamar a IA", async () => {
    let chamou = false;
    const fakeChat = async () => { chamou = true; return "{}"; };
    const out = await reviewCandidates([], { jogo: "x" }, fakeChat);
    expect(out.candidatos).toEqual([]);
    expect(chamou).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reviewer`
Expected: FAIL — não encontra `../src/ai/reviewSchema.js`.

- [ ] **Step 3: Write the validator**

```ts
// src/ai/reviewSchema.ts
// Valida a saída da IA revisora sem lib externa. Garante estrutura E que a IA não
// inventou candidato fora dos recebidos (anti-alucinação), no estilo de ai/schema.ts.
const STANCES = new Set(["concorda", "ressalva", "veta"]);

function validReviewItem(r: any, validKeys: Set<string>): boolean {
  if (r == null || typeof r !== "object") return false;
  if (!["jogador", "linha", "market_type", "stance"].every((k) => k in r)) return false;
  if (!STANCES.has(r.stance)) return false;
  return validKeys.has(`${r.jogador}|${r.linha}|${r.market_type}`);
}

export function validateReview(obj: any, candidates: any[]): boolean {
  if (obj == null || typeof obj !== "object") return false;
  if (!["topo_explicacao", "revisoes", "alertas"].every((k) => k in obj)) return false;
  if (!Array.isArray(obj.revisoes) || !Array.isArray(obj.alertas)) return false;
  if (obj.topo_explicacao !== null && typeof obj.topo_explicacao !== "string") return false;
  const keys = new Set(candidates.map((c) => `${c.jogador}|${c.linha}|${c.market_type}`));
  return obj.revisoes.every((r: any) => validReviewItem(r, keys));
}
```

- [ ] **Step 4: Write the reviewer**

```ts
// src/ai/reviewer.ts
import { chat as defaultChat, type Msg } from "./openrouter.js";
import { validateReview } from "./reviewSchema.js";

export const PROMPT_REVISOR =
  "Você é um revisor de apostas conservador e cético. Recebe um JSON com candidatos " +
  "JÁ calculados e ordenados em código (prob_modelo, prob_devig, edge, ev, risco, " +
  "recomendado, amostra_jogos, incerteza, xi_confirmado). REGRAS: use SOMENTE os " +
  "números recebidos; NUNCA invente número, estatística ou lesão; dê um 'stance' para " +
  "CADA candidato recebido; use 'veta' quando houver motivo concreto pra não apostar " +
  "mesmo com edge>0 (ex.: amostra fraca, incerteza alta, linha muito esticada), " +
  "'ressalva' para cautela, 'concorda' quando estiver ok; explique a candidata " +
  "recomendada (recomendado=true) em 1-2 frases ancoradas SÓ nos campos recebidos. " +
  "Responda APENAS JSON: {\"topo_explicacao\": string|null, \"revisoes\": " +
  "[{\"jogador\",\"linha\",\"market_type\",\"stance\",\"nota\"}], \"alertas\": []}. " +
  "stance ∈ {concorda,ressalva,veta}; nota é string curta ou null.";

export type ChatFn = (messages: Msg[], opts?: { temperature?: number }) => Promise<string>;

export interface Revisao { stance: "concorda" | "ressalva" | "veta"; nota: string | null; }
export interface ReviewResult {
  candidatos: Record<string, unknown>[];
  ia: { topo_explicacao: string | null; alertas: string[] };
}

function parse(texto: string): any {
  try { return JSON.parse(texto); } catch { return null; }
}

/** Revisa os candidatos ranqueados numa única chamada: anexa `ia_revisao` a cada um
 * (merge por jogador|linha|market_type) e devolve a explicação do topo. 1 tentativa
 * + 1 retry; qualquer falha (saída inválida, erro de rede, sem chave) degrada de
 * forma graciosa: não veta nem aprova falso — ia_revisao=null em todos + alerta. */
export async function reviewCandidates(
  candidatos: Record<string, unknown>[],
  contexto: any,
  chatFn: ChatFn = defaultChat,
): Promise<ReviewResult> {
  if (candidatos.length === 0) {
    return { candidatos: [], ia: { topo_explicacao: null, alertas: [] } };
  }
  const messages: Msg[] = [
    { role: "system", content: PROMPT_REVISOR },
    { role: "user", content: JSON.stringify({ contexto, candidatos }) },
  ];
  for (let i = 0; i < 2; i++) {
    let raw: string;
    try { raw = await chatFn(messages, { temperature: 0.0 }); } catch { continue; }
    const obj = parse(raw);
    if (obj != null && validateReview(obj, candidatos)) {
      const byKey = new Map<string, Revisao>();
      for (const r of obj.revisoes) {
        byKey.set(`${r.jogador}|${r.linha}|${r.market_type}`, { stance: r.stance, nota: r.nota ?? null });
      }
      const merged = candidatos.map((c) => ({
        ...c,
        ia_revisao: byKey.get(`${c["jogador"]}|${c["linha"]}|${c["market_type"]}`) ?? null,
      }));
      return { candidatos: merged, ia: { topo_explicacao: obj.topo_explicacao ?? null, alertas: obj.alertas ?? [] } };
    }
  }
  return {
    candidatos: candidatos.map((c) => ({ ...c, ia_revisao: null })),
    ia: { topo_explicacao: null, alertas: ["IA indisponível — exibindo só o veredito do código"] },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- reviewer`
Expected: PASS (todos os testes de `validateReview` e `reviewCandidates`).

- [ ] **Step 6: Commit**

```bash
git add src/ai/reviewSchema.ts src/ai/reviewer.ts test/reviewer.test.ts
git commit -m "feat: IA revisora (concorda/ressalva/veta + explica topo) com degradacao graciosa"
```

---

## Task 3: Ligar rank + revisor na rota manual (backend)

**Files:**
- Modify: `src/manual/analyze.ts`
- Modify: `src/service.ts:167-175`
- Modify: `test/manualFixtures.ts`
- Modify: `test/manualAnalyze.test.ts`

- [ ] **Step 1: Add `fakeReviewer` to fixtures**

Em `test/manualFixtures.ts`, adicione (mantendo o `fakeAnalyst` existente para o fluxo ao vivo):

```ts
// Revisor fake: não chama IA, anexa ia_revisao=null e devolve no shape do reviewer.
export function fakeReviewer(candidatos: any[], _contexto: any) {
  return {
    candidatos: candidatos.map((c) => ({ ...c, ia_revisao: null })),
    ia: { topo_explicacao: null, alertas: ["IA desligada (teste)"] },
  };
}
```

- [ ] **Step 2: Update the integration test to assert ranking + review wiring**

Em `test/manualAnalyze.test.ts`: trocar o import e as 3 chamadas de `analystFn: fakeAnalyst` por `reviewerFn: fakeReviewer`, e adicionar um teste novo. Resultado:

```ts
import { describe, it, expect } from "vitest";
import { analyzeManual } from "../src/manual/analyze.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { fakeClient, fakeReviewer } from "./manualFixtures.js";

describe("analyzeManual", () => {
  it("roda mercado de jogador com odd por-jogador e marca sem_devig", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [],
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });

    const all = [...out.candidatos, ...out.reprovados];
    const havertz = all.find((c: any) => String(c.jogador).includes("Havertz"));
    expect(havertz).toBeDefined();
    expect(havertz.sem_devig).toBe(true);
    expect(havertz.odd).toBe(3.0);
    expect(out.jogadores_sem_match).toHaveLength(0);
  });

  it("propaga linhas_rejeitadas e jogadores_sem_match na resposta", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "Lionel Messi", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [{ linha_crua: { x: 1 }, motivo: "teste" }],
    }, { repo, reviewerFn: fakeReviewer });
    expect(out.jogadores_sem_match.length).toBe(1);
    expect(out.jogadores_sem_match[0].market_type).toBe("sot");
    expect(out.linhas_rejeitadas.length).toBe(1);
  });

  it("auto-casa jogador via override salvo no crosswalk", async () => {
    const repo = new InMemoryRepo();
    repo.saveCrosswalk(1000, "cr7", { casa: "CR7" }, 1.0, true);
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "CR7", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [],
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });
    expect(out.jogadores_sem_match).toHaveLength(0);
    const all = [...out.candidatos, ...out.reprovados];
    expect(all.find((c: any) => String(c.jogador).includes("Havertz"))).toBeDefined();
  });

  it("candidatos aprovados saem ranqueados (risco/recomendado) e com ia_revisao", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [],
    }, { repo, reviewerFn: fakeReviewer });
    if (out.candidatos.length > 0) {
      expect(out.candidatos[0]).toHaveProperty("risco");
      expect(out.candidatos[0].recomendado).toBe(true);
      expect(out.candidatos[0]).toHaveProperty("ia_revisao");
    }
    expect(out.ia).toHaveProperty("topo_explicacao");
    expect(Array.isArray(out.ia.alertas)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the integration test to verify it fails**

Run: `npm test -- manualAnalyze`
Expected: FAIL — `fakeReviewer` não exportado / `reviewerFn` ignorado (ainda usa `analystFn`).

- [ ] **Step 4: Rewire `analyzeManual`**

Em `src/manual/analyze.ts`:

1. Trocar imports do analista pelo rank + reviewer:

```ts
// remover: import { fakeAnalyst as defaultFake } from "../ai/analyst.js";
import { rankCandidates } from "../candidates/rank.js";
import { reviewCandidates, type ReviewResult } from "../ai/reviewer.js";
```

2. Trocar a interface de opções:

```ts
export interface AnalyzeManualOpts {
  repo?: any;
  reviewerFn?: (cands: any[], ctx: any) => ReviewResult | Promise<ReviewResult>;
  diagnostics?: boolean;
}
```

3. No corpo, trocar o default e o trecho de filtro→IA→persistência→retorno:

```ts
  const repo = opts.repo ?? new InMemoryRepo();
  const reviewerFn = opts.reviewerFn ?? reviewCandidates;
```

```ts
  const { approved, rejected } = evaluateCandidates(allCandidates);
  const ranked = rankCandidates(approved);
  const { candidatos: revisados, ia } = await reviewerFn(ranked, { jogo: event.jogo ?? event.id });

  await repo.saveAnalysis(event.id, {
    jogo: event.jogo, market_type: "manual_todos", candidatos: revisados, llm_resultado: ia,
  });

  const hideTrace = (c: any) => {
    if (opts.diagnostics || !c || c.trace === undefined) return c;
    const { trace, ...rest } = c; return rest;
  };
  return {
    jogo: event.jogo,
    candidatos: revisados.map(hideTrace),
    reprovados: opts.diagnostics ? rejected : [],
    jogadores_sem_match,
    linhas_rejeitadas: input.linhas_rejeitadas,
    ia,
  };
```

- [ ] **Step 5: Update `analyzeManualService`**

Em `src/service.ts:167-175`, o revisor real é o default (degrada sozinho se faltar chave). Remover `useAi`/`analystFn` da rota manual:

```ts
export interface AnalyzeManualServiceOpts { repo?: any; diagnostics?: boolean; }

/** Valida o JSON colado e roda a análise geral de todos os mercados (com IA revisora). */
export async function analyzeManualService(client: any, body: unknown, opts: AnalyzeManualServiceOpts = {}): Promise<any> {
  const input = parseManualOdds(body); // lança em erro estrutural (→ 400 na API)
  return analyzeManual(client, input, {
    repo: opts.repo, diagnostics: opts.diagnostics ?? false,
  });
}
```

Se o import de `aiAnalyst`/`fakeAnalyst` em `service.ts` ficar sem uso após isso, remover do import para o typecheck strict não reclamar. (Conferir: ainda usados pela `analyze` ao vivo na linha ~134? Se sim, manter.)

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- manualAnalyze` then `npm run typecheck`
Expected: PASS nos testes; typecheck sem erros.

- [ ] **Step 7: Run full suite (paridade intacta)**

Run: `npm test`
Expected: PASS — todos verdes, incluindo o gate de paridade (money-path intocado).

- [ ] **Step 8: Commit**

```bash
git add src/manual/analyze.ts src/service.ts test/manualFixtures.ts test/manualAnalyze.test.ts
git commit -m "feat: rota manual ranqueia candidatos e roda IA revisora (default, degrada sem chave)"
```

---

## Task 4: Docs vivos (backend)

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/PITCH.md`

- [ ] **Step 1: Update ROADMAP**

No topo do `docs/ROADMAP.md`, adicionar seção datada `2026-06-09` registrando: rota manual agora entrega candidatos ranqueados por faixa de risco (seguro/moderado/tiro_longo, cortes 0.50/0.35), marca a ⭐ recomendada, e roda IA revisora (concorda/ressalva/veta + explica topo, degrada sem chave). Atualizar a contagem de testes (rodar `npm test` e ler o total) e a data no cabeçalho/bottom-line. Verificar o fundo do doc (TL;DR, "Estado por fase", follow-ups) e corrigir o que passou a contradizer (a IA não está mais "desligada na rota manual").

- [ ] **Step 2: Update PITCH (linguagem leiga)**

No `docs/PITCH.md`, em linguagem sem jargão: explicar que a tela de coleta manual agora diz "aposta NESTA" (a mais sólida primeiro, tiro-longo marcado como tal), com uma segunda opinião da IA que pode concordar, ressalvar ou barrar — e quando o cálculo aponta valor mas a IA segura, isso aparece claramente. Manter coerência de escopo com o ROADMAP (mesmos mercados).

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PITCH.md
git commit -m "docs: registra ranking de risco + IA revisora na rota manual (ROADMAP+PITCH)"
```

---

## Task 5: Tipos + helpers de formatação (frontend)

> A partir daqui, trabalhar em `C:\Users\gabri\Documents\projects\odd-analyzer-frontend`.

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/format.ts`, `lib/format.test.ts`

- [ ] **Step 1: Extend types**

Em `lib/types.ts`, no `interface Candidate` adicionar os campos novos (snake_case, espelhando o backend):

```ts
  // ───── enriquecimento da rota manual (rank + IA revisora) ─────
  risco?: "seguro" | "moderado" | "tiro_longo";
  recomendado?: boolean;
  ia_revisao?: { stance: "concorda" | "ressalva" | "veta"; nota: string | null } | null;
```

E adicionar o novo shape de IA da rota manual + apontar `ManualAnalysisResult.ia` para ele:

```ts
export interface ManualIa { topo_explicacao: string | null; alertas: string[]; }
```

Em `ManualAnalysisResult`, trocar `ia: Ai;` por `ia: ManualIa;`. (O `Ai` antigo continua usado por `AnalysisResult` do fluxo ao vivo.)

- [ ] **Step 2: Write the failing test for format helpers**

```ts
// lib/format.test.ts
import { describe, it, expect } from "vitest";
import { friendlyLine, evToReais, riscoLabel } from "./format";

describe("friendlyLine", () => {
  it("converte over X.5 em 'N+' com o mercado por extenso", () => {
    expect(friendlyLine("desarmes", 2.5)).toBe("3+ desarmes");
    expect(friendlyLine("desarmes", 0.5)).toBe("1+ desarmes");
    expect(friendlyLine("finalizacoes", 1.5)).toBe("2+ finalizações");
    expect(friendlyLine("sot", 0.5)).toBe("1+ chutes a gol");
  });
  it("mercado desconhecido cai no próprio key", () => {
    expect(friendlyLine("xpto", 1.5)).toBe("2+ xpto");
  });
});

describe("evToReais", () => {
  it("mostra lucro esperado por R$10, com vírgula decimal e sinal", () => {
    expect(evToReais(0.275)).toBe("+R$2,75 / R$10");
    expect(evToReais(1.089)).toBe("+R$10,89 / R$10");
  });
});

describe("riscoLabel", () => {
  it("rotula cada faixa com emoji e texto", () => {
    expect(riscoLabel("seguro").texto).toMatch(/seguro/i);
    expect(riscoLabel("seguro").emoji).toBe("🟢");
    expect(riscoLabel("moderado").emoji).toBe("🟡");
    expect(riscoLabel("tiro_longo").emoji).toBe("🔴");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (no repo do frontend): `npx vitest run lib/format`
Expected: FAIL — `./format` não existe.

- [ ] **Step 4: Implement the helpers**

```ts
// lib/format.ts
import type { Candidate } from "@/lib/types";

const MERCADO_PT: Record<string, string> = {
  sot: "chutes a gol",
  finalizacoes: "finalizações",
  desarmes: "desarmes",
  escanteios: "escanteios",
  gols: "gols",
  vitoria: "resultado",
};

/** "over 2.5 desarmes" → "3+ desarmes" (rótulo de limiar da bet365, mais legível). */
export function friendlyLine(marketType: string, linha: number): string {
  const limiar = Math.ceil(linha); // 2.5 → 3, 0.5 → 1
  const nome = MERCADO_PT[marketType] ?? marketType;
  return `${limiar}+ ${nome}`;
}

/** EV (lucro por R$1 no longo prazo) → "+R$2,75 / R$10". */
export function evToReais(ev: number): string {
  const por10 = ev * 10;
  const sinal = por10 >= 0 ? "+" : "−";
  const valor = Math.abs(por10).toFixed(2).replace(".", ",");
  return `${sinal}R$${valor} / R$10`;
}

export type Risco = NonNullable<Candidate["risco"]>;

const RISCO_INFO: Record<Risco, { emoji: string; texto: string; tone: "value" | "warn" | "bad" }> = {
  seguro: { emoji: "🟢", texto: "seguro", tone: "value" },
  moderado: { emoji: "🟡", texto: "moderado", tone: "warn" },
  tiro_longo: { emoji: "🔴", texto: "tiro-longo", tone: "bad" },
};

export function riscoLabel(risco: Risco) {
  return RISCO_INFO[risco];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/format`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/format.ts lib/format.test.ts
git commit -m "feat: tipos de ranking/revisao + helpers userfriendly (linha N+, EV em reais, faixa de risco)"
```

---

## Task 6: Card-herói da recomendação (frontend)

**Files:**
- Create: `components/RecommendationCard.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// components/RecommendationCard.tsx
import type { Candidate, ManualIa } from "@/lib/types";
import { Tag } from "@/components/ui";
import { friendlyLine, evToReais, riscoLabel } from "@/lib/format";

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

const STANCE_INFO = {
  concorda: { emoji: "✅", texto: "IA concorda", tone: "value" as const },
  ressalva: { emoji: "⚠️", texto: "IA com ressalva", tone: "warn" as const },
  veta: { emoji: "⛔", texto: "IA não recomenda", tone: "bad" as const },
};

/** Mostra a candidata recomendada (recomendado=true). Se a IA vetou, vira alerta de
 * conflito e aponta a próxima candidata sem veto. */
export function RecommendationCard({ candidates, ia }: { candidates: Candidate[]; ia: ManualIa }) {
  const best = candidates.find((c) => c.recomendado);
  if (!best) {
    return (
      <div className="rounded-sm border border-dashed border-line px-4 py-5">
        <p className="text-[0.8rem] text-muted">nenhuma aposta clara — não forçar.</p>
      </div>
    );
  }

  const risco = best.risco ? riscoLabel(best.risco) : null;
  const stance = best.ia_revisao ? STANCE_INFO[best.ia_revisao.stance] : null;
  const vetado = best.ia_revisao?.stance === "veta";
  const proxima = vetado
    ? candidates.find((c) => !c.recomendado && c.ia_revisao?.stance !== "veta")
    : null;

  return (
    <div
      className={`scan relative overflow-hidden rounded-sm border p-4 ${
        vetado
          ? "border-bad/50 bg-[rgba(255,93,99,0.06)]"
          : "border-value/45 bg-[rgba(37,224,138,0.05)] shadow-[var(--glow-value)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={vetado ? "bad" : "value"}>⭐ recomendada pelo modelo</Tag>
        {risco && <Tag tone={risco.tone}>{risco.emoji} {risco.texto}</Tag>}
        {stance && <Tag tone={stance.tone}>{stance.emoji} {stance.texto}</Tag>}
      </div>

      <p className="display mt-3 text-xl font-extrabold leading-tight text-fg">
        {best.jogador}{" "}
        <span className={vetado ? "text-bad" : "text-value"}>
          {friendlyLine(best.market_type, best.linha)}
        </span>{" "}
        <span className="mono text-base text-muted">@ {best.odd}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.78rem] text-muted">
        <span>modelo <strong className="text-fg">{pct(best.prob_modelo)}</strong> vs casa {pct(best.prob_devig)}</span>
        <span>retorno esperado <strong className="text-value">{evToReais(best.ev)}</strong></span>
      </div>

      {vetado ? (
        <p className="mt-3 rounded-sm border border-bad/40 bg-[rgba(255,93,99,0.07)] px-3 py-2 text-[0.78rem] leading-relaxed text-fg">
          ⛔ o modelo viu valor aqui, mas a IA segurou
          {best.ia_revisao?.nota ? <>: <span className="text-muted">{best.ia_revisao.nota}</span></> : "."}
          {proxima && (
            <span className="mt-1 block text-faint">
              próxima opção sem ressalva: <strong className="text-fg">{proxima.jogador}</strong>{" "}
              {friendlyLine(proxima.market_type, proxima.linha)} @ {proxima.odd}
            </span>
          )}
        </p>
      ) : (
        ia.topo_explicacao && (
          <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">{ia.topo_explicacao}</p>
        )
      )}

      {ia.alertas?.length > 0 && (
        <div className="mt-3 border-t border-line-soft pt-2">
          {ia.alertas.map((a, i) => (
            <p key={i} className="text-[0.66rem] text-faint">⚠ {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados ao novo arquivo.

- [ ] **Step 3: Commit**

```bash
git add components/RecommendationCard.tsx
git commit -m "feat: card-heroi da aposta recomendada (selo da IA + conflito codigo-vs-IA)"
```

---

## Task 7: Lista agrupada por jogador (frontend)

**Files:**
- Create: `components/CandidatesByPlayer.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// components/CandidatesByPlayer.tsx
import type { Candidate } from "@/lib/types";
import { Tag } from "@/components/ui";
import { InvestigationTrace } from "@/components/InvestigationTrace";
import { friendlyLine, evToReais, riscoLabel } from "@/lib/format";

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const STANCE_ICON = { concorda: "✅", ressalva: "⚠️", veta: "⛔" } as const;

/** Agrupa candidatos por jogador preservando a ordem global (risco→EV). Assim a
 * mesma pessoa em várias linhas vira UM bloco ("escolha uma linha"), não N apostas. */
function groupByPlayer(candidates: Candidate[]): { jogador: string; linhas: Candidate[] }[] {
  const ordem: string[] = [];
  const mapa = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (!mapa.has(c.jogador)) { mapa.set(c.jogador, []); ordem.push(c.jogador); }
    mapa.get(c.jogador)!.push(c);
  }
  return ordem.map((jogador) => ({ jogador, linhas: mapa.get(jogador)! }));
}

export function CandidatesByPlayer({ candidates }: { candidates: Candidate[] }) {
  if (!candidates.length) {
    return (
      <div className="rounded-sm border border-dashed border-line px-4 py-8 text-center">
        <p className="display text-base font-bold text-muted">nenhuma oportunidade clara</p>
        <p className="mt-1.5 text-[0.72rem] leading-relaxed text-faint">
          ninguém passou nos cortes (edge ≥ 0.04 · ev ≥ 0.05 · titular confirmado · amostra ≥ 10).
          <br />lista vazia é um resultado válido — não forçar aposta.
        </p>
      </div>
    );
  }

  const grupos = groupByPlayer(candidates);

  return (
    <div className="flex flex-col gap-3">
      {grupos.map((g) => (
        <div key={g.jogador} className="rounded-sm border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
            <span className="display text-[0.95rem] font-bold text-fg">{g.jogador}</span>
            {g.linhas.length > 1 && (
              <span className="text-[0.62rem] text-faint">{g.linhas.length} linhas — escolha uma</span>
            )}
          </div>
          <div className="flex flex-col divide-y divide-line-soft">
            {g.linhas.map((c, i) => {
              const risco = c.risco ? riscoLabel(c.risco) : null;
              return (
                <div key={i} className={`px-3 py-2.5 ${c.recomendado ? "bg-[rgba(37,224,138,0.05)]" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {c.recomendado && <span title="recomendada">⭐</span>}
                    <span className="display text-[0.85rem] font-semibold text-fg">
                      {friendlyLine(c.market_type, c.linha)}
                    </span>
                    <span className="mono text-xs text-muted">@ {c.odd}</span>
                    {risco && <Tag tone={risco.tone}>{risco.emoji} {risco.texto}</Tag>}
                    {c.ia_revisao && (
                      <span className="text-sm" title={c.ia_revisao.nota ?? "IA concorda"}>
                        {STANCE_ICON[c.ia_revisao.stance]}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.72rem] text-muted">
                    <span>modelo <strong className="text-fg">{pct(c.prob_modelo)}</strong> vs casa {pct(c.prob_devig)}</span>
                    <span>retorno <strong className="text-value">{evToReais(c.ev)}</strong></span>
                  </div>
                  {c.trace && (
                    <details className="group/inv mt-1.5">
                      <summary className="display inline-flex cursor-pointer items-center gap-1 text-[0.66rem] font-semibold text-faint hover:text-fg">
                        <span className="transition-transform group-open/inv:rotate-90">▸</span> mostrar investigação
                      </summary>
                      <div className="mt-2"><InvestigationTrace trace={c.trace} /></div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados ao novo arquivo.

- [ ] **Step 3: Commit**

```bash
git add components/CandidatesByPlayer.tsx
git commit -m "feat: lista de candidatos agrupada por jogador (tag de risco, EV em reais, stance da IA)"
```

---

## Task 8: Ligar na página de coleta + verificar (frontend)

**Files:**
- Modify: `app/coletar/page.tsx`

- [ ] **Step 1: Swap imports**

Em `app/coletar/page.tsx`, trocar os imports de `CandidatesTable` e `AiVerdict`:

```ts
import { CandidatesByPlayer } from "@/components/CandidatesByPlayer";
import { RecommendationCard } from "@/components/RecommendationCard";
```

(remover os imports antigos de `CandidatesTable` e `AiVerdict` — eles continuam existindo para o fluxo ao vivo, só não são usados aqui.)

- [ ] **Step 2: Swap the render block**

No bloco `{result && (...)}` (por volta da linha 211-225), trocar o painel de veredito e a tabela:

```tsx
          <div className="reveal">
            <Panel title="aposta recomendada" glow badge={<Tag tone="muted">código decide · IA revisa</Tag>}>
              <RecommendationCard candidates={result.candidatos} ia={result.ia} />
            </Panel>
          </div>

          <div className="reveal" style={{ animationDelay: "60ms" }}>
            <Panel title={`candidatos · ${result.candidatos.length}`} badge={<Tag tone="value">edge &gt; 0</Tag>}>
              <CandidatesByPlayer candidates={result.candidatos} />
            </Panel>
          </div>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: typecheck limpo; build do Next conclui sem erro.

- [ ] **Step 4: Smoke test visual (manual)**

Run: `npm run dev` (frontend) com o backend rodando (`npm run dev` na raiz do backend, porta 3001). Abrir `/coletar`, escolher England × Costa Rica, colar as odds de desarmes, analisar. Conferir:
- Card no topo mostra ⭐ Declan Rice "3+ desarmes" (over 2.5) como recomendada, tag 🟢 seguro, selo da IA, retorno em R$.
- Lista agrupa as 4 linhas de Rice num bloco só ("4 linhas — escolha uma"); tiro-longo marcado 🔴.
- Se a IA estiver indisponível (sem chave): card aparece sem veto, com alerta "IA indisponível".

- [ ] **Step 5: Commit**

```bash
git add app/coletar/page.tsx
git commit -m "feat: tela de coleta usa card-heroi + lista agrupada (userfriendly)"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- Parte 1 (motor de risco/ranking) → Task 1. ✅
- Parte 2 (IA revisora, merge, degradação, shape) → Tasks 2-3. ✅
- Parte 3.1 (card-herói + conflito) → Task 6. ✅
- Parte 3.2 (lista agrupada) → Task 7. ✅
- Parte 3.3 (linguagem amigável/helpers) → Task 5. ✅
- Parte 3.4 (tipos) → Task 5. ✅
- Testes (rank, reviewer, analyzeManual, format) → Tasks 1,2,3,5. ✅
- Docs vivos → Task 4. ✅
- Paridade intacta → Task 3 Step 7 roda a suíte completa. ✅

**Placeholder scan:** sem TBD/TODO; todo passo de código mostra o código. ✅

**Type consistency:** `risco`/`recomendado`/`ia_revisao` idênticos backend↔frontend; `ReviewResult` definido na Task 2 e usado na Task 3; `friendlyLine`/`evToReais`/`riscoLabel` definidos na Task 5 e usados nas Tasks 6-7; `ManualIa` definido na Task 5 e usado na Task 6. ✅
