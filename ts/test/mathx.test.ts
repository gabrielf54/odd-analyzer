import { describe, it, expect } from "vitest";
import { lgamma, factorial } from "../src/lib/mathx.js";

describe("lgamma", () => {
  it("bate valores conhecidos de math.lgamma do Python", () => {
    // referências geradas com Python: math.lgamma(x)
    const casos: [number, number][] = [
      [0.5, 0.5723649429247001],
      [1.0, 0.0],
      [1.5, -0.12078223763524543],
      [2.3, 0.15418945495963055],
      [5.0, 3.178053830347945],
      [12.7, 19.23304317957009],
      [50.0, 144.5657439463449],
      [100.0, 359.1342053695754],
    ];
    for (const [x, esperado] of casos) {
      expect(lgamma(x)).toBeCloseTo(esperado, 9);
    }
  });
});

describe("factorial", () => {
  it("calcula fatoriais inteiros", () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(5)).toBe(120);
    expect(factorial(10)).toBe(3628800);
  });
});
