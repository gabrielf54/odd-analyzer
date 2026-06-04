import { describe, it, expect } from "vitest";
import { expectedLambda, probAtLeast, probOverLine } from "../src/model/sotModel.js";

describe("sotModel", () => {
  it("expectedLambda: 2.0 SoT/90 em 45 min -> 1.0", () => {
    expect(expectedLambda(2.0, 45)).toBeCloseTo(1.0, 9);
  });

  it("poisson probAtLeast: mu=2, P(X>=2) = 1 - 3*e^-2", () => {
    const esperado = 1 - 3 * Math.exp(-2);
    expect(probAtLeast(2.0, 2)).toBeCloseTo(esperado, 9);
  });

  it("probAtLeast em 0 e 1", () => {
    expect(probAtLeast(1.5, 0)).toBe(1.0);
    expect(probAtLeast(1.5, 1)).toBeCloseTo(1 - Math.exp(-1.5), 9);
  });

  it("probOverLine 1.5 == P(X>=2)", () => {
    expect(probOverLine(2.0, 1.5)).toBeCloseTo(probAtLeast(2.0, 2), 12);
  });

  it("NB com r grande ~ Poisson", () => {
    expect(probAtLeast(2.0, 3, 100000)).toBeCloseTo(probAtLeast(2.0, 3), 3);
  });

  it("NB mais disperso (r pequeno) engrossa a cauda", () => {
    expect(probAtLeast(2.0, 5, 2)).toBeGreaterThan(probAtLeast(2.0, 5));
  });

  it("mu=0 não quebra e dá zero", () => {
    expect(probAtLeast(0.0, 1)).toBe(0.0);
    expect(probAtLeast(0.0, 1, 4.0)).toBe(0.0);
    expect(probOverLine(0.0, 0.5, 4.0)).toBe(0.0);
    expect(probAtLeast(0.0, 0)).toBe(1.0);
  });
});
