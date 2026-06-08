import { describe, it, expect } from "vitest";
import { NullOdds, ManualOdds, TheOddsApiMatchOdds } from "../src/providers/odds.js";
import { MARKETS } from "../src/model/markets.js";

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
});
