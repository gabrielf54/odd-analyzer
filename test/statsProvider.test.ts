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

describe("entityRate — decomposição do desarme (μ_ganhos = tentativas × aproveitamento)", () => {
  function fakeClientDesarme(): any {
    // 12 jogos: 4 tentados, 2 ganhos (aproveitamento bruto 0.5) — histórico do jogador.
    const games = Array.from({ length: 12 }, () => ({
      total_tackle: 4, won_tackle: 2, minutes_played: 90, event_id: "h", team_id: "100",
    }));
    return {
      async playerStats() { return { results: games }; },
      async events() { return { results: [] }; },   // sem concessão → oppMult neutro
      async eventStats() { return { stats: {} }; },
      async player() { return { position: "M" }; },
    };
  }

  it("μ de ganhos = μ de tentativas × aproveitamento (< tentativas) e o trace mostra o passo", async () => {
    const { MARKETS } = await import("../src/model/markets.js");
    const p = new BSDStatsProvider(fakeClientDesarme());
    const rate = await p.entityRate("1", MARKETS.desarmes!, {
      is_home: true, opp_team_id: "200", league_avg_conceded: 13.97, escopo_historico: "todos",
    });
    expect(rate).not.toBeNull();
    const passos = (rate!.trace as any).passos as any[];
    const tent = passos.find((s) => s.passo === "esperado_tentativas");
    const aprov = passos.find((s) => s.passo === "aproveitamento");
    expect(tent).toBeDefined();
    expect(aprov).toBeDefined();
    // ganho < tentativa (aproveitamento < 1) e μ final bate com o passo de ganhos
    expect(aprov.saida).toBeLessThan(tent.saida);
    expect(rate!.mu).toBeCloseTo(aprov.saida, 2);
    // aproveitamento encolhido p/ 0.622: (24 + 40×0.622)/(48+40) ≈ 0.555
    expect(rate!.mu / tent.saida).toBeCloseTo(0.555, 2);
  });
});
