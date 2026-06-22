import { describe, it, expect } from "vitest";
import { aggregateClvByMarket } from "../src/backtest/clvByMarket.js";

describe("aggregateClvByMarket (CLVs por aposta já agrupados → resumo por mercado)", () => {
  it("agrega média + IC bootstrap + n por market_type, ordenado por nome", () => {
    const out = aggregateClvByMarket({
      sot: [0.1, 0.2, 0.3],
      desarmes: [0.05],
    });
    // ordem alfabética: desarmes antes de sot
    expect(out.map((r) => r.market_type)).toEqual(["desarmes", "sot"]);

    const sot = out.find((r) => r.market_type === "sot")!;
    expect(sot.n).toBe(3);
    expect(sot.clv_medio).toBeCloseTo(0.2, 9);
    expect(sot.lo).toBeLessThanOrEqual(sot.clv_medio);
    expect(sot.hi).toBeGreaterThanOrEqual(sot.clv_medio);

    const des = out.find((r) => r.market_type === "desarmes")!;
    expect(des.n).toBe(1);
    // amostra de 1: bootstrap reamostra sempre o mesmo valor → IC colapsa na média
    expect(des.clv_medio).toBeCloseTo(0.05, 9);
    expect(des.lo).toBeCloseTo(0.05, 9);
    expect(des.hi).toBeCloseTo(0.05, 9);
  });

  it("ignora mercados sem amostra e devolve [] para entrada vazia", () => {
    expect(aggregateClvByMarket({})).toEqual([]);
    expect(aggregateClvByMarket({ sot: [] })).toEqual([]);
  });
});
