import { describe, it, expect } from "vitest";
import { reportByMarket } from "../src/backtest/ledgerReport.js";

describe("reportByMarket", () => {
  it("agrega n/Brier/CLV por market_type, só com resultado preenchido", () => {
    const rows = [
      { market_type: "sot", prob_modelo: 1, resultado: 1, clv: 0.1 },
      { market_type: "sot", prob_modelo: 0, resultado: 0, clv: -0.1 },
      { market_type: "desarmes", prob_modelo: 0.5, resultado: null }, // não entra
    ];
    const rep = reportByMarket(rows);
    const sot = rep.find((r) => r.market_type === "sot")!;
    expect(sot.n).toBe(2);
    expect(sot.brier).toBeCloseTo(0, 9);     // previsões perfeitas
    expect(sot.clv_medio).toBeCloseTo(0, 9);  // (0.1 + -0.1)/2
    expect(rep.find((r) => r.market_type === "desarmes")).toBeUndefined();
  });

  it("clv_medio é null quando nenhuma linha tem clv", () => {
    const rep = reportByMarket([
      { market_type: "sot", prob_modelo: 0.6, resultado: 1 },
      { market_type: "sot", prob_modelo: 0.4, resultado: 0 },
    ]);
    expect(rep[0]!.clv_medio).toBeNull();
    expect(rep[0]!.n).toBe(2);
  });
});
