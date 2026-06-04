import { describe, it, expect } from "vitest";
import {
  brierScore, reliabilityBins, logLoss, expectedCalibrationError, brierSkillScore,
} from "../src/backtest/calibration.js";

describe("calibration", () => {
  it("brierScore: erro quadrático médio", () => {
    expect(brierScore([1, 0], [1, 0])).toBeCloseTo(0, 12);
    expect(brierScore([0.5, 0.5], [1, 0])).toBeCloseTo(0.25, 12);
  });

  it("brierScore preds vazio levanta erro", () => {
    expect(() => brierScore([], [])).toThrow();
  });

  it("logLoss penaliza erro confiante", () => {
    const certo = logLoss([0.9, 0.1], [1, 0]);
    const errado = logLoss([0.1, 0.9], [1, 0]);
    expect(errado).toBeGreaterThan(certo);
  });

  it("reliabilityBins agrupa e mede pred vs real", () => {
    const bins = reliabilityBins([0.05, 0.95], [0, 1], 10);
    expect(bins).toHaveLength(2);
    expect(bins[0]!.count).toBe(1);
  });

  it("expectedCalibrationError perfeito ~0", () => {
    const ece = expectedCalibrationError([1, 1, 0, 0], [1, 1, 0, 0], 10);
    expect(ece).toBeCloseTo(0, 9);
  });

  it("brierSkillScore: >0 quando bate a climatologia", () => {
    expect(brierSkillScore([1, 0, 1, 0], [1, 0, 1, 0])).toBeCloseTo(1.0, 9);
  });
});
