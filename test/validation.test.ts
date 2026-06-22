import { describe, it, expect } from "vitest";
import { modelVsMarket, bootstrapMetricCI, makeRng } from "../src/backtest/validation.js";
import { brierScore, brierSkillScore } from "../src/backtest/calibration.js";

describe("modelVsMarket", () => {
  it("modelo melhor que o mercado → vantagem positiva (Brier menor)", () => {
    // modelo crava o resultado; mercado erra mais.
    const probModelo = [1, 0, 1, 0];
    const probMercado = [0.6, 0.4, 0.6, 0.4];
    const actuals = [1, 0, 1, 0];
    const r = modelVsMarket(probModelo, probMercado, actuals);
    expect(r.n).toBe(4);
    expect(r.brierModelo).toBeCloseTo(0, 10);
    expect(r.brierMercado).toBeCloseTo(0.16, 10);
    expect(r.vantagem).toBeCloseTo(0.16, 10); // mercado - modelo > 0 = modelo ganha
  });
  it("mercado melhor que o modelo → vantagem negativa", () => {
    const probModelo = [0.5, 0.5];
    const probMercado = [1, 0];
    const actuals = [1, 0];
    const r = modelVsMarket(probModelo, probMercado, actuals);
    expect(r.vantagem).toBeLessThan(0);
  });
});

describe("bootstrapMetricCI", () => {
  const preds = [0.9, 0.8, 0.1, 0.2, 0.7, 0.3, 0.6, 0.4, 0.85, 0.15];
  const actuals = [1, 1, 0, 0, 1, 0, 1, 0, 1, 0];

  it("o ponto fica dentro do intervalo [lo, hi]", () => {
    const ci = bootstrapMetricCI(preds, actuals, brierScore, { resamples: 200, rng: makeRng(42) });
    expect(ci.lo).toBeLessThanOrEqual(ci.point);
    expect(ci.point).toBeLessThanOrEqual(ci.hi);
  });
  it("determinístico: mesma seed → mesmo intervalo", () => {
    const a = bootstrapMetricCI(preds, actuals, brierSkillScore, { resamples: 200, rng: makeRng(7) });
    const b = bootstrapMetricCI(preds, actuals, brierSkillScore, { resamples: 200, rng: makeRng(7) });
    expect(a).toEqual(b);
  });
  it("o `point` é a métrica na amostra cheia (não reamostrada)", () => {
    const ci = bootstrapMetricCI(preds, actuals, brierScore, { resamples: 50, rng: makeRng(1) });
    expect(ci.point).toBeCloseTo(brierScore(preds, actuals), 10);
  });
});
