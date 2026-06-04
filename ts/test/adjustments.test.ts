import { describe, it, expect } from "vitest";
import { opponentMultiplier, homeAwayMultiplier } from "../src/model/adjustments.js";

describe("adjustments", () => {
  it("opponentMultiplier: >1 quando adversário concede mais que a média", () => {
    expect(opponentMultiplier(6.0, 4.5)).toBeCloseTo(6.0 / 4.5, 12);
  });
  it("opponentMultiplier: neutro (1.0) sem dado de liga", () => {
    expect(opponentMultiplier(6.0, 0)).toBe(1.0);
  });
  it("homeAwayMultiplier escolhe pelo mando", () => {
    expect(homeAwayMultiplier(true, 1.1, 0.9)).toBe(1.1);
    expect(homeAwayMultiplier(false, 1.1, 0.9)).toBe(0.9);
  });
});
