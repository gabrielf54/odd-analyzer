import { describe, it, expect } from "vitest";
import { ladderDevig, normalSf } from "../src/value/ladderDevig.js";

describe("normalSf", () => {
  it("S(0)=0.5, decai monotônico", () => {
    expect(normalSf(0)).toBeCloseTo(0.5, 3);
    expect(normalSf(1)).toBeCloseTo(0.1587, 2);
    expect(normalSf(-1)).toBeCloseTo(0.8413, 2);
  });
});

describe("ladderDevig", () => {
  it("recupera m,s de uma escada Normal(70,12) com margem c=1.08 e remove a margem", () => {
    const m = 70, s = 12, c = 1.08;
    const rungs = [60, 65, 70, 75, 80, 85, 90].map((L) => ({
      linha: L - 0.5, odd: 1 / (c * normalSf((L - m) / s)),
    }));
    const out = ladderDevig(rungs);
    expect(out.ok).toBe(true);
    expect(out.m).toBeCloseTo(70, 0);
    expect(out.s).toBeCloseTo(12, 0);
    const r70 = out.rungs.find((r) => r.linha === 69.5)!;
    expect(r70.prob_devig).toBeCloseTo(0.5, 2);
    expect(r70.prob_devig).toBeLessThan(1 / rungs[2]!.odd); // de-vig < implícita crua
    expect(r70.sem_devig).toBe(false);
  });
  it("K<3 → fallback sem_devig (implícita crua)", () => {
    const out = ladderDevig([{ linha: 84.5, odd: 1.8 }, { linha: 89.5, odd: 2.0 }]);
    expect(out.ok).toBe(false);
    expect(out.rungs[0]!.sem_devig).toBe(true);
    expect(out.rungs[0]!.prob_devig).toBeCloseTo(1 / 1.8, 6);
  });
  it("odds não-monótonas → fallback sem_devig", () => {
    const out = ladderDevig([
      { linha: 60, odd: 2.0 }, { linha: 65, odd: 1.5 }, { linha: 70, odd: 3.0 },
    ]);
    expect(out.ok).toBe(false);
    expect(out.rungs.every((r) => r.sem_devig)).toBe(true);
  });
});
