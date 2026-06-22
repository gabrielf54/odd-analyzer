# Agendador 24h da Copa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend roda 24h e sozinho fotografa odds nos marcos que movem a linha + loga previsões (forward $0) + liquida jogos, tudo timed ao kickoff de cada jogo da Copa, auditável e resistente a restart.

**Architecture:** Módulo `src/scheduler/` com núcleo PURO (`plan.ts`, `lineupWatch.ts`) testável + casca ADAPTER (`runner.ts`) com tudo injetado. Reusa serviços existentes (`coletarOddsService`, `runForwardLog`, `runSettle`); orquestra, não recalcula. Migrações já aplicadas (`odds_snapshots.mark/origem`, `scheduler_runs`).

**Tech Stack:** Node/TS ESM strict, Vitest, Express, Supabase. Sem dependência nova (`setTimeout`/`setInterval`).

---

## File Structure

**Backend (criar):**
- `src/scheduler/plan.ts` — `upcomingGames`, `computeSchedule` (PURO).
- `src/scheduler/lineupWatch.ts` — `detectFlip` (PURO).
- `src/scheduler/jobs.ts` — `runForwardLog`, `runSettle` (lib reusável extraída dos CLIs).
- `src/scheduler/runner.ts` — `SchedulerRunner` (daemon, deps injetadas).
- `test/schedulerPlan.test.ts`, `test/lineupWatch.test.ts`, `test/schedulerJobs.test.ts`, `test/schedulerRunner.test.ts`, `test/schedulerRuns.test.ts`, `test/schedulerStatus.test.ts`.

**Backend (modificar):**
- `src/store/repo.ts` — `OddsSnapshotRow` (+mark/origem), `SchedulerRunRow`, métodos `appendSchedulerRun`/`getRecentSchedulerRuns`.
- `src/service.ts` — `appendSnapshotFromUnified`/`coletarOddsService` aceitam mark/origem; novo `schedulerStatusService`.
- `src/cli/forwardLog.ts`, `src/cli/settle.ts` — viram cascas finas que chamam `jobs.ts`.
- `src/api/app.ts` — `GET /scheduler/status`.
- `src/api/server.ts` — sobe o daemon (flag) + porta default 5926.

**Front (criar):** `app/agendador/page.tsx`, `components/SchedulerPanel.tsx`.
**Front (modificar):** `lib/types.ts`, `lib/api.ts`, `app/layout.tsx` (link), `package.json` (`-p 5927`).

**Docs:** `CLAUDE.md` (portas), `docs/CORE.md` (§3/§4), `docs/features/forward-loop-copa/README.md` (Automação).

---

## Task 1: Repo — mark/origem em snapshots + scheduler_runs

**Files:** Modify `src/store/repo.ts` · Test `test/schedulerRuns.test.ts`

- [ ] **Step 1: Test (InMemory append/get scheduler_runs + ordem desc)**

```ts
import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";

describe("scheduler_runs (diário de bordo do agendador)", () => {
  it("append acrescenta e getRecent devolve mais novo primeiro", () => {
    const repo = new InMemoryRepo();
    repo.appendSchedulerRun({ event_id: "e1", jogo: "A x B", job_type: "collect", mark: "base", status: "ok", detalhe: { retratos: 12 }, criado_em: "2026-06-22T09:00:00Z" });
    repo.appendSchedulerRun({ event_id: "e1", jogo: "A x B", job_type: "collect", mark: "fechamento", status: "ok", detalhe: { retratos: 10 }, criado_em: "2026-06-22T14:57:00Z" });
    const runs = repo.getRecentSchedulerRuns(10);
    expect(runs.length).toBe(2);
    expect(runs[0]!.mark).toBe("fechamento"); // mais novo primeiro
    expect(runs[1]!.mark).toBe("base");
  });
  it("getRecent respeita o limite", () => {
    const repo = new InMemoryRepo();
    for (let i = 0; i < 5; i++) repo.appendSchedulerRun({ job_type: "discover", status: "ok", criado_em: `2026-06-22T0${i}:00:00Z` });
    expect(repo.getRecentSchedulerRuns(3).length).toBe(3);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run test/schedulerRuns.test.ts` → FAIL (appendSchedulerRun não existe).

- [ ] **Step 3: Implementar no repo.ts**

Em `OddsSnapshotRow` adicionar (após `lineup_status`):
```ts
  mark?: string | null;        // 'base'|'deriva'|'salto'|'fechamento' (agendador); null = manual
  origem?: string;             // 'manual' | 'scheduler'
```
Novo tipo (perto de `OddsSnapshotRow`):
```ts
export interface SchedulerRunRow {
  event_id?: string | null;
  jogo?: string | null;
  job_type: string;            // 'collect'|'lineup_watch'|'forward_log'|'settle'|'discover'
  mark?: string | null;
  status: string;              // 'ok'|'erro'|'pulado'
  detalhe?: any;
  criado_em: string;
}
```
Na interface `Repo` adicionar:
```ts
  appendSchedulerRun(row: SchedulerRunRow): Promise<void> | void;
  getRecentSchedulerRuns(limit?: number): Promise<SchedulerRunRow[]> | SchedulerRunRow[];
```
No `InMemoryRepo` (campo + métodos):
```ts
  schedulerRuns: SchedulerRunRow[] = [];
  appendSchedulerRun(row: SchedulerRunRow) { this.schedulerRuns.push(row); }
  getRecentSchedulerRuns(limit = 50): SchedulerRunRow[] {
    return [...this.schedulerRuns].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, limit);
  }
```
No `SupabaseRepo` (espelhar o padrão de `appendOddsSnapshot`/`getOddsSnapshots`):
```ts
  async appendSchedulerRun(row: SchedulerRunRow) {
    await this.mutate("appendSchedulerRun", this.client.from("scheduler_runs").insert(row), { job: row.job_type });
  }
  async getRecentSchedulerRuns(limit = 50): Promise<SchedulerRunRow[]> {
    return this.query<SchedulerRunRow[]>("getRecentSchedulerRuns",
      this.client.from("scheduler_runs").select("*").order("criado_em", { ascending: false }).limit(limit), []);
  }
```

- [ ] **Step 4:** Run `npx vitest run test/schedulerRuns.test.ts` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat(scheduler): repo p/ scheduler_runs + mark/origem em snapshots"`

## Task 2: service — snapshot carrega mark/origem

**Files:** Modify `src/service.ts` · Test `test/oddsSnapshots.test.ts` (estender)

- [ ] **Step 1: Test (mark/origem fluem pro snapshot)**

Adicionar ao describe existente:
```ts
it("appendSnapshotFromUnified grava mark + origem quando passados", async () => {
  const repo = new InMemoryRepo();
  repo.saveOddsUnificadas("e1", [{ event_id: "e1", entidade_norm: "pedri", entidade: "Pedri", market_type: "sot", linha: 1.5, odd_over: 2.0, odd_under: 1.8, book: "kto", casas_comparadas: [], divergencia: false } as any]);
  await appendSnapshotFromUnified(repo, "e1", "predicted", { mark: "base", origem: "scheduler" });
  const s = repo.getOddsSnapshots("e1")[0]!;
  expect(s.mark).toBe("base");
  expect(s.origem).toBe("scheduler");
});
```

- [ ] **Step 2:** Run → FAIL (assinatura não aceita 4º arg).

- [ ] **Step 3: Implementar**

`appendSnapshotFromUnified` ganha 4º parâmetro `opts: { mark?: string; origem?: string } = {}`; cada row recebe `mark: opts.mark ?? null, origem: opts.origem ?? "manual"`. Em `coletarOddsService`, `RunCollectionOpts` (ou opts locais) ganha `snapshotMark?`/`snapshotOrigem?`; a chamada vira `appendSnapshotFromUnified(repo, id, lineupStatus, { mark: opts.snapshotMark, origem: opts.snapshotOrigem ?? "manual" })`. `saveOddsService` segue chamando sem opts (→ manual).

- [ ] **Step 4:** Run `npx vitest run test/oddsSnapshots.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(scheduler): snapshot carrega mark/origem (manual default)`

## Task 3: jobs.ts — extrair runForwardLog/runSettle

**Files:** Create `src/scheduler/jobs.ts` · Modify `src/cli/forwardLog.ts`, `src/cli/settle.ts` · Test `test/schedulerJobs.test.ts`

- [ ] **Step 1: Test (com fakes)**

```ts
import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";
import { runForwardLog, runSettle } from "../src/scheduler/jobs.js";

// fake StatsProvider/client mínimos: forwardLog usa client.events + client.getEvent + runMatch(sp).
// Como runMatch é real, o teste usa um client que devolve 1 evento simples e checa que loga linhas.
```
Testar `runSettle`: ledger com 1 linha pendente + client que devolve placar/player-stats → `settleResult` chamado; retorna `{ liquidadas }`. (Reusa os fakes já usados em `test/settle.test.ts`.)

- [ ] **Step 2:** Run → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** `src/scheduler/jobs.ts`

`runForwardLog(client, repo, sp, ids?)`: move o corpo do `forwardLog.ts` (targetIds → loop runMatch gols/vitória → saveLedger), retorna `{ logged, jogos }`. `runSettle(client, repo, ids?)`: move o corpo do `settle.ts` (resolve ids pendentes → player-stats + placar → settleResult), retorna `{ liquidadas_player, liquidadas_partida }`. CLIs passam a importar e chamar essas funções + `console.log` do resumo.

- [ ] **Step 4:** Run `npx vitest run test/schedulerJobs.test.ts` → PASS. Rodar `npx tsx src/cli/settle.ts` mentalmente coberto pelos testes existentes de settle (não quebrar).
- [ ] **Step 5:** commit `refactor(scheduler): forwardLog/settle viram lib reusável (CLIs = cascas)`

## Task 4: plan.ts (PURO) — descoberta + agenda de marcos

**Files:** Create `src/scheduler/plan.ts` · Test `test/schedulerPlan.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { upcomingGames, computeSchedule, SCHED } from "../src/scheduler/plan.js";

const H = 3600_000, M = 60_000;
const ev = (id: string, home: string, away: string, dateISO: string) =>
  ({ id, home_team: home, away_team: away, event_date: dateISO, league_id: 27 });

describe("upcomingGames", () => {
  const now = new Date("2026-06-22T08:00:00Z");
  it("mantém Copa no horizonte, tira placeholder e fora-de-janela", () => {
    const evs = [
      ev("1", "Argentina", "Áustria", "2026-06-22T14:00:00Z"),  // dentro
      ev("2", "1K", "2J", "2026-06-22T18:00:00Z"),               // placeholder
      ev("3", "Brasil", "Sérvia", "2026-06-25T14:00:00Z"),       // fora do horizonte (30h)
    ];
    const g = upcomingGames(evs, now, 30, [27]);
    expect(g.map((x) => x.event_id)).toEqual(["1"]);
    expect(g[0]!.kickoff).toBe("2026-06-22T14:00:00Z");
  });
});

describe("computeSchedule (marcos por jogo)", () => {
  it("jogo a 6h+ gera base/deriva/lineup_watch/closing nos offsets certos", () => {
    const now = new Date("2026-06-22T06:00:00Z").getTime();           // K-8h
    const kickoff = "2026-06-22T14:00:00Z";
    const jobs = computeSchedule([{ event_id: "1", jogo: "Argentina x Áustria", kickoff }], now, SCHED);
    const byMark = Object.fromEntries(jobs.map((j) => [j.mark ?? j.job_type, j.fireAt]));
    const K = new Date(kickoff).getTime();
    expect(byMark["base"]).toBe(K - 6 * H);
    expect(byMark["deriva"]).toBe(K - 3 * H);
    expect(byMark["lineup_watch"]).toBe(K - 90 * M);
    expect(byMark["fechamento"]).toBe(K - 3 * M);
  });
  it("pula marcos já passados (jogo descoberto perto do kickoff)", () => {
    const kickoff = "2026-06-22T14:00:00Z";
    const now = new Date("2026-06-22T13:00:00Z").getTime();          // K-1h: base/deriva passaram
    const jobs = computeSchedule([{ event_id: "1", jogo: "A x B", kickoff }], now, SCHED);
    const marks = jobs.map((j) => j.mark ?? j.job_type);
    expect(marks).not.toContain("base");
    expect(marks).not.toContain("deriva");
    expect(marks).toContain("lineup_watch"); // janela ainda não acabou (até K-15min)
    expect(marks).toContain("fechamento");
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar** `src/scheduler/plan.ts`

```ts
// Núcleo PURO do agendador: descobre jogos elegíveis e calcula a agenda de marcos
// (horário absoluto de disparo) por jogo. Sem I/O, sem timers — só datas e filtros.
const H = 3600_000, M = 60_000;

export interface Game { event_id: string; jogo: string; kickoff: string; }
export type JobType = "collect" | "lineup_watch";
export interface Job { event_id: string; jogo: string; job_type: JobType; mark: string | null; fireAt: number; kickoff: string; }

export interface ScheduleConfig {
  baseOffsetH: number; derivaOffsetH: number;
  lineupStartMin: number; lineupEndMin: number; lineupPollMin: number;
  closingOffsetMin: number;
}
export const SCHED: ScheduleConfig = {
  baseOffsetH: 6, derivaOffsetH: 3,
  lineupStartMin: 90, lineupEndMin: 15, lineupPollMin: 10,
  closingOffsetMin: 3,
};

function isPlaceholder(name: unknown): boolean {
  const s = String(name ?? "").trim();
  if (!s) return true;
  if (s.includes("/")) return true;
  return /^([WL]\d+|\d[A-Za-z]|[A-Za-z]\d)$/.test(s);
}

export function upcomingGames(events: any[], now: Date, horizonH: number, leagueIds: number[]): Game[] {
  const t0 = now.getTime(), t1 = t0 + horizonH * H;
  const out: Game[] = [];
  for (const e of events ?? []) {
    const lg = Number(e.league_id);
    if (leagueIds.length && !leagueIds.includes(lg)) continue;
    if (isPlaceholder(e.home_team) || isPlaceholder(e.away_team)) continue;
    const k = e.event_date ?? e.date ?? e.start_time ?? "";
    const t = Date.parse(k);
    if (!Number.isFinite(t) || t < t0 || t > t1) continue;
    out.push({ event_id: String(e.id), jogo: `${e.home_team} x ${e.away_team}`, kickoff: new Date(t).toISOString() });
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

export function computeSchedule(games: Game[], now: number, cfg: ScheduleConfig): Job[] {
  const jobs: Job[] = [];
  for (const g of games) {
    const K = new Date(g.kickoff).getTime();
    const mk = (mark: string, fireAt: number, job_type: JobType = "collect") => {
      if (fireAt <= now) return;          // marco passado → pula
      jobs.push({ event_id: g.event_id, jogo: g.jogo, job_type, mark, fireAt, kickoff: g.kickoff });
    };
    mk("base", K - cfg.baseOffsetH * H);
    mk("deriva", K - cfg.derivaOffsetH * H);
    // lineup_watch: agenda no início da janela SE a janela ainda não acabou
    if (K - cfg.lineupEndMin * M > now) {
      const start = Math.max(K - cfg.lineupStartMin * M, now + 1);
      jobs.push({ event_id: g.event_id, jogo: g.jogo, job_type: "lineup_watch", mark: "lineup_watch", fireAt: start, kickoff: g.kickoff });
    }
    mk("fechamento", K - cfg.closingOffsetMin * M);
  }
  return jobs.sort((a, b) => a.fireAt - b.fireAt);
}
```

- [ ] **Step 4:** Run `npx vitest run test/schedulerPlan.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(scheduler): plan.ts puro (upcomingGames + computeSchedule)`

## Task 5: lineupWatch.ts (PURO) — detector do salto

**Files:** Create `src/scheduler/lineupWatch.ts` · Test `test/lineupWatch.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { detectFlip } from "../src/scheduler/lineupWatch.js";

describe("detectFlip (salto da escalação)", () => {
  it("predicted → confirmed = salto", () => expect(detectFlip("predicted", "confirmed")).toBe(true));
  it("unknown → confirmed = salto", () => expect(detectFlip("unknown", "confirmed")).toBe(true));
  it("confirmed → confirmed = não (já capturado)", () => expect(detectFlip("confirmed", "confirmed")).toBe(false));
  it("predicted → predicted = não", () => expect(detectFlip("predicted", "predicted")).toBe(false));
  it("null prev → confirmed = salto", () => expect(detectFlip(null, "confirmed")).toBe(true));
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar**

```ts
// PURO: a escalação confirmou AGORA? (era != confirmed e virou confirmed). Esse é o
// instante do salto da linha — onde 1 coleta captura o CLV mais valioso.
export function detectFlip(prev: string | null | undefined, curr: string): boolean {
  return curr === "confirmed" && prev !== "confirmed";
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** commit `feat(scheduler): lineupWatch.detectFlip (salto da escalação)`

## Task 6: runner.ts (ADAPTER) — o daemon

**Files:** Create `src/scheduler/runner.ts` · Test `test/schedulerRunner.test.ts`

Contrato das deps injetadas:
```ts
export interface RunnerDeps {
  discover: () => Promise<import("./plan.js").Game[]>;
  collect: (eventId: string, mark: string) => Promise<{ retratos: number; lineup_status: string }>;
  lineupStatus: (eventId: string) => Promise<string>;
  forwardLog: () => Promise<any>;
  settle: () => Promise<any>;
  logRun: (row: import("../store/repo.js").SchedulerRunRow) => Promise<void> | void;
  recentRuns: () => Promise<import("../store/repo.js").SchedulerRunRow[]> | import("../store/repo.js").SchedulerRunRow[];
  now: () => number;
  cfg?: Partial<import("./plan.js").ScheduleConfig>;
}
```

- [ ] **Step 1: Tests (fake timers + fakes)**

Casos:
1. `start()` chama `discover` e agenda os jobs; ao avançar o relógio até `base`, chama `collect(id,"base")` e grava run `ok`.
2. **Fila serializada:** dois jobs `collect` no mesmo instante não rodam concorrentes — 2º só começa quando o 1º resolve (instrumentar com contador de "em voo" máx=1).
3. **Dedup restart-safe:** se `recentRuns` já tem `{event_id,mark:"base",status:"ok"}`, o job `base` é pulado (status `pulado` ou nem chama collect).
4. **Erro isolado:** `collect` que lança → grava run `erro` e o daemon segue (próximo job ainda roda).
5. **lineup_watch:** ao disparar, faz poll; quando `lineupStatus` retorna `confirmed`, chama `collect(id,"salto")` e para o poll.

Esqueleto (vitest fake timers):
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SchedulerRunner } from "../src/scheduler/runner.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
// ... montar deps fake, runner.start(), vi.advanceTimersByTimeAsync(...), assert.
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar** `src/scheduler/runner.ts`

Pontos-chave:
- `start()`: roda `tick()` (discover+schedule) já, depois `setInterval` p/ re-discover (1h), forwardLog (6h), settle (1h). Guarda timers p/ `stop()`.
- `schedule(jobs)`: p/ cada job com `key = event|mark` ainda não agendado nesta sessão (`Set`), `setTimeout(fire, fireAt-now())`.
- `fire(job)`: se `collect`/`fechamento`/etc → `enqueueCollect(() => runCollect(job))`; se `lineup_watch` → `startWatch(job)`.
- `runCollect(job)`: dedup via `recentRuns()` (já tem ok p/ event+mark? → logRun `pulado`, return); senão `collect` + logRun `ok {retratos}`; catch → logRun `erro {erro}`.
- `enqueueCollect(fn)`: `this.q = this.q.then(fn).catch(()=>{})` (cadeia = 1 por vez).
- `startWatch(job)`: `setInterval` a cada `lineupPollMin`; cada tick `lineupStatus(id)`; `detectFlip(prev,curr)` → `enqueueCollect(collect(id,"salto"))` + para; também para em `now() >= K - lineupEndMin`.
- `status()`: `{ scheduled: [...jobs futuros], runs: await recentRuns() }`.
- Todo job grava `logRun`; erros nunca propagam (try/catch em tudo).

- [ ] **Step 4:** Run `npx vitest run test/schedulerRunner.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(scheduler): runner (fila serializada, dedup, watch, erro isolado)`

## Task 7: status service + endpoint + wiring no server

**Files:** Modify `src/service.ts`, `src/api/app.ts`, `src/api/server.ts` · Test `test/schedulerStatus.test.ts`

- [ ] **Step 1: Test (endpoint devolve status)**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/api/app.js";
import { InMemoryRepo } from "../src/store/repo.js";

it("GET /scheduler/status devolve jogos agendados + últimas execuções", async () => {
  const repo = new InMemoryRepo();
  repo.appendSchedulerRun({ job_type: "discover", status: "ok", criado_em: "2026-06-22T08:00:00Z" });
  const runner = { status: () => ({ scheduled: [{ event_id: "1", jogo: "A x B", mark: "base", fireAt: 1 }], runs: repo.getRecentSchedulerRuns() }) };
  const app = createApp({ client: {} as any, repo, scheduler: runner as any });
  const r = await request(app).get("/scheduler/status");
  expect(r.status).toBe(200);
  expect(r.body.scheduled[0].jogo).toBe("A x B");
  expect(r.body.runs[0].job_type).toBe("discover");
});
it("GET /scheduler/status sem daemon devolve desligado", async () => {
  const app = createApp({ client: {} as any, repo: new InMemoryRepo() });
  const r = await request(app).get("/scheduler/status");
  expect(r.body.enabled).toBe(false);
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implementar**
- `Deps` em `app.ts` ganha `scheduler?: { status: () => any }`. Rota:
```ts
app.get("/scheduler/status", wrap(async (_req, res) => {
  if (!deps.scheduler) { res.json({ enabled: false, scheduled: [], runs: await deps.repo.getRecentSchedulerRuns?.(20) ?? [] }); return; }
  res.json({ enabled: true, ...deps.scheduler.status() });
}));
```
- `server.ts`: porta default `5926`; se `process.env["SCHEDULER_ENABLED"] !== "false"`, montar `SchedulerRunner` com deps reais e `runner.start()`; passar `scheduler: runner` no `createApp`. Deps reais:
  - `discover`: `listMatches(client, 27, "notstarted")` → mapear p/ `Game` (ou `upcomingGames(await client.events(...), new Date(), horizonH, [27])`).
  - `collect`: `makeFetchers()` → `coletarOddsService(client, repo, id, fetchers, { snapshotOrigem:"scheduler", snapshotMark: mark, log })` → `fetchers.close()`; devolve `{retratos, lineup_status}`.
  - `lineupStatus`: `lineupStatusFromLineups(await client.lineups(id))`.
  - `forwardLog`: `runForwardLog(client, repo, new BSDStatsProvider(client))`.
  - `settle`: `runSettle(client, repo)`.
  - `logRun`: `repo.appendSchedulerRun({...row, criado_em: new Date().toISOString()})`.
  - `recentRuns`: `repo.getRecentSchedulerRuns(200)`.
  - `now`: `Date.now`.

- [ ] **Step 4:** Run `npx vitest run test/schedulerStatus.test.ts` → PASS. Rodar suíte inteira `npm test` → tudo verde + gate de paridade.
- [ ] **Step 5:** commit `feat(scheduler): GET /scheduler/status + daemon no server (flag SCHEDULER_ENABLED)`

## Task 8: Portas — backend 5926, front 5927

**Files:** Modify `src/api/server.ts`, `odd-analyzer-frontend/package.json`, `odd-analyzer-frontend/lib/api.ts`, `CLAUDE.md`, `docs/CORE.md`, `docs/coleta-odds/IMPLEMENTAR-CASA.md`

- [ ] **Step 1:** `server.ts`: `const port = Number(process.env["PORT"] ?? 5926);` (já tocado na Task 7 — confirmar).
- [ ] **Step 2:** front `package.json`: `"dev": "next dev -p 5927"`.
- [ ] **Step 3:** front `lib/api.ts`: `const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5926";`
- [ ] **Step 4:** trocar refs `3001`→`5926` e `3000`→`5927` em `CLAUDE.md`, `docs/CORE.md`, `docs/coleta-odds/IMPLEMENTAR-CASA.md`.
- [ ] **Step 5:** commit `chore(ports): backend 5926 / front 5927 (fora das pistas genéricas)`

## Task 9: Front — painel do Agendador

**Files:** Create `app/agendador/page.tsx`, `components/SchedulerPanel.tsx` · Modify `lib/types.ts`, `lib/api.ts`, `app/layout.tsx` · Test `lib/scheduler.test.ts`

- [ ] **Step 1: Test (helper de status leigo)** `lib/scheduler.ts`
```ts
import { describe, it, expect } from "vitest";
import { statusTone, jobLabel } from "./scheduler";
describe("scheduler helpers", () => {
  it("statusTone mapeia ok/erro/pulado", () => {
    expect(statusTone("ok")).toBe("text-value");
    expect(statusTone("erro")).toBe("text-bad");
    expect(statusTone("pulado")).toBe("text-faint");
  });
  it("jobLabel traduz marco pro leigo", () => {
    expect(jobLabel("collect", "base")).toBe("coleta · abertura");
    expect(jobLabel("collect", "fechamento")).toBe("coleta · fechamento");
    expect(jobLabel("lineup_watch", "lineup_watch")).toBe("vigília da escalação");
    expect(jobLabel("settle", null)).toBe("liquidação");
  });
});
```
- [ ] **Step 2:** Run `npx vitest run lib/scheduler.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `lib/scheduler.ts` (statusTone, jobLabel com mapa de marcos), tipos em `lib/types.ts` (`SchedulerStatus`, `SchedulerRun`, `ScheduledJob`), `getSchedulerStatus` em `lib/api.ts` (`req<SchedulerStatus>("/scheduler/status")`), `components/SchedulerPanel.tsx` (useEffect → getSchedulerStatus a cada 30s; lista jogos agendados + últimas execuções, verde/vermelho), `app/agendador/page.tsx` (renderiza o painel), link "agendador" no header de `app/layout.tsx`.
- [ ] **Step 4:** Run `npx vitest run lib/scheduler.test.ts` → PASS; `npm test` (front) verde.
- [ ] **Step 5:** commit (front) `feat(scheduler): painel do Agendador 24h (status só-leitura)`

## Task 10: Docs — CORE §3/§4 + runbook + apaga rascunho

**Files:** Modify `docs/CORE.md`, `docs/features/forward-loop-copa/README.md`, `CLAUDE.md`

- [ ] **Step 1:** CORE §3 (features que existem): adicionar "Agendador 24h" (o que faz, marcos, $0, scheduler_runs). CORE §4: marcar o loop como automatizado.
- [ ] **Step 2:** runbook §Automação: substituir "idealmente um cron" por "o agendador in-process roda; ver `src/scheduler/`".
- [ ] **Step 3:** CLAUDE.md: nota do agendador + portas.
- [ ] **Step 4:** commit `docs: agendador 24h no CORE/runbook + portas no CLAUDE`

---

## Self-Review

- **Cobertura da spec:** arquitetura (T4/5/6), marcos (T4), mark/origem (T1/2), scheduler_runs (T1), refactor jobs (T3), status+wiring+flag (T7), portas (T8), front (T9), docs (T10), fora-de-escopo respeitado (sem auto-IA, sem CLV de partida BSD). ✔
- **Placeholders:** nenhum — código real nos passos puros; contratos explícitos nos de IO. ✔
- **Consistência de tipos:** `Game`/`Job`/`ScheduleConfig`/`SCHED` (plan.ts) usados igual em runner; `SchedulerRunRow` (repo) usado em logRun/recentRuns/endpoint; `detectFlip(prev,curr)`. ✔
- **Gate de paridade:** nenhuma task toca `model/`/`value/` → intacto; `npm test` na T7 confirma. ✔
