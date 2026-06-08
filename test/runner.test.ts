import { describe, it, expect } from "vitest";
import { normalizeEvent, runAnalyze } from "../src/runner.js";
import { ManualOdds } from "../src/providers/odds.js";
import { InMemoryRepo } from "../src/store/repo.js";

describe("normalizeEvent", () => {
  it("flat → aninhado", () => {
    const e = normalizeEvent({ id: 5, home_team: "A", away_team: "B", home_team_id: 10, away_team_id: 20, league_id: 9 });
    expect(e).toMatchObject({ id: "5", jogo: "A x B", home_team: { id: "10", name: "A" }, away_team: { id: "20", name: "B" }, league_id: 9 });
  });
});

describe("runAnalyze", () => {
  it("mercado desconhecido lança", async () => {
    await expect(runAnalyze({}, "ev1", "xyz", null)).rejects.toThrow(/mercado desconhecido/);
  });

  it("roda um mercado de jogador com client fake (player_ref)", async () => {
    const client = {
      async getEvent() { return { id: "ev1", home_team: "A", away_team: "B", home_team_id: "H", away_team_id: "Aw", league_id: 9 }; },
      async lineups() { return { lineup_status: "confirmed", lineups: { home: { team_id: "H", confirmed: true, players: [{ id: 1, name: "Kaiki", position: "DF" }] }, away: { team_id: "Aw", players: [] } } }; },
      async events() { return { results: [{ id: "e", home_team_id: "Aw", away_team_id: "Z" }] }; },
      async eventPlayerStats() { return { player_stats: [{ player_id: 1, team_id: "H" }] }; },
      async player() { return { name: "Kaiki" }; },
      async playerStats() { return { results: [{ shots_on_target: 2, minutes_played: 90, team_id: "H" }, { shots_on_target: 3, minutes_played: 90, team_id: "H" }] }; },
      async eventStats() { return { stats: { home: { shots_on_target: 5 }, away: { shots_on_target: 4 } } }; },
    };
    const repo = new InMemoryRepo();
    const odds = new ManualOdds([{ entidade: "partida", linha: 0.5, odd_over: 1.8, odd_under: 2.0, book: "m" }]);
    const out = await runAnalyze(client, "ev1", "sot", "Kaiki", { repo, oddsProvider: odds });
    expect(out).toHaveProperty("candidatos");
    expect(out).toHaveProperty("ia");
  });
});
