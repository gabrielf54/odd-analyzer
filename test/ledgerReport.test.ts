import { describe, it, expect } from "vitest";
import { reportByMarket, validationByMarket } from "../src/backtest/ledgerReport.js";
import { makeRng } from "../src/backtest/validation.js";

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

describe("validationByMarket", () => {
  it("modelo×mercado só nas linhas com de-vig REAL (2 lados); IC no BrierSkill", () => {
    const rows = [
      // de-vig real (prob_devig != 1/odd_flag) → entra no modelo×mercado
      { market_type: "vitoria", prob_modelo: 0.6, prob_devig: 0.5, odd_flag: 2.5, resultado: 1 },
      { market_type: "vitoria", prob_modelo: 0.4, prob_devig: 0.45, odd_flag: 2.5, resultado: 0 },
      // single-sided (prob_devig == 1/odd_flag = 0.4) → fica fora do modelo×mercado
      { market_type: "vitoria", prob_modelo: 0.7, prob_devig: 0.4, odd_flag: 2.5, resultado: 1 },
      // sem de-vig → entra na calibração, fora do modelo×mercado
      { market_type: "vitoria", prob_modelo: 0.3, prob_devig: null, odd_flag: null, resultado: 0 },
      { market_type: "sot", prob_modelo: 0.5, prob_devig: null, odd_flag: null, resultado: null }, // não liquidada
    ];
    const rep = validationByMarket(rows, { bootstrapResamples: 100, rng: makeRng(1) });
    const v = rep.find((r) => r.market_type === "vitoria")!;
    expect(v.n).toBe(4);             // todas liquidadas entram na calibração
    expect(v.n_mercado).toBe(2);     // só as 2 com de-vig real entram no modelo×mercado
    expect(v.vantagem).toBeCloseTo(0.06625, 6); // mercado(0.22625) − modelo(0.16)
    expect(v.skill_lo).toBeLessThanOrEqual(v.skill_hi);
    expect(rep.find((r) => r.market_type === "sot")).toBeUndefined(); // só tinha linha não liquidada
  });
});
