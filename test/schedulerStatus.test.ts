import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/api/app.js";
import { InMemoryRepo } from "../src/store/repo.js";

describe("GET /scheduler/status", () => {
  it("com daemon: jogos agendados (runner) + últimas execuções (repo)", async () => {
    const repo = new InMemoryRepo();
    repo.appendSchedulerRun({ job_type: "discover", status: "ok", criado_em: "2026-06-22T08:00:00Z" });
    const scheduler = { status: () => ({ scheduled: [{ event_id: "1", jogo: "A x B", job_type: "collect", mark: "base", fireAt: 123, kickoff: "2026-06-22T14:00:00Z" }] }) };
    const app = createApp({ client: {} as any, repo, scheduler });
    const r = await request(app).get("/scheduler/status");
    expect(r.status).toBe(200);
    expect(r.body.enabled).toBe(true);
    expect(r.body.scheduled[0].jogo).toBe("A x B");
    expect(r.body.runs[0].job_type).toBe("discover");
  });

  it("sem daemon: enabled=false, mas ainda devolve runs do repo", async () => {
    const repo = new InMemoryRepo();
    repo.appendSchedulerRun({ job_type: "settle", status: "ok", criado_em: "2026-06-22T09:00:00Z" });
    const app = createApp({ client: {} as any, repo });
    const r = await request(app).get("/scheduler/status");
    expect(r.body.enabled).toBe(false);
    expect(r.body.scheduled).toEqual([]);
    expect(r.body.runs[0].job_type).toBe("settle");
  });
});
