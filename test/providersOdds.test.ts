import { describe, it, expect } from "vitest";
import { NullOdds, ManualOdds, TheOddsApiMatchOdds, BSDMatchOdds } from "../src/providers/odds.js";
import { MARKETS } from "../src/model/markets.js";

// payload PLANO real da BSD (spike 2026-06-15)
const BSD_FLAT = {
  event_id: 8302,
  odds: {
    home_win: 1.91, draw: 3.4, away_win: 4.16,
    over_15_goals: 1.39, over_25_goals: 2.21, over_35_goals: 4.05,
    under_15_goals: 2.89, under_25_goals: 1.65, under_35_goals: 1.22,
    btts_yes: 1.99, btts_no: 1.75,
  },
};

describe("providers/odds", () => {
  it("NullOdds devolve []", () => {
    expect(new NullOdds().lines()).toEqual([]);
  });

  it("ManualOdds devolve as linhas dadas", () => {
    const lines = [{ entidade: "partida", linha: 2.5, odd_over: 1.9, odd_under: 1.95, book: "manual" }];
    expect(new ManualOdds(lines).lines()).toEqual(lines);
  });

  it("TheOddsApiMatchOdds usa fetch injetado e parseTotals p/ gols", async () => {
    const evento = { home_team: { name: "Brazil" }, away_team: { name: "Serbia" } };
    const provider = new TheOddsApiMatchOdds("soccer_fifa_world_cup", "us", {
      fetchEventsFn: async () => [{ id: "x", home_team: "Brazil", away_team: "Serbia" }],
      fetchEventOddsFn: async () => ({
        bookmakers: [{ key: "b", markets: [{ key: "totals", outcomes: [
          { name: "Over", point: 2.5, price: 1.9 }, { name: "Under", point: 2.5, price: 1.95 },
        ] }] }],
      }),
    });
    const out = await provider.lines(evento, MARKETS["gols"]!);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ linha: 2.5, odd_over: 1.9 });
  });

  it("TheOddsApiMatchOdds: mercado sem mapping → []", async () => {
    const provider = new TheOddsApiMatchOdds();
    expect(await provider.lines({}, MARKETS["sot"]!)).toEqual([]);
  });

  it("BSDMatchOdds: gols → linhas de totais over/under do formato plano", async () => {
    const provider = new BSDMatchOdds({ eventOdds: async () => BSD_FLAT });
    const out = await provider.lines({ id: 8302 }, MARKETS["gols"]!);
    expect(out).toHaveLength(3); // 1.5/2.5/3.5
    expect(out.find((l) => l.linha === 2.5)).toMatchObject({ odd_over: 2.21, odd_under: 1.65, book: "bsd" });
  });

  it("BSDMatchOdds: vitória → mandante (3-vias; odd_under null, odd_draw presente)", async () => {
    const provider = new BSDMatchOdds({ eventOdds: async () => BSD_FLAT });
    const out = await provider.lines({ id: 8302 }, MARKETS["vitoria"]!);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ entidade: "partida", linha: 0.5, odd_over: 1.91, odd_under: null, odd_draw: 3.4 });
  });

  it("BSDMatchOdds: jogo não precificado (odds null) → []", async () => {
    const provider = new BSDMatchOdds({ eventOdds: async () => ({ event_id: 1, odds: { home_win: null, over_25_goals: null } }) });
    expect(await provider.lines({ id: 1 }, MARKETS["gols"]!)).toEqual([]);
    expect(await provider.lines({ id: 1 }, MARKETS["vitoria"]!)).toEqual([]);
  });
});
