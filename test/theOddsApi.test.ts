import { describe, it, expect } from "vitest";
import { normTeam, findEvent, parseTotals, parseH2h } from "../src/odds/theOddsApi.js";

describe("theOddsApi", () => {
  it("normTeam remove acento/espaço/símbolo", () => {
    expect(normTeam("Bosnia & Herzegovina")).toBe("bosniaherzegovina");
    expect(normTeam("Côte d'Ivoire")).toBe("cotedivoire");
  });

  it("findEvent casa por par normalizado (order-aware)", () => {
    const evs = [{ id: "x", home_team: "Brazil", away_team: "Serbia" }];
    expect(findEvent(evs, "Brazil", "Serbia")?.id).toBe("x");
    expect(findEvent(evs, "Serbia", "Brazil")).toBeNull();
  });

  it("parseTotals agrupa over/under e descarta meio par", () => {
    const ev = {
      bookmakers: [{
        key: "bet365",
        markets: [{
          key: "totals",
          outcomes: [
            { name: "Over", point: 2.5, price: 1.9 },
            { name: "Under", point: 2.5, price: 1.95 },
            { name: "Over", point: 3.5, price: 2.5 }, // sem under → descartado
          ],
        }],
      }],
    };
    const out = parseTotals(ev);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ linha: 2.5, odd_over: 1.9, odd_under: 1.95, book: "bet365" });
  });

  it("parseH2h mapeia home/away/draw", () => {
    const ev = {
      bookmakers: [{
        key: "bet365",
        markets: [{
          key: "h2h",
          outcomes: [
            { name: "Brazil", price: 1.5 },
            { name: "Serbia", price: 6.0 },
            { name: "Draw", price: 4.0 },
          ],
        }],
      }],
    };
    const out = parseH2h(ev, "Brazil", "Serbia");
    expect(out[0]).toMatchObject({ odd_over: 1.5, odd_under: 6.0, odd_draw: 4.0 });
  });
});
