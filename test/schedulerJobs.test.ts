import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";
import { runForwardLog, runSettle } from "../src/scheduler/jobs.js";

describe("runSettle (liquida jogo terminado)", () => {
  it("liquida player prop pendente pelo player-stats (settle_field)", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([{ event_id: "e1", jogador: "Pedri", player_id: "100", linha: 0.5, market_type: "sot", prob_modelo: 0.6 }]);
    const client = {
      eventPlayerStats: async () => ({ player_stats: [{ player_id: 100, name: "Pedri", minutes_played: 90, shots_on_target: 2, total_shots: 4 }] }),
      getEvent: async () => ({ home_score: 1, away_score: 0, home_team: "A", away_team: "B" }),
    };
    const out = await runSettle(client, repo);
    const row = repo.getLedger("e1").find((r) => r.market_type === "sot");
    expect(row.resultado).toBe(1); // 2 SOT > 0.5
    expect(out.liquidadas_player).toBeGreaterThanOrEqual(1);
  });

  it("não liquida jogo sem placar (não finalizado)", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([{ event_id: "e2", jogador: "X", player_id: "1", linha: 0.5, market_type: "sot" }]);
    const client = {
      eventPlayerStats: async () => ({ player_stats: [] }),
      getEvent: async () => ({ home_score: null, away_score: null }),
    };
    const out = await runSettle(client, repo);
    expect(out.liquidadas_player).toBe(0);
    expect(repo.getLedger("e2")[0]!.resultado ?? null).toBe(null);
  });
});

describe("runForwardLog (loga previsões)", () => {
  it("sem jogos na janela → loga 0, não lança", async () => {
    const repo = new InMemoryRepo();
    const client = { events: async () => ({ results: [] }) };
    const out = await runForwardLog(client, repo, {} as any);
    expect(out.logged).toBe(0);
  });
});
