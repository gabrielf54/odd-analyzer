import { describe, it, expect } from "vitest";
import { lineupEdge, recommendTiming } from "../src/backtest/clvSegments.js";
import { makeRng } from "../src/backtest/validation.js";

describe("lineupEdge (vantagem média do modelo no salto da escalação) + recommendTiming", () => {
  it("agrega o salto médio com IC bootstrap", () => {
    const saltos = [0.05, 0.06, 0.04, 0.07, 0.05, 0.06, 0.05, 0.04, 0.06, 0.05]; // todos positivos
    const e = lineupEdge(saltos, { rng: makeRng(1) });
    expect(e.n).toBe(10);
    expect(e.media).toBeCloseTo(0.053, 3);
    expect(e.lo).toBeGreaterThan(0); // todos positivos → IC inteiro acima de zero
    expect(e.lo).toBeLessThanOrEqual(e.media);
    expect(e.hi).toBeGreaterThanOrEqual(e.media);
  });

  it("recomenda apostar pré-escalação só quando PRÉ-lineup E o IC não cruza zero (lo>0)", () => {
    expect(recommendTiming(true, { media: 0.05, lo: 0.02, hi: 0.08, n: 10 })).toBe("apostar_pre");
    expect(recommendTiming(true, { media: 0.05, lo: -0.01, hi: 0.10, n: 5 })).toBe("sem_sinal"); // IC cruza zero
    expect(recommendTiming(false, { media: 0.05, lo: 0.02, hi: 0.08, n: 10 })).toBe("sem_sinal"); // já pós-escalação
  });
});
