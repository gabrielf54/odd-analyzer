# Coleta manual de odds via IA externa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir colar um JSON de odds (coletado por IA externa no site da casa) e rodar análise de TODOS os mercados de um jogo de uma vez, sem API de odds paga.

**Architecture:** Backend stateless com novo módulo `src/manual/` (schema Zod, matching de odds→jogador, orquestração multi-mercado, gerador de prompt). O motor (`model/`, `value/`, `pipeline.ts`) **não muda** exceto uma extensão aditiva e segura em `buildCandidate` para de-vig de um lado só. Três endpoints novos: `GET /prompt`, `POST /analise/manual`, `POST /crosswalk`.

**Tech Stack:** Node/TS strict (ESM, NodeNext), Express, Zod, Vitest. Fakes existentes (`InMemoryRepo`, `BSDStatsProvider` com client fake).

**Spec:** `docs/superpowers/specs/2026-06-09-odds-manual-coleta-ia-externa-design.md`

---

## Arquivos (mapa de responsabilidades)

- **Modificar** `src/candidates/builder.ts` — de-vig single-side (`odd_under` ausente → implícita crua + `sem_devig: true`).
- **Criar** `src/manual/schema.ts` — Zod do JSON colado; separa `odds` válidas de `linhas_rejeitadas`.
- **Criar** `src/manual/matchOdds.ts` — casa linhas de jogador (nome da casa) → jogadores do squad; devolve matches + `jogadores_sem_match` (com candidatos ranqueados).
- **Criar** `src/manual/analyze.ts` — `analyzeManual()`: agrupa por mercado, calcula candidatos (per-entity nos de jogador, per-partida nos de partida), agrega, filtra uma vez, IA uma vez, persiste uma vez.
- **Criar** `src/manual/prompt.ts` — `buildOddsPrompt(event, market, lineup)` → string pronta pra colar.
- **Modificar** `src/pipeline.ts` — exportar `matchCount` e `runMatch` (só adicionar `export`, sem mudar lógica) p/ reuso nos mercados de partida.
- **Modificar** `src/store/repo.ts` — `listCrosswalk()` na interface + `InMemoryRepo` + `SupabaseRepo` (lookup de overrides por nome).
- **Modificar** `src/service.ts` — `generateOddsPrompt()`, `analyzeManual()` (service), `confirmCrosswalk()`.
- **Modificar** `src/api/app.ts` — rotas `GET /prompt`, `POST /analise/manual`, `POST /crosswalk`.
- **Testes** correspondentes em `test/`.
- **Atualizar** `docs/ROADMAP.md` e `docs/PITCH.md`.

---

## Task 1: De-vig single-side em buildCandidate

**Files:**
- Modify: `src/candidates/builder.ts`
- Test: `test/builder.test.ts` (já existe — adicionar casos)

- [ ] **Step 1: Write the failing test**

Adicionar em `test/builder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildCandidate } from "../src/candidates/builder.js";
import { impliedProb } from "../src/value/devig.js";

describe("buildCandidate single-side (só over)", () => {
  it("sem odd_under: prob_devig = implícita crua do over e marca sem_devig", () => {
    const c = buildCandidate({
      jogador: "K. Havertz", linha: 0.5, odd_over: 2.0, odd_under: null as any,
      prob_modelo: 0.6, mu: 1.0, minutos_esperados: 90, xi_confirmado: true,
      amostra_jogos: 12, concedido_adversario: "n/d", incerteza: "baixa", market_type: "sot",
    });
    expect(c.sem_devig).toBe(true);
    expect(c.prob_devig).toBeCloseTo(impliedProb(2.0), 9); // 0.5 cru, sem normalizar margem
    expect(c.odd).toBe(2.0);
    expect(c.edge).toBeCloseTo(0.6 - 0.5, 9);
    expect(c.ev).toBeCloseTo(0.6 * 2.0 - 1.0, 9);
  });

  it("com os dois lados: comportamento inalterado, sem_devig=false", () => {
    const c = buildCandidate({
      jogador: "partida", linha: 9.5, odd_over: 1.9, odd_under: 1.9,
      prob_modelo: 0.55, mu: 10, minutos_esperados: 90, xi_confirmado: true,
      amostra_jogos: 10, concedido_adversario: "n/d", incerteza: "media", market_type: "escanteios",
    });
    expect(c.sem_devig).toBe(false);
    expect(c.prob_devig).toBeCloseTo(0.5, 9); // de-vig de 1.9/1.9 simétrico
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- builder`
Expected: FAIL — `sem_devig` é `undefined`.

- [ ] **Step 3: Write minimal implementation**

Em `src/candidates/builder.ts`, trocar a montagem de `prob_devig` e adicionar `sem_devig`. O tipo `odd_under` passa a aceitar null:

```typescript
import { fairProbOver, impliedProb } from "../value/devig.js";
import { edgeEv } from "../value/ev.js";
import { finalizeTrace, type RateTrace } from "../model/trace.js";

export interface BuildCandidateArgs {
  jogador: unknown;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  prob_modelo: number;
  mu: number;
  minutos_esperados: number;
  xi_confirmado: boolean;
  amostra_jogos: number;
  concedido_adversario: unknown;
  incerteza: unknown;
  market_type: string;
  player_id?: unknown;
  trace?: RateTrace;
}

export function buildCandidate(a: BuildCandidateArgs): Record<string, unknown> {
  const semDevig = a.odd_under == null;
  const prob_devig = semDevig ? impliedProb(a.odd_over) : fairProbOver(a.odd_over, a.odd_under as number);
  const m = edgeEv(a.prob_modelo, prob_devig, a.odd_over);
  const out: Record<string, unknown> = {
    jogador: a.jogador,
    player_id: a.player_id ?? null,
    linha: a.linha,
    odd: a.odd_over,
    prob_modelo: a.prob_modelo,
    prob_devig,
    sem_devig: semDevig,
    edge: m.edge,
    ev: m.ev,
    lambda: a.mu,
    minutos_esperados: a.minutos_esperados,
    xi_confirmado: a.xi_confirmado,
    amostra_jogos: a.amostra_jogos,
    concedido_adversario: a.concedido_adversario,
    incerteza: a.incerteza,
    market_type: a.market_type,
  };
  if (a.trace) {
    out.trace = finalizeTrace(a.trace, {
      alvo: String(a.jogador), linha: a.linha, probModelo: a.prob_modelo,
      probDevig: prob_devig, edge: m.edge, ev: m.ev,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test + parity to verify nothing broke**

Run: `npm test -- builder parity` e `npm run typecheck`
Expected: PASS. Paridade intacta (goldens sempre passam os dois lados → branch `semDevig` nunca dispara neles).

- [ ] **Step 5: Commit**

```bash
git add src/candidates/builder.ts test/builder.test.ts
git commit -m "feat: de-vig single-side no buildCandidate (so over -> implicita crua + sem_devig)"
```

---

## Task 2: Schema Zod do JSON colado

**Files:**
- Create: `src/manual/schema.ts`
- Test: `test/manual/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { parseManualOdds } from "../../src/manual/schema.js";

describe("parseManualOdds", () => {
  const base = { event_id: "e1", coletado_em: "2026-06-14T18:30:00Z" };

  it("aceita linha de jogador só com over", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 2.1, book: "bet365" },
    ]});
    expect(r.odds).toHaveLength(1);
    expect(r.odds[0].odd_under).toBeNull();
    expect(r.linhas_rejeitadas).toHaveLength(0);
  });

  it("rejeita odd <= 1.01 sem derrubar o resto", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "sot", entidade: "X", linha: 0.5, odd_over: 1.0, book: "b" },
      { market_type: "sot", entidade: "Y", linha: 0.5, odd_over: 2.0, book: "b" },
    ]});
    expect(r.odds).toHaveLength(1);
    expect(r.linhas_rejeitadas).toHaveLength(1);
    expect(r.linhas_rejeitadas[0].motivo).toMatch(/odd_over/);
  });

  it("rejeita mercado de partida sem os dois lados (de-vig impossível)", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "escanteios", entidade: "partida", linha: 9.5, odd_over: 1.9, book: "b" },
    ]});
    expect(r.odds).toHaveLength(0);
    expect(r.linhas_rejeitadas[0].motivo).toMatch(/dois lados/);
  });

  it("rejeita market_type desconhecido", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "cartoes", entidade: "X", linha: 0.5, odd_over: 2.0, book: "b" },
    ]});
    expect(r.odds).toHaveLength(0);
    expect(r.linhas_rejeitadas[0].motivo).toMatch(/market_type/);
  });

  it("body sem coletado_em lança", () => {
    expect(() => parseManualOdds({ event_id: "e1", odds: [] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- manual/schema`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { z } from "zod";

const MARKET_TYPES = ["gols", "vitoria", "escanteios", "sot", "finalizacoes", "desarmes"] as const;
const PLAYER_MARKETS = new Set(["sot", "finalizacoes", "desarmes"]);

/** Linha crua do JSON (pré-validação semântica). */
const rawLineSchema = z.object({
  market_type: z.string(),
  entidade: z.string(),
  linha: z.number().optional(),
  odd_over: z.number(),
  odd_under: z.number().nullish(),
  book: z.string().default("manual"),
});

const bodySchema = z.object({
  event_id: z.string(),
  coletado_em: z.string(),
  odds: z.array(z.unknown()),
});

export interface ManualOddsLine {
  market_type: string;
  entidade: string;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  book: string;
}

export interface LinhaRejeitada { linha_crua: unknown; motivo: string; }

export interface ManualOddsInput {
  event_id: string;
  coletado_em: string;
  odds: ManualOddsLine[];
  linhas_rejeitadas: LinhaRejeitada[];
}

/** Valida o JSON colado. Lança em erro estrutural (body). Erros por-linha NÃO
 * lançam — vão para linhas_rejeitadas, para o operador inspecionar. */
export function parseManualOdds(body: unknown): ManualOddsInput {
  const b = bodySchema.parse(body); // lança se faltar event_id/coletado_em/odds
  const odds: ManualOddsLine[] = [];
  const linhas_rejeitadas: LinhaRejeitada[] = [];

  for (const raw of b.odds) {
    const p = rawLineSchema.safeParse(raw);
    if (!p.success) { linhas_rejeitadas.push({ linha_crua: raw, motivo: "formato inválido da linha" }); continue; }
    const l = p.data;
    if (!(MARKET_TYPES as readonly string[]).includes(l.market_type)) {
      linhas_rejeitadas.push({ linha_crua: raw, motivo: `market_type desconhecido: ${l.market_type}` }); continue;
    }
    if (l.odd_over <= 1.01) {
      linhas_rejeitadas.push({ linha_crua: raw, motivo: "odd_over deve ser > 1.01" }); continue;
    }
    if (l.odd_under != null && l.odd_under <= 1.01) {
      linhas_rejeitadas.push({ linha_crua: raw, motivo: "odd_under deve ser > 1.01" }); continue;
    }
    const isPlayer = PLAYER_MARKETS.has(l.market_type);
    if (isPlayer) {
      if (l.entidade === "partida" || l.linha == null) {
        linhas_rejeitadas.push({ linha_crua: raw, motivo: "mercado de jogador exige entidade (nome) e linha" }); continue;
      }
    } else if (l.market_type !== "vitoria") {
      // gols/escanteios: totais precisam dos dois lados p/ de-vig
      if (l.odd_under == null || l.linha == null) {
        linhas_rejeitadas.push({ linha_crua: raw, motivo: "mercado de partida (totais) exige os dois lados e linha" }); continue;
      }
    }
    odds.push({
      market_type: l.market_type, entidade: l.entidade, linha: l.linha ?? 0,
      odd_over: l.odd_over, odd_under: l.odd_under ?? null, book: l.book,
    });
  }
  return { event_id: b.event_id, coletado_em: b.coletado_em, odds, linhas_rejeitadas };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- manual/schema` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manual/schema.ts test/manual/schema.test.ts
git commit -m "feat: schema Zod do JSON de odds manual (separa validas de linhas_rejeitadas)"
```

---

## Task 3: Matching de odds de jogador → squad

**Files:**
- Create: `src/manual/matchOdds.ts`
- Test: `test/manual/matchOdds.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { matchPlayerOdds } from "../../src/manual/matchOdds.js";
import type { ManualOddsLine } from "../../src/manual/schema.js";

const squad = [
  { id: "10", name: "Kai Havertz" },
  { id: "20", name: "Joshua Kimmich" },
];
const line = (entidade: string): ManualOddsLine =>
  ({ market_type: "sot", entidade, linha: 0.5, odd_over: 2.0, odd_under: null, book: "b" });

describe("matchPlayerOdds", () => {
  it("nome óbvio casa e leva o player_id do squad", () => {
    const r = matchPlayerOdds([line("K. Havertz")], squad, {});
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0].player_id).toBe("10");
    expect(r.sem_match).toHaveLength(0);
  });

  it("nome desconhecido vira sem_match com candidatos ranqueados", () => {
    const r = matchPlayerOdds([line("Cristiano Ronaldo")], squad, {});
    expect(r.casados).toHaveLength(0);
    expect(r.sem_match).toHaveLength(1);
    expect(r.sem_match[0].nome_casa).toBe("Cristiano Ronaldo");
    expect(r.sem_match[0].candidatos.length).toBeGreaterThan(0);
  });

  it("override (crosswalk salvo) casa direto por nome normalizado", () => {
    const r = matchPlayerOdds([line("CR7")], squad, { "cr7": "20" });
    expect(r.casados[0].player_id).toBe("20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- manual/matchOdds`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { matchPlayer, sim, normalize } from "../crosswalk/match.js";
import type { ManualOddsLine } from "./schema.js";

const THRESHOLD = 0.9;

export interface OddsMatched extends ManualOddsLine { player_id: string; player_name: string; }
export interface SemMatch { nome_casa: string; candidatos: { id: string; name: string; confianca: number }[]; }
export interface MatchOddsResult { casados: OddsMatched[]; sem_match: SemMatch[]; }

/** Casa cada linha de jogador (nome da casa) a um jogador do squad.
 * overrides: { nome_normalizado_casa -> player_id } vindos do crosswalk salvo.
 * Acima do threshold → casado; senão → sem_match com top-3 candidatos. */
export function matchPlayerOdds(
  lines: ManualOddsLine[],
  squad: { id: string; name: string }[],
  overrides: Record<string, string>,
): MatchOddsResult {
  const casados: OddsMatched[] = [];
  const sem_match: SemMatch[] = [];
  for (const l of lines) {
    const m = matchPlayer(l.entidade, squad, overrides, THRESHOLD);
    if (m) {
      casados.push({ ...l, player_id: m.id, player_name: m.name });
    } else {
      const n = normalize(l.entidade);
      const candidatos = squad
        .map((p) => ({ id: p.id, name: p.name, confianca: Math.round(sim(n, normalize(p.name)) * 1000) / 1000 }))
        .sort((a, b) => b.confianca - a.confianca)
        .slice(0, 3);
      sem_match.push({ nome_casa: l.entidade, candidatos });
    }
  }
  return { casados, sem_match };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- manual/matchOdds` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manual/matchOdds.ts test/manual/matchOdds.test.ts
git commit -m "feat: matching de odds de jogador -> squad (fail-closed + sem_match ranqueado)"
```

---

## Task 4: Exportar helpers de partida do pipeline

**Files:**
- Modify: `src/pipeline.ts` (só adicionar `export` em `matchCount` e `runMatch`)
- Test: `test/pipeline.test.ts` (adicionar smoke import)

- [ ] **Step 1: Write the failing test**

Adicionar em `test/pipeline.test.ts`:

```typescript
import { matchCount, runMatch } from "../src/pipeline.js";

describe("pipeline exports p/ reuso manual", () => {
  it("matchCount e runMatch estão exportados", () => {
    expect(typeof matchCount).toBe("function");
    expect(typeof runMatch).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipeline`
Expected: FAIL — `matchCount`/`runMatch` não exportados (import undefined).

- [ ] **Step 3: Write minimal implementation**

Em `src/pipeline.ts`, adicionar a palavra `export` nas duas funções (NÃO mudar o corpo):

```typescript
export async function matchCount(event: any, market: MarketSpec, sp: any, lines: any[]): Promise<any[]> {
```
```typescript
export async function runMatch(event: any, market: MarketSpec, sp: any, op: any): Promise<any[]> {
```

- [ ] **Step 4: Run test + parity to verify it passes**

Run: `npm test -- pipeline parity` e `npm run typecheck`
Expected: PASS. Paridade intacta (só visibilidade mudou).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.ts test/pipeline.test.ts
git commit -m "refactor: exporta matchCount/runMatch para reuso na orquestracao manual"
```

---

## Task 5: listCrosswalk no repo (overrides por nome)

**Files:**
- Modify: `src/store/repo.ts`
- Modify: `src/store/schema.sql` (confirmar/garantir colunas — sem DDL novo se já existirem)
- Test: `test/repo.test.ts` (criar se não existir; senão adicionar)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";

describe("InMemoryRepo crosswalk overrides", () => {
  it("listCrosswalk devolve overrides {nome_normalizado -> id_canonico}", async () => {
    const repo = new InMemoryRepo();
    repo.saveCrosswalk(20, "cr7", { bet365: "CR7" }, 1.0, true);
    const ov = await repo.listCrosswalk();
    expect(ov["cr7"]).toBe("20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- repo`
Expected: FAIL — `listCrosswalk` não existe.

- [ ] **Step 3: Write minimal implementation**

Em `src/store/repo.ts`, adicionar à interface `Repo`:

```typescript
  listCrosswalk(): Promise<Record<string, string>> | Record<string, string>;
```

No `InMemoryRepo`:

```typescript
  listCrosswalk(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of this.crosswalk.values()) out[row.nome_normalizado] = String(row.id_canonico);
    return out;
  }
```

No `SupabaseRepo`:

```typescript
  async listCrosswalk(): Promise<Record<string, string>> {
    const { data } = await this.client.from("jogadores_crosswalk").select("nome_normalizado,id_canonico");
    const out: Record<string, string> = {};
    for (const row of data ?? []) out[row.nome_normalizado] = String(row.id_canonico);
    return out;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- repo` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/repo.ts test/repo.test.ts
git commit -m "feat: Repo.listCrosswalk (overrides por nome p/ auto-match do manual)"
```

---

## Task 6: Orquestração analyzeManual (multi-mercado)

**Files:**
- Create: `src/manual/analyze.ts`
- Test: `test/manual/analyze.test.ts`

Reaproveita: `normalizeEvent` (runner), `MARKETS`/`baselineFor`, `matchCount`/`runMatch` (pipeline), `probOverLine`, `buildCandidate`, `evaluateCandidates`, `matchPlayerOdds`, `parseManualOdds`. Computa candidatos de TODOS os mercados, filtra uma vez, roda IA uma vez, persiste uma vez.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { analyzeManual } from "../../src/manual/analyze.js";
import { InMemoryRepo } from "../../src/store/repo.js";

// Client fake mínimo: 1 jogo, squad de 2 jogadores, stats que dão mu alto.
function fakeClient() {
  return {
    async getEvent() {
      return { id: "e1", home_team: "Germany", away_team: "Scotland",
        home_team_id: "100", away_team_id: "200", league_id: 27 };
    },
    async lineups() {
      return { lineup_status: "confirmed", lineups: {
        home: { team_id: "100", players: [{ id: "10", name: "Kai Havertz", position: "FW" }] },
        away: { team_id: "200", players: [{ id: "20", name: "Joshua Kimmich", position: "MF" }] },
      }};
    },
    async playerStats() {
      const g = Array.from({ length: 12 }, () => ({ shots_on_target: 3, minutes_played: 90 }));
      return { results: g };
    },
    async events() { return { results: [] }; },
    async eventStats() { return { stats: {} }; },
    async eventPlayerStats() { return { player_stats: [] }; },
    async player() { return { name: "x" }; },
  };
}

const fakeAnalyst = (cands: any[]) => ({ melhor_aposta: null, candidatos_vistos: cands.length });

describe("analyzeManual", () => {
  it("roda mercado de jogador com odd por-jogador e marca sem_devig", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [],
    }, { repo, analystFn: fakeAnalyst });

    const all = [...out.candidatos, ...out.reprovados];
    const havertz = all.find((c: any) => String(c.jogador).includes("Havertz"));
    expect(havertz).toBeDefined();
    expect(havertz.sem_devig).toBe(true);
    expect(havertz.odd).toBe(3.0);
    // jogador não casado não aparece
    expect(out.jogadores_sem_match).toHaveLength(0);
  });

  it("propaga linhas_rejeitadas e jogadores_sem_match na resposta", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "Lionel Messi", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [{ linha_crua: { x: 1 }, motivo: "teste" }],
    }, { repo, analystFn: fakeAnalyst });
    expect(out.jogadores_sem_match.length).toBe(1);
    expect(out.linhas_rejeitadas.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- manual/analyze`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { MARKETS, baselineFor, type MarketSpec } from "../model/markets.js";
import { probOverLine } from "../model/sotModel.js";
import { matchCount, runMatch } from "../pipeline.js";
import { buildCandidate } from "../candidates/builder.js";
import { evaluateCandidates } from "../candidates/filter.js";
import { BSDStatsProvider } from "../providers/stats.js";
import { ManualOdds } from "../providers/odds.js";
import { InMemoryRepo } from "../store/repo.js";
import { fakeAnalyst as defaultFake } from "../ai/analyst.js";
import { normalizeEvent } from "../runner.js";
import { matchPlayerOdds } from "./matchOdds.js";
import type { ManualOddsInput, ManualOddsLine } from "./schema.js";

export interface AnalyzeManualOpts {
  repo?: any;
  analystFn?: (cands: any[], ctx: any) => any | Promise<any>;
  useAi?: boolean;
  diagnostics?: boolean;
}

const PLAYER_MARKETS = new Set(["sot", "finalizacoes", "desarmes"]);

function groupByMarket(odds: ManualOddsLine[]): Map<string, ManualOddsLine[]> {
  const m = new Map<string, ManualOddsLine[]>();
  for (const l of odds) { (m.get(l.market_type) ?? m.set(l.market_type, []).get(l.market_type)!).push(l); }
  return m;
}

export async function analyzeManual(
  client: any, input: ManualOddsInput, opts: AnalyzeManualOpts = {},
): Promise<any> {
  const repo = opts.repo ?? new InMemoryRepo();
  const analystFn = opts.analystFn ?? defaultFake;

  const event = normalizeEvent(await client.getEvent(input.event_id));
  const leagueId = event.league_id ?? null;
  const stats = new BSDStatsProvider(client);
  const overrides = await repo.listCrosswalk();

  const byMarket = groupByMarket(input.odds);
  const allCandidates: any[] = [];
  const jogadores_sem_match: any[] = [];

  for (const [marketKey, lines] of byMarket) {
    const market: MarketSpec = MARKETS[marketKey]!;
    if (PLAYER_MARKETS.has(marketKey)) {
      const cands = await playerCandidates(event, market, stats, lines, leagueId, overrides, jogadores_sem_match);
      allCandidates.push(...cands);
    } else {
      // partida: ManualOdds + helpers exportados do pipeline (totais vs 1x2)
      const provider = new ManualOdds(lines.map((l) => ({
        entidade: l.entidade, linha: l.linha, odd_over: l.odd_over,
        odd_under: l.odd_under ?? 0, book: l.book,
      })));
      const lns = await provider.lines();
      const cands = market.kind === "contagem"
        ? await matchCount(event, market, stats, lns)
        : await runMatch(event, market, stats, provider);
      allCandidates.push(...cands);
    }
  }

  const { approved, rejected } = evaluateCandidates(allCandidates);
  const ia = await analystFn(approved, { jogo: event.jogo ?? event.id });

  await repo.saveAnalysis(event.id, {
    jogo: event.jogo, market_type: "manual_todos", candidatos: approved, llm_resultado: ia,
  });

  const hideTrace = (c: any) => {
    if (opts.diagnostics || !c || c.trace === undefined) return c;
    const { trace, ...rest } = c; return rest;
  };
  return {
    jogo: event.jogo,
    candidatos: approved.map(hideTrace),
    reprovados: opts.diagnostics ? rejected : [],
    jogadores_sem_match,
    linhas_rejeitadas: input.linhas_rejeitadas,
    ia,
  };
}

/** Calcula candidatos de UM mercado de jogador, anexando a odd específica de cada
 * jogador casado. Jogadores sem match acumulam em `semMatchSink`. */
async function playerCandidates(
  event: any, market: MarketSpec, stats: any, lines: ManualOddsLine[],
  leagueId: unknown, overrides: Record<string, string>, semMatchSink: any[],
): Promise<any[]> {
  const squad: any[] = await stats.squad(event);
  const squadForMatch = squad.map((p) => ({ id: String(p.id), name: p.name }));
  const { casados, sem_match } = matchPlayerOdds(lines, squadForMatch, overrides);
  for (const sm of sem_match) semMatchSink.push({ ...sm, market_type: market.key });

  const homeId = String(event.home_team?.id ?? "");
  const awayId = String(event.away_team?.id ?? "");
  const xiTeamIds: Set<string> = typeof stats.xiIds === "function" ? await stats.xiIds(event) : new Set();
  const base = baselineFor(market, leagueId);
  const byId = new Map(squad.map((p) => [String(p.id), p]));
  const out: any[] = [];

  for (const od of casados) {
    const entity = byId.get(od.player_id);
    if (!entity) continue;
    const isHome = entity.team_id === homeId;
    const ctx = {
      event, entity_team_id: entity.team_id ?? entity.id, is_home: isHome,
      opp_team_id: isHome ? awayId : homeId, league_avg_conceded: base,
      xi_team_ids: xiTeamIds, escopo_historico: "todos",
    };
    const rate = await stats.entityRate(entity.id, market, ctx);
    if (rate == null) continue;
    out.push(buildCandidate({
      jogador: entity.name, linha: od.linha, odd_over: od.odd_over, odd_under: od.odd_under,
      prob_modelo: probOverLine(rate.mu, od.linha, market.nb_dispersion), mu: rate.mu,
      minutos_esperados: rate.minutos_esperados, xi_confirmado: rate.xi_confirmado,
      amostra_jogos: rate.amostra_jogos, concedido_adversario: rate.concedido_adversario,
      incerteza: rate.incerteza, market_type: market.key, player_id: entity.id, trace: rate.trace,
    }));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- manual/analyze` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manual/analyze.ts test/manual/analyze.test.ts
git commit -m "feat: analyzeManual orquestra todos os mercados com odd por-jogador"
```

---

## Task 7: Gerador de prompt

**Files:**
- Create: `src/manual/prompt.ts`
- Test: `test/manual/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buildOddsPrompt } from "../../src/manual/prompt.js";

const lineup = {
  home: { team_name: "Germany", jogadores: [{ id: "10", name: "Kai Havertz" }] },
  away: { team_name: "Scotland", jogadores: [{ id: "20", name: "Joshua Kimmich" }] },
};

describe("buildOddsPrompt", () => {
  it("mercado de jogador embute a lista de jogadores e pede só over", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "sot", lineup);
    expect(p).toContain("Kai Havertz");
    expect(p).toContain("Joshua Kimmich");
    expect(p).toMatch(/OVER|Mais de/i);
    expect(p).toContain('"market_type": "sot"');
    expect(p).toMatch(/não invente|OMITA/i);
  });

  it("mercado de partida pede os dois lados e não embute jogadores", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "escanteios", lineup);
    expect(p).not.toContain("Kai Havertz");
    expect(p).toMatch(/over.*under|Mais.*Menos/i);
    expect(p).toContain('"market_type": "escanteios"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- manual/prompt`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { MARKETS } from "../model/markets.js";

const PLAYER_MARKETS = new Set(["sot", "finalizacoes", "desarmes"]);

function playerNames(lineup: any): string[] {
  const out: string[] = [];
  for (const side of ["home", "away"]) {
    for (const p of lineup?.[side]?.jogadores ?? []) out.push(p.name);
  }
  return out;
}

/** Monta o prompt pronto pra colar no Claude-extensão, fatiado por mercado. */
export function buildOddsPrompt(event: any, marketKey: string, lineup: any): string {
  const market = MARKETS[marketKey];
  if (!market) throw new Error(`mercado desconhecido: ${marketKey}`);
  const jogo = event.jogo ?? `${event.home_team ?? "?"} x ${event.away_team ?? "?"}`;

  if (PLAYER_MARKETS.has(marketKey)) {
    const lista = playerNames(lineup).map((n) => `- ${n}`).join("\n");
    return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Aba: "${market.label}" (mercado de jogador).

Colete SOMENTE as odds OVER ("Mais de") de cada jogador desta lista:
${lista}

Para CADA jogador e CADA linha visível, devolva uma entrada.
Expanda TODAS as seções/acordeões antes de ler. Se um jogador da lista
não aparecer, OMITA — não invente. Não chute odd que você não viu.

Devolva APENAS JSON neste formato, nada mais:
[ { "market_type": "${marketKey}", "entidade": "<nome exato da lista>",
    "linha": <number>, "odd_over": <number>, "book": "<nome da casa>" } ]`;
  }

  const exemplo = marketKey === "vitoria"
    ? `[ { "market_type": "vitoria", "entidade": "<nome do time ou empate>",
    "odd_over": <number>, "book": "<nome da casa>" } ]  (uma entrada por resultado: mandante, visitante, empate)`
    : `[ { "market_type": "${marketKey}", "entidade": "partida", "linha": <number>,
    "odd_over": <number>, "odd_under": <number>, "book": "<nome da casa>" } ]`;

  return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Aba: "${market.label}" (mercado de partida).

Colete as odds com OS DOIS LADOS (Over/Under, "Mais de"/"Menos de") de cada linha visível.
Expanda TODAS as seções antes de ler. Não invente. Não chute odd que você não viu.

Devolva APENAS JSON neste formato, nada mais:
${exemplo}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- manual/prompt` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manual/prompt.ts test/manual/prompt.test.ts
git commit -m "feat: gerador de prompt por mercado (jogador embute lista, partida pede 2 lados)"
```

---

## Task 8: Service layer (prompt, análise, crosswalk)

**Files:**
- Modify: `src/service.ts`
- Test: `test/service.test.ts` (já aberto no IDE — adicionar casos)

- [ ] **Step 1: Write the failing test**

```typescript
import { generateOddsPrompt, analyzeManualService, confirmCrosswalk } from "../src/service.js";
import { InMemoryRepo } from "../src/store/repo.js";

// reaproveita fakeClient do Task 6 (copiar p/ este arquivo ou helper compartilhado)

describe("service manual", () => {
  it("generateOddsPrompt monta prompt com lineup do jogo", async () => {
    const p = await generateOddsPrompt(fakeClient(), "e1", "sot");
    expect(p).toContain("Kai Havertz");
  });

  it("analyzeManualService valida body e roda análise", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManualService(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }],
    }, { repo });
    expect(out.candidatos).toBeDefined();
    expect(out.linhas_rejeitadas).toHaveLength(0);
  });

  it("confirmCrosswalk persiste nome->id no repo", async () => {
    const repo = new InMemoryRepo();
    await confirmCrosswalk(repo, "CR7", "20");
    const ov = await repo.listCrosswalk();
    expect(ov["cr7"]).toBe("20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- service`
Expected: FAIL — funções não existem.

- [ ] **Step 3: Write minimal implementation**

Adicionar em `src/service.ts`:

```typescript
import { parseManualOdds } from "./manual/schema.js";
import { analyzeManual } from "./manual/analyze.js";
import { buildOddsPrompt } from "./manual/prompt.js";
import { normalize } from "./crosswalk/match.js";
import { analyze as aiAnalyst, fakeAnalyst } from "./ai/analyst.js";

/** Gera o prompt de coleta de odds p/ um mercado (busca o lineup do jogo). */
export async function generateOddsPrompt(client: any, eventId: string, marketKey: string): Promise<string> {
  const raw = await client.getEvent(eventId);
  const event = { jogo: `${raw.home_team ?? "?"} x ${raw.away_team ?? "?"}`,
    home_team: raw.home_team, away_team: raw.away_team };
  const lineup = await probableLineup(client, eventId);
  return buildOddsPrompt(event, marketKey, lineup);
}

export interface AnalyzeManualServiceOpts { repo?: any; useAi?: boolean; diagnostics?: boolean; }

/** Valida o JSON colado e roda a análise geral de todos os mercados. */
export async function analyzeManualService(client: any, body: unknown, opts: AnalyzeManualServiceOpts = {}): Promise<any> {
  const input = parseManualOdds(body); // lança em erro estrutural
  return analyzeManual(client, input, {
    repo: opts.repo, analystFn: opts.useAi ? aiAnalyst : fakeAnalyst, diagnostics: opts.diagnostics ?? false,
  });
}

/** Liga um nome da casa a um player_id (stats-id) e persiste no crosswalk. */
export async function confirmCrosswalk(repo: any, nomeCasa: string, playerId: string): Promise<void> {
  const idNum = Number(playerId);
  await repo.saveCrosswalk(idNum, normalize(nomeCasa), { casa: nomeCasa }, 1.0, true);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- service` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service.ts test/service.test.ts
git commit -m "feat: service layer manual (generateOddsPrompt, analyzeManualService, confirmCrosswalk)"
```

---

## Task 9: Endpoints da API

**Files:**
- Modify: `src/api/app.ts`
- Test: `test/api/app.test.ts` (criar se não existir; senão adicionar)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/api/app.js";
import { InMemoryRepo } from "../../src/store/repo.js";
// reaproveita fakeClient

describe("rotas manuais", () => {
  const deps = { client: fakeClient(), repo: new InMemoryRepo() };

  it("GET /prompt devolve string do prompt", async () => {
    const res = await request(createApp(deps)).get("/prompt").query({ event_id: "e1", market: "sot" });
    expect(res.status).toBe(200);
    expect(res.body.prompt).toContain("Kai Havertz");
  });

  it("POST /analise/manual roda e devolve candidatos", async () => {
    const res = await request(createApp(deps)).post("/analise/manual").send({
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.candidatos).toBeDefined();
  });

  it("POST /crosswalk persiste e devolve ok", async () => {
    const res = await request(createApp(deps)).post("/crosswalk").send({ nome_casa: "CR7", player_id: "20" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /analise/manual sem coletado_em → 400", async () => {
    const res = await request(createApp(deps)).post("/analise/manual").send({ event_id: "e1", odds: [] });
    expect(res.status).toBe(400);
  });
});
```

(Se `supertest` não estiver instalado: `npm i -D supertest @types/supertest`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api/app`
Expected: FAIL — rotas não existem (404).

- [ ] **Step 3: Write minimal implementation**

Em `src/api/app.ts`, adicionar schemas e rotas (antes do middleware de erro):

```typescript
const promptQuery = z.object({ event_id: z.string(), market: z.string() });
const crosswalkSchema = z.object({ nome_casa: z.string(), player_id: z.string() });

app.get("/prompt", wrap(async (req, res) => {
  const q = promptQuery.safeParse(req.query);
  if (!q.success) throw new AppError(400, "query_invalida", "event_id e market são obrigatórios");
  res.json({ prompt: await service.generateOddsPrompt(deps.client, q.data.event_id, q.data.market) });
}));

app.post("/analise/manual", wrap(async (req, res) => {
  // validação fina do JSON é do parseManualOdds (lança → 400 no middleware)
  res.json(await service.analyzeManualService(deps.client, req.body, { repo: deps.repo }));
}));

app.post("/crosswalk", wrap(async (req, res) => {
  const p = crosswalkSchema.safeParse(req.body);
  if (!p.success) throw new AppError(400, "body_invalido", p.error.issues.map((i) => i.message).join("; "));
  await service.confirmCrosswalk(deps.repo, p.data.nome_casa, p.data.player_id);
  res.json({ ok: true });
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- api/app` e `npm run typecheck`
Expected: PASS. (Erro do `parseManualOdds` cai no middleware existente → 400.)

- [ ] **Step 5: Commit**

```bash
git add src/api/app.ts test/api/app.test.ts package.json
git commit -m "feat: endpoints GET /prompt, POST /analise/manual, POST /crosswalk"
```

---

## Task 10: Suíte completa + docs vivas

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/PITCH.md`

- [ ] **Step 1: Rodar tudo**

Run: `npm test` e `npm run typecheck`
Expected: PASS — todos verdes, incluindo gate de paridade (1e-9) intacto. Anotar a nova contagem de testes.

- [ ] **Step 2: Atualizar ROADMAP.md**

Adicionar seção no topo descrevendo o fluxo de coleta manual de odds (prompt gerado + JSON colado + análise geral), marcar como entregue/MVP. **Verificar o fundo do doc** (TL;DR, "Estado por fase", follow-ups) e corrigir o que passou a contradizer. Atualizar contagem de testes e data no cabeçalho.

- [ ] **Step 3: Atualizar PITCH.md**

Descrever em linguagem leiga (sem jargão): "agora dá pra colar as odds que a IA coletou no site da casa e rodar a análise de todos os mercados de uma vez". Garantir que escopo de mercados não contradiz o ROADMAP.

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/PITCH.md
git commit -m "docs: registra fluxo de coleta manual de odds no ROADMAP e PITCH"
```

- [ ] **Step 5: Finalizar branch**

Usar superpowers:finishing-a-development-branch para decidir merge/PR.

---

## Notas de design (para o executor)

- **Por que não usar o `runner.runAnalyze` existente:** ele roda UM mercado e o `playerCount` do pipeline **espalha** cada linha de odds para TODOS os jogadores. Odds por-jogador exigem casar linha→jogador, por isso `analyzeManual` tem seu próprio loop (`playerCandidates`) que anexa a odd específica de cada jogador. Os mercados de PARTIDA reusam `matchCount`/`runMatch` direto (lá o espalhamento é correto — a entidade é a partida).
- **De-vig single-side é conservador, não furado:** odd crua tem margem → implícita inflada → teste mais difícil → nunca sinaliza valor-fantasma. EV calculado na odd crua é o EV real embolsado. Candidato marcado `sem_devig: true`.
- **Fail-closed mantido:** jogador sem match confiável NUNCA casa errado — vai pra `jogadores_sem_match` com candidatos ranqueados pro operador ligar (1 clique → `POST /crosswalk` → salva → re-roda → auto-match nas próximas).
- **Gate de paridade intocado:** o motor não muda; a única edição em `buildCandidate` só altera comportamento quando `odd_under` é null, o que os goldens nunca enviam.
