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
      return { results: [ // recente-primeiro; total_shots = base do sot por decomposição
        { shots_on_target: 2, total_shots: 4, minutes_played: 90, team_id: "H" },
        { shots_on_target: 1, total_shots: 3, minutes_played: 90, team_id: "H" },
        { shots_on_target: 3, total_shots: 5, minutes_played: 80, team_id: "H" },
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

  it("sot por DECOMPOSIÇÃO: μ_sot = μ_finalizações × taxa-no-alvo (< μ_finalizações)", async () => {
    const p = new BSDStatsProvider(makeClient());
    const ctx = { event: evento, is_home: true, opp_team_id: "A", entity_team_id: "H" };
    const fin = await p.entityRate(1, MARKETS["finalizacoes"]!, { ...ctx, league_avg_conceded: 13.46 });
    const sot = await p.entityRate(1, MARKETS["sot"]!, { ...ctx, league_avg_conceded: 4.55 });
    expect(sot!.mu).toBeGreaterThan(0);
    // a taxa-no-alvo (<1) encolhe o μ de finalizações → SOT sempre menor
    expect(sot!.mu).toBeLessThan(fin!.mu);
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

describe("stats_detalhadas", () => {
  it("computa médias e casa/fora via mapa de eventos do time", async () => {
    const client: any = {
      playerStats: async () => ({ results: [ // recente-primeiro; won_tackle = settle do desarme (o drawer mostra ganhos)
        { total_tackle: 8, won_tackle: 6, minutes_played: 90, event_id: "e3", team_id: "100" },
        { total_tackle: 6, won_tackle: 4, minutes_played: 90, event_id: "e2", team_id: "100" },
        { total_tackle: 3, won_tackle: 2, minutes_played: 90, event_id: "e1", team_id: "100" },
      ] }),
      events: async (filtros: any) => {
        if (String(filtros.team_id) === "100") {
          return { results: [
            { id: "e3", home_team_id: "100" }, // casa
            { id: "e2", home_team_id: "999" }, // fora
            { id: "e1", home_team_id: "100" }, // casa
          ] };
        }
        return { results: [] }; // adversário (teamConceded) sem dado → neutro
      },
      eventStats: async () => ({ stats: {} }),
    };
    const provider = new BSDStatsProvider(client, { positionalTilt: false });
    const market = MARKETS["desarmes"]!;
    const rate = await provider.entityRate("p1", market, {
      event: { home_team: { id: "100" }, away_team: { id: "200" } },
      entity_team_id: "100", is_home: true, league_avg_conceded: 1.0,
    });
    expect(rate).not.toBeNull();
    const s = rate!.stats_detalhadas!;
    expect(s.media_5).toBeCloseTo(4, 9);          // (2+4+6)/3
    expect(s.ultimos_valores).toEqual([6, 4, 2]); // recente primeiro
    expect(s.media_casa).toBeCloseTo(4, 9);       // e1=2, e3=6
    expect(s.jogos_casa).toBe(2);
    expect(s.media_fora).toBeCloseTo(4, 9);       // e2=4
    expect(s.jogos_fora).toBe(1);
    expect(s.minutos_medios).toBeCloseTo(90, 9);
  });

  it("client.events falhando → split null, resto preenchido (degrada, não quebra)", async () => {
    const client: any = {
      playerStats: async () => ({ results: [
        { total_tackle: 4, won_tackle: 3, minutes_played: 90, event_id: "e1", team_id: "100" },
      ] }),
      events: async () => { throw new Error("rede"); },
      eventStats: async () => ({ stats: {} }),
    };
    const provider = new BSDStatsProvider(client, { positionalTilt: false });
    const rate = await provider.entityRate("p1", MARKETS["desarmes"]!, {
      event: { home_team: { id: "100" }, away_team: { id: "200" } },
      entity_team_id: "100", is_home: true, league_avg_conceded: 1.0,
    });
    const s = rate!.stats_detalhadas!;
    expect(s.media_5).toBeCloseTo(3, 9);
    expect(s.media_casa).toBeNull();
    expect(s.media_fora).toBeNull();
  });
});

describe("posse_adversario (I5: descritivo, fora do money-path)", () => {
  function fakePossessionClient(): any {
    return {
      async playerStats() {
        return { results: [
          { shots_on_target: 2, total_shots: 4, minutes_played: 90, team_id: "H", event_id: "p1" },
          { shots_on_target: 1, total_shots: 3, minutes_played: 90, team_id: "H", event_id: "p2" },
        ] };
      },
      async events({ team_id }: any) {
        // adversário "A" jogou 2 finalizados; "H" (homeAwayMap) sem dado → split null.
        if (String(team_id) === "A") return { results: [
          { id: "oa", home_team_id: "A", away_team_id: "Z" }, // A em casa → lado home
          { id: "ob", home_team_id: "Y", away_team_id: "A" }, // A fora → lado away
        ] };
        return { results: [] };
      },
      async eventStats(id: unknown) {
        if (id === "oa") return { stats: { home: { ball_possession: 60 }, away: { ball_possession: 40 } } };
        if (id === "ob") return { stats: { home: { ball_possession: 50 }, away: { ball_possession: 50 } } };
        return { stats: {} };
      },
    };
  }

  it("média a posse do adversário nos jogos dele (lado próprio): (60+50)/2 = 55", async () => {
    const p = new BSDStatsProvider(fakePossessionClient(), { positionalTilt: false });
    const rate = await p.entityRate("p1", MARKETS["sot"]!, {
      event: { home_team: { id: "H" }, away_team: { id: "A" } },
      entity_team_id: "H", is_home: true, opp_team_id: "A", league_avg_conceded: 4.55, escopo_historico: "todos",
    });
    expect(rate).not.toBeNull();
    expect(rate!.posse_adversario).toBe(55);
    // não contamina o número: mu segue vindo do motor (>0), independente da posse
    expect(rate!.mu).toBeGreaterThan(0);
  });

  it("sem jogos do adversário com stats → posse_adversario null (degrada, não quebra)", async () => {
    const c = fakePossessionClient();
    c.events = async () => ({ results: [] });
    const p = new BSDStatsProvider(c, { positionalTilt: false });
    const rate = await p.entityRate("p1", MARKETS["sot"]!, {
      event: { home_team: { id: "H" }, away_team: { id: "A" } },
      entity_team_id: "H", is_home: true, opp_team_id: "A", league_avg_conceded: 4.55, escopo_historico: "todos",
    });
    expect(rate!.posse_adversario).toBeNull();
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

describe("opp_mode: none (passes — multiplicador de concessão neutralizado)", () => {
  // Mercado fake com opp_mode "none": NÃO deve consultar a concessão do adversário.
  const passesMarket: any = {
    key: "passes", nivel: "jogador", kind: "contagem", stat_field: "total_pass",
    opp_mode: "none", settle_field: "total_pass",
    prior_rate: 30.0, prior_strength: 8.0, nb_dispersion: 20.0, lines: [],
    eixo_concessao: "passes_(posse_dominado)", label: "Passes (Total)",
    concede_baseline: 0, concede_baseline_nacional: 0,
  };
  it("não consulta teamConceded; concedido_adversario null e oppMult efetivo 1.0", async () => {
    // teamConceded p/ total_pass (campo sem TEAM_STAT_FIELD) iria pela rota byPlayer =
    // eventPlayerStats. Se NUNCA for chamado, a concessão do adversário não foi consultada.
    // (teamPossession/homeAwayMap usam eventStats/events — outra rota, descritiva, ok.)
    let concededCalls = 0;
    const client: any = {
      playerStats: async () => ({ results: [
        { total_pass: 60, minutes_played: 90, event_id: "h1", team_id: "100" },
        { total_pass: 50, minutes_played: 90, event_id: "h2", team_id: "100" },
      ] }),
      events: async (f: any) =>
        String(f.team_id) === "100"
          ? { results: [{ id: "h1", home_team_id: "100" }, { id: "h2", home_team_id: "999" }] }
          : { results: [{ id: "o1", home_team_id: "200", away_team_id: "Z" }] },
      eventPlayerStats: async () => { concededCalls++; return { player_stats: [] }; },
      eventStats: async () => ({ stats: { home: { ball_possession: 50 }, away: { ball_possession: 50 } } }),
    };
    const p = new BSDStatsProvider(client, { positionalTilt: false });
    const rate = await p.entityRate("p1", passesMarket, {
      event: { home_team: { id: "100" }, away_team: { id: "200" } },
      entity_team_id: "100", is_home: true, opp_team_id: "200",
      league_avg_conceded: 30, escopo_historico: "todos",
    });
    expect(rate).not.toBeNull();
    expect(rate!.concedido_adversario).toBeNull();
    expect(concededCalls).toBe(0); // teamConceded (byPlayer) nunca tocou o adversário
    // oppMult neutro (1.0): mu = shrunk * haMult (1.08 em casa) — sem desvio de concessão.
    expect(rate!.mu).toBeGreaterThan(0);
  });
});

describe("concede_field (eixo de concessão != stat_field)", () => {
  // Mercado fake: jogador produz "fouls"; concessão soma "was_fouled" dos adversários.
  const faltasMarket: any = {
    key: "faltas", nivel: "jogador", kind: "contagem", stat_field: "fouls",
    prior_rate: 1.0, prior_strength: 12, nb_dispersion: 3.0, lines: [0.5, 1.5],
    eixo_concessao: "faltas_provocadas", label: "Faltas", concede_field: "was_fouled",
    concede_baseline: 10, concede_baseline_nacional: 10,
  };
  function client(): any {
    return {
      playerStats: async () => ({ results: [
        { fouls: 2, was_fouled: 0, minutes_played: 90, event_id: "h1", team_id: "100" },
        { fouls: 1, was_fouled: 1, minutes_played: 90, event_id: "h2", team_id: "100" },
      ] }),
      events: async (f: any) => String(f.team_id) === "200"
        ? { results: [{ id: "o1", home_team_id: "200", away_team_id: "300" }] }
        : { results: [] },
      // adversários (team_id != 200) somam was_fouled = 7 (não fouls = 99)
      eventPlayerStats: async () => ({ player_stats: [
        { player_id: 1, team_id: "300", was_fouled: 4, fouls: 99 },
        { player_id: 2, team_id: "300", was_fouled: 3, fouls: 99 },
        { player_id: 3, team_id: "200", was_fouled: 5, fouls: 99 },
      ] }),
      eventStats: async () => ({ stats: {} }),
    };
  }
  it("byPlayer soma o concede_field (was_fouled=7), não o stat_field", async () => {
    const p = new BSDStatsProvider(client(), { positionalTilt: false });
    const rate = await p.entityRate("p1", faltasMarket, {
      event: { home_team: { id: "100" }, away_team: { id: "200" } },
      entity_team_id: "100", is_home: true, opp_team_id: "200",
      league_avg_conceded: 10, escopo_historico: "todos",
    });
    expect(rate).not.toBeNull();
    // concedido = 7/1 jogo = 7.0 (média de was_fouled dos adversários)
    expect(rate!.concedido_adversario).toBe("7.0");
  });
});
