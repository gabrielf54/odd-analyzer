import { describe, it, expect } from "vitest";
import { opponentMultiplier, homeAwayMultiplier, positionalTilt, TILT_MIN, TILT_MAX } from "../src/model/adjustments.js";

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

describe("positionalTilt", () => {
  it("razão share_adv/share_base, clampada em [0.85, 1.20]", () => {
    expect(positionalTilt(0.50, 0.45)).toBeCloseTo(0.50 / 0.45, 12);
    expect(positionalTilt(0.90, 0.45)).toBe(TILT_MAX);
    expect(positionalTilt(0.10, 0.45)).toBe(TILT_MIN);
    expect(TILT_MIN).toBe(0.85);
    expect(TILT_MAX).toBe(1.20);
  });
  it("neutro (1.0) quando share ausente ou baseline não-positivo", () => {
    expect(positionalTilt(null, 0.45)).toBe(1.0);
    expect(positionalTilt(0.5, null)).toBe(1.0);
    expect(positionalTilt(0.5, 0)).toBe(1.0);
  });
});
