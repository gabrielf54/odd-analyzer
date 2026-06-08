import { describe, it, expect } from "vitest";
import { BSDStatsProvider, OnlyPlayer } from "../src/providers/stats.js";
import { MARKETS } from "../src/model/markets.js";

// Client fake com fixtures mínimas.
function makeClient(): any {
  return {
    async lineups() {
      return {
        lineup_status: "confirmed",
        lineups: {
          home: { team_id: "H", confirmed: true, players: [{ id: 1, name: "Kaiki", position: "DF" }] },
          away: { team_id: "A", confirmed: true, players: [{ id: 2, name: "Joao", position: "MF" }] },
        },
      };
    },
    async playerStats() {
      return { results: [ // recente-primeiro
        { shots_on_target: 2, minutes_played: 90, team_id: "H" },
        { shots_on_target: 1, minutes_played: 90, team_id: "H" },
        { shots_on_target: 3, minutes_played: 80, team_id: "H" },
      ] };
    },
    async events() {
      return { results: [
        { id: "e1", home_team_id: "A", away_team_id: "X", home_score: 1, away_score: 2 },
        { id: "e2", home_team_id: "Y", away_team_id: "A", home_score: 0, away_score: 1 },
      ] };
    },
    async eventStats() {
      return { stats: { home: { shots_on_target: 5, corner_kicks: 6 }, away: { shots_on_target: 4, corner_kicks: 5 } } };
    },
  };
}

const evento = { id: "ev1", home_team: { id: "H", name: "Home FC" }, away_team: { id: "A", name: "Away FC" } };

describe("BSDStatsProvider", () => {
  it("elenco extrai titulares dos dois lados normalizados", async () => {
    const p = new BSDStatsProvider(makeClient());
    const el = await p.squad(evento);
    expect(el).toHaveLength(2);
    expect(el[0]).toEqual({ id: "1", name: "Kaiki", team_id: "H", posicao: "DF" });
  });

  it("entity_taxa devolve mu>0 e campos esperados", async () => {
    const p = new BSDStatsProvider(makeClient());
    const ctx = { event: evento, is_home: true, opp_team_id: "A", league_avg_conceded: 4.55, entity_team_id: "H" };
    const t = await p.entityRate(1, MARKETS["sot"]!, ctx);
    expect(t).not.toBeNull();
    expect(t!.mu).toBeGreaterThan(0);
    expect(t!.amostra_jogos).toBe(3);
    expect(["alta", "media", "baixa"]).toContain(t!.incerteza);
  });

  it("entity_taxa: sem histórico → null", async () => {
    const client = makeClient();
    client.playerStats = async () => ({ results: [] });
    const p = new BSDStatsProvider(client);
    const ctx = { event: evento, is_home: true, opp_team_id: "A", league_avg_conceded: 4.55, entity_team_id: "H" };
    expect(await p.entityRate(1, MARKETS["sot"]!, ctx)).toBeNull();
  });

  it("team_taxa agrega corner_kicks via eventStats", async () => {
    const p = new BSDStatsProvider(makeClient());
    const ctx = { event: evento, is_home: false, opp_team_id: "H" };
    const t = await p.teamRate("A", MARKETS["escanteios"]!, ctx);
    expect(t).not.toBeNull();
    expect(t!.mu).toBeGreaterThan(0);
  });

  it("team_rates devolve lambda_for/against", async () => {
    const p = new BSDStatsProvider(makeClient());
    const r = await p.teamRates("A", {});
    expect(r).not.toBeNull();
    expect(r!.lambda_for).toBeGreaterThan(0);
  });
});

describe("OnlyPlayer", () => {
  it("filtra elenco ao ref por substring de nome", async () => {
    const p = new OnlyPlayer(new BSDStatsProvider(makeClient()), "kaiki");
    const el = await p.squad(evento);
    expect(el).toHaveLength(1);
    expect(el[0]!.name).toBe("Kaiki");
  });

  it("ref inexistente lança com lista de disponíveis", async () => {
    const p = new OnlyPlayer(new BSDStatsProvider(makeClient()), "zidane");
    await expect(p.squad(evento)).rejects.toThrow(/não encontrado/);
  });
});
