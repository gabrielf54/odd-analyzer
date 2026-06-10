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

function fakePositionalClient() {
  // 5 jogos do adversário 200; em cada, o time 300 (contra) fez:
  // jogador 31 (M): 6 desarmes · jogador 32 (D): 2 · jogador 33 (F): 1.
  const evs = [1, 2, 3, 4, 5].map((i) => ({ id: i, home_team_id: "200", away_team_id: "300" }));
  return {
    events: async (f: any) => {
      if (String(f.team_id) === "200") return { results: evs };
      return { results: [{ id: 90, home_team_id: "100", away_team_id: "200" }] };
    },
    eventStats: async (_id: any) => ({ stats: { home: { total_tackles: 9 }, away: { total_tackles: 9 } } }),
    eventPlayerStats: async (_id: any) => ({
      player_stats: [
        { player_id: 31, team_id: "300", total_tackle: 6 },
        { player_id: 32, team_id: "300", total_tackle: 2 },
        { player_id: 33, team_id: "300", total_tackle: 1 },
        { player_id: 41, team_id: "200", total_tackle: 3 },
      ],
    }),
    player: async (pid: any) =>
      ({ 31: { position: "M" }, 32: { position: "D" }, 33: { position: "F" } } as any)[pid] ?? { position: "?" },
    playerStats: async (_pid: any) => ({
      results: Array.from({ length: 12 }, (_, i) => ({
        event_id: i, team_id: "100", total_tackle: 3, minutes_played: 90,
      })),
    }),
    lineups: async (_id: any) => ({ lineups: {} }),
  };
}

describe("tilt posicional no entityRate", () => {
  const ctx = {
    event: { id: 90 }, entity_team_id: "100", is_home: true,
    opp_team_id: "200", league_avg_conceded: 13.97, xi_team_ids: new Set<string>(),
    escopo_historico: "todos", posicao: "M",
  };

  it("aplica tilt quando habilitado e adversário concede mais à posição", async () => {
    const on = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: true });
    const off = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: false });
    const rOn = await on.entityRate("p1", MARKETS["desarmes"]!, ctx);
    const rOff = await off.entityRate("p1", MARKETS["desarmes"]!, ctx);
    // share_adv M = 6/9 = 0.667 > share_base M (0.491) → tilt clampa em 1.20 → mu maior
    expect(rOn!.mu).toBeGreaterThan(rOff!.mu);
    expect(rOn!.concedido_posicao).toMatch(/meio-campistas/);
    expect(rOff!.concedido_posicao ?? null).toBeNull();
  });

  it("fail-closed: sem posicao no ctx, tilt neutro (mu igual ao atual)", async () => {
    const on = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: true });
    const off = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: false });
    const noPos = { ...ctx, posicao: undefined };
    expect((await on.entityRate("p1", MARKETS["desarmes"]!, noPos))!.mu)
      .toBeCloseTo((await off.entityRate("p1", MARKETS["desarmes"]!, noPos))!.mu, 12);
  });

  it("denominador do share ignora posições fora de D/M/F (G não dilui)", async () => {
    // Constrói um fake LOCAL com linha extra de goleiro (pid 34, posição G, 9 desarmes).
    // OLD code: total += v fora do if → total = 6+2+1+9 = 18, shareAdv M = 6/18 ≈ 0.333 → tilt < 1.
    // FIXED code: total += v só para D/M/F → total = 6+2+1 = 9, shareAdv M = 6/9 ≈ 0.667 → tilt ≥ 1.
    function makeClientWithGK() {
      const evs = [1, 2, 3, 4, 5].map((i) => ({ id: i, home_team_id: "200", away_team_id: "300" }));
      return {
        events: async (f: any) => {
          if (String(f.team_id) === "200") return { results: evs };
          return { results: [{ id: 90, home_team_id: "100", away_team_id: "200" }] };
        },
        eventStats: async (_id: any) => ({ stats: { home: { total_tackles: 9 }, away: { total_tackles: 9 } } }),
        eventPlayerStats: async (_id: any) => ({
          player_stats: [
            { player_id: 31, team_id: "300", total_tackle: 6 },
            { player_id: 32, team_id: "300", total_tackle: 2 },
            { player_id: 33, team_id: "300", total_tackle: 1 },
            { player_id: 34, team_id: "300", total_tackle: 9 }, // goalkeeper — must NOT dilute
            { player_id: 41, team_id: "200", total_tackle: 3 },
          ],
        }),
        player: async (pid: any) =>
          ({ 31: { position: "M" }, 32: { position: "D" }, 33: { position: "F" }, 34: { position: "G" } } as any)[pid] ?? { position: "?" },
        playerStats: async (_pid: any) => ({
          results: Array.from({ length: 12 }, (_, i) => ({
            event_id: i, team_id: "100", total_tackle: 3, minutes_played: 90,
          })),
        }),
        lineups: async (_id: any) => ({ lineups: {} }),
      };
    }
    const on  = new BSDStatsProvider(makeClientWithGK(), { positionalTilt: true });
    const off = new BSDStatsProvider(makeClientWithGK(), { positionalTilt: false });
    const rOn  = await on.entityRate("p1",  MARKETS["desarmes"]!, ctx);
    const rOff = await off.entityRate("p1", MARKETS["desarmes"]!, ctx);
    // Fixed code: shareAdv M = 6/9 = 0.667 > shareBase M → tilt > 1 → mu(on) > mu(off)
    expect(rOn!.mu).toBeGreaterThan(rOff!.mu);
  });

  it("fail-closed: menos de POSITIONAL_MIN_GAMES jogos com player-stats → neutro", async () => {
    const c = fakePositionalClient();
    c.events = async (f: any) =>
      String(f.team_id) === "200"
        ? { results: [{ id: 1, home_team_id: "200", away_team_id: "300" }] }
        : { results: [{ id: 90, home_team_id: "100", away_team_id: "200" }] };
    const on = new BSDStatsProvider(c, { positionalTilt: true });
    const off = new BSDStatsProvider(c, { positionalTilt: false });
    expect((await on.entityRate("p1", MARKETS["desarmes"]!, ctx))!.mu)
      .toBeCloseTo((await off.entityRate("p1", MARKETS["desarmes"]!, ctx))!.mu, 12);
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
