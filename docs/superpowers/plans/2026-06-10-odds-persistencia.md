# Persistência de odds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir odds numa tabela `odds` (fonte de verdade): colar salva, abrir carrega, analisar lê do repo por `event_id`.

**Architecture:** Nova tabela `odds` no Supabase. O port `Repo` ganha `saveOdds/getOdds/deleteOdds/listOddsEvents` (InMemory + Supabase). Novos endpoints `POST /odds`, `GET/DELETE /jogos/:id/odds`. `/analise/manual` passa a persistir odds do corpo (se houver) e **sempre** ler do repo. Motor e gate de paridade intactos.

**Tech Stack:** Node/TS (ESM, strict), Express 5, Zod 4, Vitest, supertest, @supabase/supabase-js, MCP Supabase (`apply_migration`).

Spec: `docs/superpowers/specs/2026-06-10-odds-persistencia-design.md`

---

### Task 1: Tabela `odds` (schema + migração MCP)

**Files:**
- Modify: `src/store/schema.sql`

- [ ] **Step 1: Adicionar a DDL ao schema.sql** (fonte de verdade)

```sql
-- odds coletadas (fonte de verdade das odds; liga/jogo/jogador seguem vivos da BSD).
-- Última migração: create_odds_table (2026-06-10)
create table if not exists odds (
  event_id     text not null,
  entidade     text not null,        -- nome do jogador, ou "partida" p/ mercados de partida
  market_type  text not null,
  linha        numeric not null,
  odd_over     numeric not null,
  odd_under    numeric,
  book         text not null default 'manual',
  coletado_em  timestamptz not null default now(),
  primary key (event_id, entidade, market_type, linha, book)
);
create index if not exists odds_event_idx on odds (event_id);
```

- [ ] **Step 2: Aplicar a migração via MCP Supabase**

Usar a tool `mcp__supabase__apply_migration` (server `supabase` do projeto, ref `pepizcpowzhtawzjnzui`):
- `name`: `create_odds_table`
- `query`: a DDL acima (apenas o `create table` + `create index`, sem comentário de cabeçalho).

- [ ] **Step 3: Verificar a tabela e rodar advisors**

Run (MCP): `mcp__supabase__list_tables` → confirmar `odds` presente com as colunas.
Run (MCP): `mcp__supabase__get_advisors` (type `security`) → tratar lint relevante (ex.: RLS) ou registrar como aceito (backend usa service key, mesma postura das tabelas atuais).

- [ ] **Step 4: Commit**

```bash
git add src/store/schema.sql
git commit -m "feat: tabela odds (schema + migracao create_odds_table)"
```

---

### Task 2: Port `Repo` — tipos + InMemoryRepo (TDD)

**Files:**
- Modify: `src/store/repo.ts`
- Test: `test/repo.test.ts`

- [ ] **Step 1: Escrever os testes que falham** (append em `test/repo.test.ts`, dentro do `describe("InMemoryRepo", …)` ou num novo describe)

```ts
describe("InMemoryRepo — odds", () => {
  const row = (over: number, extra: Partial<import("../src/store/repo.js").OddsRow> = {}) => ({
    event_id: "e1", entidade: "CR7", market_type: "sot", linha: 0.5,
    odd_over: over, odd_under: null as number | null, book: "bet365",
    coletado_em: "2026-06-10T00:00:00Z", ...extra,
  });

  it("saveOdds insere e getOdds devolve", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    const got = r.getOdds("e1");
    expect(got).toHaveLength(1);
    expect(got[0]!.odd_over).toBe(1.5);
    expect(r.getOdds("zzz")).toEqual([]);
  });

  it("saveOdds sobrescreve a mesma PK (event+entidade+market+linha+book)", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    r.saveOdds("e1", [row(1.8)]); // mesma PK, odd nova
    const got = r.getOdds("e1");
    expect(got).toHaveLength(1);
    expect(got[0]!.odd_over).toBe(1.8);
  });

  it("saveOdds acumula mercados diferentes sem apagar", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    r.saveOdds("e1", [row(2.0, { market_type: "desarmes" })]);
    expect(r.getOdds("e1")).toHaveLength(2);
  });

  it("deleteOdds sem filtro limpa o jogo; com filtro remove 1 linha", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5), row(2.0, { market_type: "desarmes" })]);
    r.deleteOdds("e1", { market_type: "sot" });
    expect(r.getOdds("e1")).toHaveLength(1);
    r.deleteOdds("e1");
    expect(r.getOdds("e1")).toEqual([]);
  });

  it("listOddsEvents resume por event_id", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    r.saveOdds("e2", [row(1.5), row(2.0, { event_id: "e2", market_type: "desarmes" })]);
    const sum = r.listOddsEvents().sort((a, b) => a.event_id.localeCompare(b.event_id));
    expect(sum).toHaveLength(2);
    expect(sum[1]!.total_linhas).toBe(2);
    expect(sum[0]!.ultimo_coletado_em).toBe("2026-06-10T00:00:00Z");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- repo`
Expected: FAIL (`saveOdds`/`OddsRow` não existem).

- [ ] **Step 3: Implementar tipos + métodos no InMemoryRepo**

Em `src/store/repo.ts`, adicionar antes da interface `Repo`:

```ts
export interface OddsRow {
  event_id: string;
  entidade: string;
  market_type: string;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  book: string;
  coletado_em?: string;
}

export interface OddsEventSummary {
  event_id: string;
  total_linhas: number;
  ultimo_coletado_em: string | null;
}
```

Na interface `Repo`, adicionar:

```ts
  saveOdds(eventId: string, lines: OddsRow[]): Promise<void> | void;
  getOdds(eventId: string): Promise<OddsRow[]> | OddsRow[];
  deleteOdds(eventId: string, filter?: Partial<OddsRow>): Promise<void> | void;
  listOddsEvents(): Promise<OddsEventSummary[]> | OddsEventSummary[];
```

No `InMemoryRepo`, adicionar o campo e os métodos:

```ts
  odds = new Map<string, OddsRow[]>();

  private oddsKey(r: OddsRow): string {
    return `${r.entidade}|${r.market_type}|${r.linha}|${r.book}`;
  }

  saveOdds(eventId: string, lines: OddsRow[]) {
    const cur = this.odds.get(eventId) ?? [];
    const byKey = new Map(cur.map((r) => [this.oddsKey(r), r]));
    for (const l of lines) byKey.set(this.oddsKey(l), { ...l, event_id: eventId });
    this.odds.set(eventId, [...byKey.values()]);
  }

  getOdds(eventId: string): OddsRow[] {
    return this.odds.get(eventId) ?? [];
  }

  deleteOdds(eventId: string, filter?: Partial<OddsRow>) {
    if (!filter || Object.keys(filter).length === 0) { this.odds.delete(eventId); return; }
    const cur = this.odds.get(eventId) ?? [];
    const entries = Object.entries(filter);
    this.odds.set(eventId, cur.filter((r) => !entries.every(([k, v]) => (r as any)[k] === v)));
  }

  listOddsEvents(): OddsEventSummary[] {
    const out: OddsEventSummary[] = [];
    for (const [event_id, rows] of this.odds) {
      const times = rows.map((r) => r.coletado_em ?? "").filter(Boolean).sort();
      out.push({ event_id, total_linhas: rows.length, ultimo_coletado_em: times.length ? times[times.length - 1]! : null });
    }
    return out;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- repo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/repo.ts test/repo.test.ts
git commit -m "feat: Repo.saveOdds/getOdds/deleteOdds/listOddsEvents (InMemory)"
```

---

### Task 3: SupabaseRepo — métodos de odds

**Files:**
- Modify: `src/store/repo.ts` (classe `SupabaseRepo`)

> Sem teste offline (precisa de Supabase real). Garantia = a interface `Repo` força a assinatura; `npm run typecheck` cobre. O fluxo é exercitado via InMemory nos testes de API.

- [ ] **Step 1: Implementar os métodos no SupabaseRepo**

```ts
  async saveOdds(eventId: string, lines: OddsRow[]) {
    if (!lines.length) return;
    const rows = lines.map((l) => ({ ...l, event_id: eventId }));
    await this.client.from("odds").upsert(rows, { onConflict: "event_id,entidade,market_type,linha,book" });
  }

  async getOdds(eventId: string): Promise<OddsRow[]> {
    const { data } = await this.client.from("odds").select("*").eq("event_id", eventId);
    return (data ?? []) as OddsRow[];
  }

  async deleteOdds(eventId: string, filter?: Partial<OddsRow>) {
    let q = this.client.from("odds").delete().eq("event_id", eventId);
    for (const [k, v] of Object.entries(filter ?? {})) q = q.eq(k, v);
    await q;
  }

  async listOddsEvents(): Promise<OddsEventSummary[]> {
    const { data } = await this.client.from("odds").select("event_id, coletado_em");
    const map = new Map<string, { total: number; last: string | null }>();
    for (const r of (data ?? []) as any[]) {
      const cur = map.get(r.event_id) ?? { total: 0, last: null };
      cur.total++;
      if (r.coletado_em && (!cur.last || r.coletado_em > cur.last)) cur.last = r.coletado_em;
      map.set(r.event_id, cur);
    }
    return [...map].map(([event_id, v]) => ({ event_id, total_linhas: v.total, ultimo_coletado_em: v.last }));
  }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (sem erro de assinatura faltando na interface).

- [ ] **Step 3: Commit**

```bash
git add src/store/repo.ts
git commit -m "feat: SupabaseRepo métodos de odds (upsert/select/delete/summary)"
```

---

### Task 4: Serviço — saveOdds/getOdds/deleteOdds + analyzeManual lê do repo (TDD)

**Files:**
- Modify: `src/service.ts`
- Test: `test/service.test.ts`

- [ ] **Step 1: Escrever os testes que falham** (append em `test/service.test.ts`)

```ts
import { saveOddsService, getOddsService, deleteOddsService, analyzeManualService } from "../src/service.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { fakeClient, fakeReviewer } from "./manualFixtures.js";

describe("service — odds persistidas", () => {
  const body = (odds: any[]) => ({ event_id: "e1", coletado_em: "2026-06-10T00:00:00Z", odds });

  it("saveOddsService persiste linhas válidas e devolve rejeitadas", async () => {
    const repo = new InMemoryRepo();
    const out = await saveOddsService(repo, body([
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" },
      { market_type: "zzz", entidade: "X", linha: 0.5, odd_over: 2.0, book: "b" },
    ]));
    expect(out.salvas).toBe(1);
    expect(out.linhas_rejeitadas).toHaveLength(1);
    expect(repo.getOdds("e1")).toHaveLength(1);
  });

  it("getOddsService lê o que foi salvo", async () => {
    const repo = new InMemoryRepo();
    await saveOddsService(repo, body([{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }]));
    expect(await getOddsService(repo, "e1")).toHaveLength(1);
  });

  it("deleteOddsService limpa o jogo", async () => {
    const repo = new InMemoryRepo();
    await saveOddsService(repo, body([{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }]));
    await deleteOddsService(repo, "e1");
    expect(await getOddsService(repo, "e1")).toEqual([]);
  });

  it("analyzeManualService persiste odds do corpo e analisa do repo", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManualService(fakeClient(), body([
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" },
    ]), { repo, reviewerFn: fakeReviewer });
    expect(out.candidatos).toBeDefined();
    expect(repo.getOdds("e1")).toHaveLength(1); // ficou persistido
  });

  it("analyzeManualService sem odds no corpo analisa o que já está no repo", async () => {
    const repo = new InMemoryRepo();
    await saveOddsService(repo, body([{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }]));
    const out = await analyzeManualService(fakeClient(), { event_id: "e1" }, { repo, reviewerFn: fakeReviewer });
    expect(out.candidatos).toBeDefined();
    expect(out.jogadores_sem_match).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- service`
Expected: FAIL (`saveOddsService`/`deleteOddsService`/`getOddsService` não existem; `analyzeManualService` não persiste).

- [ ] **Step 3: Implementar no `src/service.ts`**

Adicionar imports no topo (já existe `parseManualOdds` e `analyzeManual` importados? `parseManualOdds` sim; `analyzeManual` sim; `InMemoryRepo` precisa):

```ts
import { InMemoryRepo, type OddsRow } from "./store/repo.js";
import type { ManualOddsInput } from "./manual/schema.js";
```

Adicionar as funções:

```ts
/** Salva odds coladas na tabela (upsert por PK). Valida via parseManualOdds. */
export async function saveOddsService(repo: any, body: unknown): Promise<{ salvas: number; linhas_rejeitadas: any[] }> {
  const input = parseManualOdds(body);
  const rows: OddsRow[] = input.odds.map((o) => ({
    event_id: input.event_id, entidade: o.entidade, market_type: o.market_type,
    linha: o.linha, odd_over: o.odd_over, odd_under: o.odd_under, book: o.book,
    coletado_em: input.coletado_em,
  }));
  await repo.saveOdds(input.event_id, rows);
  return { salvas: rows.length, linhas_rejeitadas: input.linhas_rejeitadas };
}

export async function getOddsService(repo: any, eventId: string): Promise<OddsRow[]> {
  return repo.getOdds(eventId);
}

export async function deleteOddsService(repo: any, eventId: string, filter?: Partial<OddsRow>): Promise<{ ok: true }> {
  await repo.deleteOdds(eventId, filter);
  return { ok: true };
}
```

Substituir o corpo de `analyzeManualService` (mantendo a assinatura) por:

```ts
/** Persiste odds do corpo (se houver) e SEMPRE analisa as odds do repo por event_id. */
export async function analyzeManualService(client: any, body: unknown, opts: AnalyzeManualServiceOpts = {}): Promise<any> {
  const repo = opts.repo ?? new InMemoryRepo();
  const b: any = body ?? {};
  let linhas_rejeitadas: any[] = [];

  if (Array.isArray(b.odds)) {
    const parsed = parseManualOdds(b); // lança em erro estrutural → 400; separa rejeitadas por-linha
    linhas_rejeitadas = parsed.linhas_rejeitadas;
    const rows: OddsRow[] = parsed.odds.map((o) => ({
      event_id: parsed.event_id, entidade: o.entidade, market_type: o.market_type,
      linha: o.linha, odd_over: o.odd_over, odd_under: o.odd_under, book: o.book,
      coletado_em: parsed.coletado_em,
    }));
    await repo.saveOdds(parsed.event_id, rows);
  }

  const eventId = String(b.event_id ?? "");
  const stored: OddsRow[] = await repo.getOdds(eventId);
  const input: ManualOddsInput = {
    event_id: eventId,
    coletado_em: String(b.coletado_em ?? ""),
    odds: stored.map((r) => ({
      market_type: r.market_type, entidade: r.entidade, linha: Number(r.linha),
      odd_over: Number(r.odd_over), odd_under: r.odd_under == null ? null : Number(r.odd_under), book: r.book,
    })),
    linhas_rejeitadas,
    escopo_historico: String(b.escopo_historico ?? "todos"),
  };
  return analyzeManual(client, input, { repo, reviewerFn: opts.reviewerFn, diagnostics: opts.diagnostics ?? false });
}
```

> Nota: remover o import agora-órfão `parseManualOdds`? Não — ele continua usado. Remover `analyzeManual` import? continua usado. Garantir que `analyzeManual` e `parseManualOdds` seguem importados no topo do arquivo (já estão).

- [ ] **Step 4: Rodar e ver passar** (service + a suíte manual que usa analyzeManualService indiretamente)

Run: `npm test -- service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service.ts test/service.test.ts
git commit -m "feat: serviço de odds (save/get/delete) e analyzeManual lê do repo"
```

---

### Task 5: Endpoints — POST /odds, GET/DELETE /jogos/:id/odds (TDD)

**Files:**
- Modify: `src/api/app.ts`
- Test: `test/api.test.ts`

- [ ] **Step 1: Escrever os testes que falham** (append em `test/api.test.ts`, no describe "fluxo manual de odds" ou novo)

```ts
describe("API — odds persistidas", () => {
  const manualApp = () => createApp({ client: manualClient(), repo: new InMemoryRepo(), reviewerFn: fakeReviewer });

  it("POST /odds salva e GET /jogos/:id/odds devolve", async () => {
    const a = manualApp();
    const post = await request(a).post("/odds").send({
      event_id: "e1", coletado_em: "2026-06-10T00:00:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }],
    });
    expect(post.status).toBe(200);
    expect(post.body.salvas).toBe(1);
    const get = await request(a).get("/jogos/e1/odds");
    expect(get.status).toBe(200);
    expect(get.body).toHaveLength(1);
    expect(get.body[0].odd_over).toBe(3.0);
  });

  it("POST /odds sem coletado_em → 400", async () => {
    const r = await request(manualApp()).post("/odds").send({ event_id: "e1", odds: [] });
    expect(r.status).toBe(400);
  });

  it("DELETE /jogos/:id/odds limpa o jogo", async () => {
    const a = manualApp();
    await request(a).post("/odds").send({
      event_id: "e1", coletado_em: "2026-06-10T00:00:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }],
    });
    const del = await request(a).delete("/jogos/e1/odds");
    expect(del.status).toBe(200);
    const get = await request(a).get("/jogos/e1/odds");
    expect(get.body).toEqual([]);
  });
});
```

> Nota: os dois testes `POST /analise/manual → 200` existentes continuam válidos — o corpo com `odds[]` agora persiste e re-lê do repo (InMemory), produzindo os mesmos candidatos. Não precisam mudar.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- api`
Expected: FAIL nos 3 novos (`/odds`, `/jogos/:id/odds` não existem → 404).

- [ ] **Step 3: Implementar os endpoints em `src/api/app.ts`**

Adicionar o schema do delete-filter perto dos outros schemas:

```ts
const oddsFilterQuery = z.object({
  entidade: z.string().optional(),
  market_type: z.string().optional(),
  linha: z.coerce.number().optional(),
  book: z.string().optional(),
});
```

Adicionar as rotas (perto de `/analise/manual`):

```ts
  app.post("/odds", wrap(async (req, res) => {
    // parseManualOdds dentro do serviço lança em erro estrutural → 400 no middleware.
    res.json(await service.saveOddsService(deps.repo, req.body));
  }));

  app.get("/jogos/:eventId/odds", wrap(async (req, res) => {
    res.json(await service.getOddsService(deps.repo, req.params.eventId));
  }));

  app.delete("/jogos/:eventId/odds", wrap(async (req, res) => {
    const q = oddsFilterQuery.safeParse(req.query);
    const filter = q.success ? q.data : {};
    res.json(await service.deleteOddsService(deps.repo, req.params.eventId, filter));
  }));
```

Adicionar `DELETE` aos métodos CORS permitidos:

```ts
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
```

- [ ] **Step 4: Rodar e ver passar** (api inteira, garantindo que os testes antigos seguem verdes)

Run: `npm test -- api`
Expected: PASS (novos + antigos).

- [ ] **Step 5: Suíte completa + typecheck**

Run: `npm test`
Run: `npm run typecheck`
Expected: tudo verde; contagem de testes subiu; gate de paridade intacto.

- [ ] **Step 6: Commit**

```bash
git add src/api/app.ts test/api.test.ts
git commit -m "feat: endpoints POST /odds, GET/DELETE /jogos/:id/odds"
```

---

### Task 6: Seed dos `odds/*.json` existentes

**Files:**
- Create: `scripts/seedOdds.ts`
- Create: `odds/manifest.json`
- Modify: `package.json` (script `seed:odds`)

> Utilitário de migração, roda uma vez. Os arquivos em `odds/` são arrays de linhas sem `event_id`/`coletado_em`; o manifesto mapeia arquivo → `event_id` BSD.

- [ ] **Step 1: Criar o manifesto** (`odds/manifest.json`)

```json
{
  "england-10-06-26.json": "",
  "portugal-10-06-26.json": ""
}
```

> Preencher cada `""` com o `event_id` BSD do jogo correspondente antes de rodar. Entradas vazias são puladas com aviso.

- [ ] **Step 2: Criar o script** (`scripts/seedOdds.ts`)

```ts
// Semeia as odds dos arquivos odds/*.json na tabela `odds` via SupabaseRepo.
// Uso: npm run seed:odds  (precisa de odds/manifest.json com event_id por arquivo)
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createSupabaseRepo } from "../src/store/repo.js";
import { saveOddsService } from "../src/service.js";

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const oddsDir = resolve(here, "../odds");
  const manifest: Record<string, string> = JSON.parse(readFileSync(resolve(oddsDir, "manifest.json"), "utf8"));
  const repo = await createSupabaseRepo();

  for (const [file, eventId] of Object.entries(manifest)) {
    if (!eventId) { console.warn(`pulado (sem event_id): ${file}`); continue; }
    const odds = JSON.parse(readFileSync(resolve(oddsDir, file), "utf8"));
    const out = await saveOddsService(repo, {
      event_id: eventId, coletado_em: new Date().toISOString(), odds,
    });
    console.log(`${file} → event_id=${eventId}: ${out.salvas} salvas, ${out.linhas_rejeitadas.length} rejeitadas`);
  }
}

main().catch((e) => { console.error("falha no seed:", e); process.exit(1); });
```

- [ ] **Step 3: Adicionar o script ao package.json**

Em `"scripts"`:

```json
    "seed:odds": "tsx scripts/seedOdds.ts"
```

- [ ] **Step 4: Typecheck (não rodar o seed — exige Supabase e event_ids reais)**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/seedOdds.ts odds/manifest.json package.json
git commit -m "feat: script seed:odds (importa odds/*.json p/ tabela via manifesto)"
```

---

### Task 7: Documentação viva (ROADMAP + PITCH)

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PITCH.md`

> CLAUDE.md exige atualizar ROADMAP/PITCH no mesmo trabalho que muda estado/escopo.

- [ ] **Step 1: ROADMAP** — adicionar entrada no topo: odds passaram a ser persistidas (tabela `odds`, schema.sql + migração `create_odds_table`); endpoints `POST /odds`, `GET/DELETE /jogos/:id/odds`; `/analise/manual` lê do repo. Atualizar **data** e **contagem de testes** no cabeçalho. Verificar o fundo do doc (TL;DR/estado por fase) e corrigir contradições.

- [ ] **Step 2: PITCH** — em linguagem leiga: "As cotações que você cola ficam guardadas. Abriu o jogo de novo, elas já estão lá — não precisa re-colar. Por enquanto a entrada continua sendo o JSON colado; no futuro, scraping/API."

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PITCH.md
git commit -m "docs: ROADMAP/PITCH — odds persistidas (tabela odds)"
```

---

## Self-Review

- **Spec coverage:** schema (T1), port InMemory (T2) + Supabase (T3), serviço + analyze-lê-repo (T4), endpoints (T5), seed (T6), docs (T7). `/odds/jogos` (vitrine) ficou marcado como opcional no spec — `listOddsEvents` já existe no repo (T2/T3) como base; o endpoint fica como follow-up de front, fora do plano de backend. Frontend wiring = follow-up pós tela-única (declarado no spec).
- **Placeholders:** manifesto tem `""` a preencher — é dado de runtime do dono, não placeholder de código; documentado com instrução explícita e pulo com aviso.
- **Type consistency:** `OddsRow`/`OddsEventSummary` definidos em T2 e reusados em T3/T4/T6; `saveOddsService`/`getOddsService`/`deleteOddsService`/`analyzeManualService` com assinaturas idênticas em serviço (T4) e endpoints (T5).
