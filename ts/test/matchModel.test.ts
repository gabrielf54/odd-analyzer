import { describe, it, expect } from "vitest";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";

describe("matchModel", () => {
  it("scoreMatrix normaliza para soma ~1", () => {
    const m = scoreMatrix(1.4, 1.1);
    const total = m.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  it("probs1x2 somam ~1 e mandante mais forte vence mais", () => {
    const m = scoreMatrix(1.8, 0.9);
    const p = probs1x2(m);
    expect(p.home + p.draw + p.away).toBeCloseTo(1.0, 9);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it("probTotalOver decresce com a linha", () => {
    const m = scoreMatrix(1.5, 1.3);
    expect(probTotalOver(m, 1.5)).toBeGreaterThan(probTotalOver(m, 3.5));
  });
});
