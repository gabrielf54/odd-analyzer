import { describe, it, expect } from "vitest";
import { americanToDecimal } from "../src/oddsMath.js";

describe("americanToDecimal", () => {
  it("americana negativa", () => {
    expect(americanToDecimal("-120")).toBeCloseTo(1.8333, 4);
  });
  it("americana positiva", () => {
    expect(americanToDecimal("+150")).toBeCloseTo(2.5, 4);
  });
  it("decimal sem sinal volta como float", () => {
    expect(americanToDecimal("1.83")).toBe(1.83);
  });
  it("inteiro sem ponto é americana", () => {
    expect(americanToDecimal("100")).toBe(2.0);
  });
});
