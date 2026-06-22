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

  it("hasSchedulerRun: dedup direcionado (não depende da janela recente)", async () => {
    const repo = new InMemoryRepo();
    repo.appendSchedulerRun({ event_id: "e1", job_type: "collect", mark: "base", status: "ok", criado_em: "2026-06-01T00:00:00Z" });
    repo.appendSchedulerRun({ event_id: "e1", job_type: "collect", mark: "deriva", status: "erro", criado_em: "2026-06-01T00:00:00Z" });
    expect(await repo.hasSchedulerRun("e1", "base", "collect", "ok")).toBe(true);
    expect(await repo.hasSchedulerRun("e1", "deriva", "collect", "ok")).toBe(false); // só 'erro' → não conta
    expect(await repo.hasSchedulerRun("e1", "fechamento", "collect", "ok")).toBe(false);
    expect(await repo.hasSchedulerRun("e2", "base", "collect", "ok")).toBe(false);
  });
});
