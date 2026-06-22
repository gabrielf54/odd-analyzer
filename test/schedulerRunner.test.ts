import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SchedulerRunner, type RunnerDeps } from "../src/scheduler/runner.js";

const KICKOFF = "2026-06-22T14:00:00Z";

function makeDeps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    discover: vi.fn(async () => []),
    collect: vi.fn(async () => ({ retratos: 5, lineup_status: "predicted" })),
    lineupStatus: vi.fn(async () => "predicted"),
    forwardLog: vi.fn(async () => ({ logged: 0 })),
    settle: vi.fn(async () => ({ liquidadas_player: 0 })),
    logRun: vi.fn(async () => {}),
    recentRuns: vi.fn(async () => []),
    now: () => Date.now(),
    ...over,
  };
}
const logged = (deps: RunnerDeps) => (deps.logRun as any).mock.calls.map((c: any[]) => c[0]);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SchedulerRunner", () => {
  it("agenda e dispara o collect 'base' no horário (K-6h)", async () => {
    vi.setSystemTime(new Date("2026-06-22T06:00:00Z")); // K-8h
    const deps = makeDeps({ discover: vi.fn(async () => [{ event_id: "1", jogo: "A x B", kickoff: KICKOFF }]) });
    const runner = new SchedulerRunner(deps);
    runner.start();
    await vi.advanceTimersByTimeAsync(2 * 3600_000 + 2000); // até base
    const baseCall = (deps.collect as any).mock.calls.find((c: any[]) => c[1] === "base");
    expect(baseCall).toBeTruthy();
    expect(baseCall[0]).toBe("1");
    expect(logged(deps).some((r: any) => r.mark === "base" && r.status === "ok")).toBe(true);
    runner.stop();
  });

  it("fila serializada: 2 coletas no mesmo instante não rodam concorrentes", async () => {
    vi.setSystemTime(new Date("2026-06-22T07:59:00Z")); // 1 min antes do base (08:00)
    let inFlight = 0, maxInFlight = 0;
    const collect = vi.fn(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve(); await Promise.resolve();
      inFlight--; return { retratos: 1, lineup_status: "predicted" };
    });
    const deps = makeDeps({
      discover: vi.fn(async () => [
        { event_id: "1", jogo: "A x B", kickoff: KICKOFF },
        { event_id: "2", jogo: "C x D", kickoff: KICKOFF },
      ]),
      collect,
    });
    const runner = new SchedulerRunner(deps);
    runner.start();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(collect.mock.calls.filter((c: any[]) => c[1] === "base").length).toBe(2);
    expect(maxInFlight).toBe(1);
    runner.stop();
  });

  it("dedup restart-safe: pula marco já coletado OK no histórico", async () => {
    vi.setSystemTime(new Date("2026-06-22T07:59:00Z"));
    const deps = makeDeps({
      discover: vi.fn(async () => [{ event_id: "1", jogo: "A x B", kickoff: KICKOFF }]),
      recentRuns: vi.fn(async () => [{ event_id: "1", mark: "base", job_type: "collect", status: "ok", criado_em: "2026-06-22T07:00:00Z" }]),
    });
    const runner = new SchedulerRunner(deps);
    runner.start();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect((deps.collect as any).mock.calls.find((c: any[]) => c[1] === "base")).toBeFalsy();
    expect(logged(deps).some((r: any) => r.mark === "base" && r.status === "pulado")).toBe(true);
    runner.stop();
  });

  it("erro em 1 coleta não derruba o daemon (a outra roda + run 'erro' gravado)", async () => {
    vi.setSystemTime(new Date("2026-06-22T07:59:00Z"));
    const collect = vi.fn()
      .mockImplementationOnce(async () => { throw new Error("boom"); })
      .mockImplementation(async () => ({ retratos: 2, lineup_status: "predicted" }));
    const deps = makeDeps({
      discover: vi.fn(async () => [
        { event_id: "1", jogo: "A x B", kickoff: KICKOFF },
        { event_id: "2", jogo: "C x D", kickoff: KICKOFF },
      ]),
      collect,
    });
    const runner = new SchedulerRunner(deps);
    runner.start();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(collect.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(logged(deps).some((r: any) => r.status === "erro" && r.job_type === "collect")).toBe(true);
    runner.stop();
  });

  it("lineup_watch: coleta 'salto' quando a escalação vira confirmed", async () => {
    vi.setSystemTime(new Date("2026-06-22T12:29:00Z")); // 1 min antes do watch (K-90min=12:30)
    const lineupStatus = vi.fn()
      .mockResolvedValueOnce("predicted")
      .mockResolvedValue("confirmed");
    const deps = makeDeps({
      discover: vi.fn(async () => [{ event_id: "1", jogo: "A x B", kickoff: KICKOFF }]),
      lineupStatus,
    });
    const runner = new SchedulerRunner(deps);
    runner.start();
    await vi.advanceTimersByTimeAsync(12 * 60_000); // watch (1min) + 1 poll (10min) → confirma
    expect((deps.collect as any).mock.calls.find((c: any[]) => c[1] === "salto")).toBeTruthy();
    runner.stop();
  });

  it("coleta TRAVADA sofre timeout e LIBERA a fila (não empaca 24/7)", async () => {
    vi.setSystemTime(new Date("2026-06-22T07:59:00Z"));
    let secondRan = false;
    const collect = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {})) // trava p/ sempre
      .mockImplementation(async () => { secondRan = true; return { retratos: 1, lineup_status: "predicted" }; });
    const deps = makeDeps({
      discover: vi.fn(async () => [
        { event_id: "1", jogo: "A x B", kickoff: KICKOFF },
        { event_id: "2", jogo: "C x D", kickoff: KICKOFF },
      ]),
      collect,
      collectTimeoutMs: 5_000,
    });
    const runner = new SchedulerRunner(deps);
    runner.start();
    await vi.advanceTimersByTimeAsync(3 * 60_000); // ambas as 'base' disparam; a 1ª trava
    await vi.advanceTimersByTimeAsync(10_000);     // passa do timeout da 1ª
    expect(secondRan).toBe(true); // a fila não travou → a 2ª rodou
    expect(logged(deps).some((r: any) => r.status === "erro" && r.job_type === "collect")).toBe(true);
    runner.stop();
  });

  it("status() devolve jogos agendados (futuros)", async () => {
    vi.setSystemTime(new Date("2026-06-22T06:00:00Z"));
    const deps = makeDeps({ discover: vi.fn(async () => [{ event_id: "1", jogo: "A x B", kickoff: KICKOFF }]) });
    const runner = new SchedulerRunner(deps);
    runner.start();
    await vi.advanceTimersByTimeAsync(100); // deixa o discover agendar
    const st = runner.status();
    expect(st.scheduled.length).toBeGreaterThan(0);
    expect(st.scheduled[0]!.jogo).toBe("A x B");
    runner.stop();
  });
});
