import { describe, it, expect } from "vitest";
import { BSDStatsProvider } from "../src/providers/stats.js";
import { MARKETS } from "../src/model/markets.js";

// Client fake: 3 jogos do jogador; sem stats de adversário (oppConceded -> null).
function fakeClient() {
  return {
    async playerStats() {
      return { results: [ // total_shots = base do modelo (sot por decomposição); shots_on_target = numerador
        { shots_on_target: 2, total_shots: 4, minutes_played: 90, team_id: "T1" },
        { shots_on_target: 0, total_shots: 3, minutes_played: 90, team_id: "T1" },
        { shots_on_target: 1, total_shots: 2, minutes_played: 90, team_id: "T1" },
      ] };
    },
    async events() { return { results: [] }; },
    async eventStats() { return { stats: {} }; },
  };
}

describe("entityRate trace", () => {
  it("anexa um rateTrace com mu igual ao mu retornado", async () => {
    const sp = new BSDStatsProvider(fakeClient());
    const ctx = { is_home: false, league_avg_conceded: 4.55, entity_team_id: "T1",
      opp_team_id: "T2", xi_team_ids: new Set<string>(), escopo_historico: "todos" };
    const rate = await sp.entityRate("p1", MARKETS.sot!, ctx);
    expect(rate).not.toBeNull();
    expect(rate!.trace).toBeDefined();
    expect(rate!.trace!.mu).toBeCloseTo(rate!.mu, 6);
    expect(rate!.trace!.statField).toBe("total_shots"); // base da decomposição do sot
    expect(rate!.trace!.passos[0]!.passo).toBe("taxa_base");
  });
});
