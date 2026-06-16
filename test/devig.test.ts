import { describe, it, expect } from "vitest";
import { impliedProb, devigMultiplicative, devigPower, fairProbOver, devigThreeWay } from "../src/value/devig.js";

describe("devig", () => {
  it("impliedProb", () => {
    expect(impliedProb(2.0)).toBeCloseTo(0.5, 12);
  });
  it("multiplicativo mercado par 1.91/1.91 -> 0.5/0.5", () => {
    const [po, pu] = devigMultiplicative(1.91, 1.91);
    expect(po).toBeCloseTo(0.5, 9);
    expect(pu).toBeCloseTo(0.5, 9);
    expect(po + pu).toBeCloseTo(1.0, 12);
  });
  it("multiplicativo soma 1 e favorito tem mais prob", () => {
    const [po, pu] = devigMultiplicative(1.5, 3.0);
    expect(po + pu).toBeCloseTo(1.0, 12);
    expect(po).toBeGreaterThan(pu);
  });
  it("power method mercado par", () => {
    const [po, pu] = devigPower(1.91, 1.91);
    expect(po).toBeCloseTo(0.5, 3);
    expect(po + pu).toBeCloseTo(1.0, 6);
  });
  it("fairProbOver é o conservador (max dos dois métodos)", () => {
    const [poM] = devigMultiplicative(1.8, 2.1);
    const [poP] = devigPower(1.8, 2.1);
    expect(fairProbOver(1.8, 2.1)).toBeCloseTo(Math.max(poM, poP), 9);
  });
  it("power desloca prob ao favorito vs multiplicativo", () => {
    const [poP, puP] = devigPower(1.40, 3.20);
    const [poM] = devigMultiplicative(1.40, 3.20);
    expect(poP + puP).toBeCloseTo(1.0, 9);
    expect(poP).toBeGreaterThan(puP);
    expect(poP).toBeGreaterThan(poM);
  });
  it("fairProbOver usa multiplicativo quando over é zebra", () => {
    const [poM] = devigMultiplicative(2.1, 1.8);
    const [poP] = devigPower(2.1, 1.8);
    expect(poM).toBeGreaterThan(poP);
    expect(fairProbOver(2.1, 1.8)).toBeCloseTo(poM, 9);
  });
  it("odd inválida levanta erro", () => {
    expect(() => impliedProb(1.0)).toThrow();
  });
  it("devigThreeWay soma 1 e ordena por favoritismo", () => {
    const [ph, pd, pa] = devigThreeWay(1.91, 3.4, 4.16);
    expect(ph + pd + pa).toBeCloseTo(1.0, 12);
    expect(ph).toBeGreaterThan(pd); // mandante favorito
    expect(pd).toBeGreaterThan(pa);
    // implícita crua do mandante 1/1.91=0.5236; após de-vig fica < (margem removida proporcional)
    expect(ph).toBeLessThan(1 / 1.91);
  });
  it("devigThreeWay mercado equilibrado → ~1/3 cada", () => {
    const [ph, pd, pa] = devigThreeWay(3, 3, 3);
    expect(ph).toBeCloseTo(1 / 3, 9);
    expect(pd).toBeCloseTo(1 / 3, 9);
    expect(pa).toBeCloseTo(1 / 3, 9);
  });
});
