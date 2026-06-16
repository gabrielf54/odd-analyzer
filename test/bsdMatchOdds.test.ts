import { describe, it, expect } from "vitest";
import {
  parseBsdMatchOdds, matchBetOdd, matchFairProb, outcomeFromJogador, isGols, isVitoria,
} from "../src/odds/bsdMatchOdds.js";
import { devigThreeWay, fairProbOver } from "../src/value/devig.js";

// Fixture REAL capturado da BSD (evento 8302, /events/8302/odds/, 2026-06-15).
const REAL = {
  event_id: 8302,
  odds: {
    home_win: 1.91, draw: 3.4, away_win: 4.16,
    over_15_goals: 1.39, over_25_goals: 2.21, over_35_goals: 4.05,
    under_15_goals: 2.89, under_25_goals: 1.65, under_35_goals: 1.22,
    btts_yes: 1.99, btts_no: 1.75,
  },
};

describe("parseBsdMatchOdds", () => {
  it("desembrulha o formato plano real", () => {
    const p = parseBsdMatchOdds(REAL);
    expect(p.home_win).toBe(1.91);
    expect(p.draw).toBe(3.4);
    expect(p.away_win).toBe(4.16);
    expect(p.totals["2.5"]).toEqual({ over: 2.21, under: 1.65 });
    expect(p.totals["1.5"]).toEqual({ over: 1.39, under: 2.89 });
    expect(p.totals["3.5"]).toEqual({ over: 4.05, under: 1.22 });
  });
  it("odds null (jogo ainda não precificado) → null, sem quebrar", () => {
    const p = parseBsdMatchOdds({ odds: { home_win: null, over_25_goals: null } });
    expect(p.home_win).toBeNull();
    expect(p.totals["2.5"]?.over).toBeNull();
  });
  it("rejeita odd ≤ 1 (inválida)", () => {
    const p = parseBsdMatchOdds({ odds: { home_win: 0.5, over_25_goals: 1.0 } });
    expect(p.home_win).toBeNull();
    expect(p.totals["2.5"]?.over).toBeNull();
  });
});

describe("matchBetOdd / matchFairProb", () => {
  const p = parseBsdMatchOdds(REAL);
  it("gols: odd = over da linha; fair = de-vig 2-vias conservador", () => {
    expect(matchBetOdd(p, "gols", 2.5)).toBe(2.21);
    expect(matchFairProb(p, "gols", 2.5)).toBeCloseTo(fairProbOver(2.21, 1.65), 12);
  });
  it("vitória (mandante): odd = home_win; fair = de-vig 3-vias", () => {
    expect(matchBetOdd(p, "vitoria", 0.5)).toBe(1.91);
    const [ph] = devigThreeWay(1.91, 3.4, 4.16);
    expect(matchFairProb(p, "vitoria", 0.5)).toBeCloseTo(ph, 12);
  });
  it("vitória empate/visitante respeitam o outcome", () => {
    const [ph, pd, pa] = devigThreeWay(1.91, 3.4, 4.16);
    expect(matchFairProb(p, "vitoria", 0.5, "draw")).toBeCloseTo(pd, 12);
    expect(matchFairProb(p, "vitoria", 0.5, "away")).toBeCloseTo(pa, 12);
    expect(matchBetOdd(p, "vitoria", 0.5, "away")).toBe(4.16);
  });
  it("linha/mercado ausente → null", () => {
    const vazio = parseBsdMatchOdds({ odds: {} });
    expect(matchBetOdd(vazio, "gols", 2.5)).toBeNull();
    expect(matchFairProb(vazio, "vitoria", 0.5)).toBeNull();
    expect(matchBetOdd(p, "escanteios", 9.5)).toBeNull();
  });
  it("de-vig do over 2.5 deste fixture é justa-coerente (< implícita crua)", () => {
    const fair = matchFairProb(p, "gols", 2.5)!;
    expect(fair).toBeGreaterThan(0);
    expect(fair).toBeLessThan(1 / 2.21 + 0.001); // sem inflar a margem
  });
});

describe("outcomeFromJogador / classificadores", () => {
  it("lê o sufixo do desfecho", () => {
    expect(outcomeFromJogador("Brasil x França (1)")).toBe("home");
    expect(outcomeFromJogador("Brasil x França (X)")).toBe("draw");
    expect(outcomeFromJogador("Brasil x França (2)")).toBe("away");
    expect(outcomeFromJogador("Brasil x França")).toBe("home");
  });
  it("isGols/isVitoria cobrem os market_type do motor", () => {
    expect(isGols("gols")).toBe(true);
    expect(isVitoria("vitoria")).toBe(true);
    expect(isGols("vitoria")).toBe(false);
    expect(isVitoria("gols")).toBe(false);
  });
});
