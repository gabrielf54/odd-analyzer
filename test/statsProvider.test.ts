import { describe, it, expect } from "vitest";
import { BSDStatsProvider } from "../src/providers/stats.js";

function fakeClientConcede(): any {
  return {
    async events({ team_id }: any) {
      // time 200 jogou 2 jogos (ids a,b)
      return team_id === "200"
        ? {
            results: [
              { id: "a", home_team_id: "200", away_team_id: "300" },
              { id: "b", home_team_id: "400", away_team_id: "200" },
            ],
          }
        : { results: [] };
    },
    async eventPlayerStats(id: unknown) {
      // adversários de 200 fizeram won_tackle: jogo a -> 3 (time 300), jogo b -> 5 (time 400)
      if (id === "a")
        return {
          player_stats: [
            { player_id: 1, team_id: "300", won_tackle: 2 },
            { player_id: 2, team_id: "300", won_tackle: 1 },
            { player_id: 9, team_id: "200", won_tackle: 7 }, // do próprio time 200: ignorar
          ],
        };
      if (id === "b")
        return {
          player_stats: [
            { player_id: 3, team_id: "400", won_tackle: 5 },
            { player_id: 9, team_id: "200", won_tackle: 8 },
          ],
        };
      return { player_stats: [] };
    },
    async eventStats() {
      return { stats: {} };
    },
  };
}

describe("teamConceded won_tackle (player-aggregation)", () => {
  it("soma won_tackle dos adversários por jogo (média = (3+5)/2 = 4)", async () => {
    const p = new BSDStatsProvider(fakeClientConcede());
    // @ts-expect-error acesso ao método privado p/ teste
    const v = await p.teamConceded("200", "won_tackle", 10, { byPlayer: true });
    expect(v).toBeCloseTo(4.0, 9);
  });
});
