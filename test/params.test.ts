import { describe, it, expect } from "vitest";
import { POSITIONAL_SHARE_NACIONAL, POSITIONAL_TILT_ENABLED, POSITIONAL_MIN_GAMES } from "../src/model/params.js";

describe("parâmetros posicionais", () => {
  it("shares por mercado somam ~1 e cobrem D/M/F", () => {
    for (const f of ["total_tackle", "shots_on_target", "total_shots"]) {
      const s = POSITIONAL_SHARE_NACIONAL[f]!;
      expect(s.D! + s.M! + s.F!).toBeGreaterThan(0.97);
      expect(s.D! + s.M! + s.F!).toBeLessThan(1.03);
    }
  });
  it("flag e mínimo de jogos existem", () => {
    expect(typeof POSITIONAL_TILT_ENABLED).toBe("boolean");
    expect(POSITIONAL_MIN_GAMES).toBe(5);
  });
});
