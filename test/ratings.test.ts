import { describe, it, expect } from "vitest";
import { computeRatings, lambdaFromRatings, ratingsEligible, homeAdvFor, DEFAULT_RATINGS } from "../src/model/ratings.js";
import type { ChronoGame } from "../src/model/ratings.js";

// pool sintético: STRONG goleia, WEAK apanha; MID no meio. Datas crescentes.
function pool(): ChronoGame[] {
  const g: ChronoGame[] = [];
  const teams = ["STRONG", "MID", "WEAK"];
  // STRONG bate todo mundo 3x0; MID bate WEAK 2x0; WEAK perde sempre
  for (let r = 0; r < 6; r++) {
    const d = `2026-01-${String(10 + r).padStart(2, "0")}`;
    g.push({ date: d + "a", home: "STRONG", away: "WEAK", homeScore: 3, awayScore: 0 });
    g.push({ date: d + "b", home: "MID", away: "WEAK", homeScore: 2, awayScore: 0 });
    g.push({ date: d + "c", home: "STRONG", away: "MID", homeScore: 2, awayScore: 0 });
  }
  return g;
}

describe("computeRatings", () => {
  it("dá ataque maior ao time forte e defesa pior (mais positiva) ao fraco", () => {
    const r = computeRatings(pool());
    const strong = r.get("STRONG")!, mid = r.get("MID")!, weak = r.get("WEAK")!;
    expect(strong.att).toBeGreaterThan(mid.att);
    expect(mid.att).toBeGreaterThan(weak.att);
    // def: maior = concede mais. WEAK concede muito.
    expect(weak.def).toBeGreaterThan(strong.def);
    expect(strong.games).toBe(12); // 6 vs WEAK + 6 vs MID
  });

  it("é determinística e independe da ordem do array (ordena por data)", () => {
    const p = pool();
    const a = computeRatings(p);
    const b = computeRatings([...p].reverse());
    for (const k of a.keys()) {
      expect(b.get(k)!.att).toBeCloseTo(a.get(k)!.att, 12);
      expect(b.get(k)!.def).toBeCloseTo(a.get(k)!.def, 12);
    }
  });

  it("clampa os ratings em ±clamp", () => {
    const r = computeRatings(pool(), { clamp: 0.2 });
    for (const v of r.values()) {
      expect(Math.abs(v.att)).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(Math.abs(v.def)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it("ignora jogos malformados sem quebrar", () => {
    const r = computeRatings([
      { date: "1", home: "", away: "X", homeScore: 1, awayScore: 0 },
      { date: "2", home: "A", away: "B", homeScore: 2, awayScore: 1 },
    ]);
    expect(r.has("A")).toBe(true);
    expect(r.has("")).toBe(false);
  });
});

describe("lambdaFromRatings", () => {
  it("o forte tem λ maior que o fraco no mesmo confronto", () => {
    const r = computeRatings(pool());
    const lam = lambdaFromRatings(r, "STRONG", "WEAK")!;
    expect(lam.lambdaHome).toBeGreaterThan(lam.lambdaAway);
    expect(lam.lambdaHome).toBeGreaterThan(0);
  });

  it("mando (homeAdv) aumenta o λ do mandante", () => {
    const r = computeRatings(pool(), { homeAdv: 0.18 });
    const neutro = lambdaFromRatings(r, "MID", "STRONG", { homeAdv: 0 })!;
    const comMando = lambdaFromRatings(r, "MID", "STRONG", { homeAdv: 0.18 })!;
    expect(comMando.lambdaHome).toBeGreaterThan(neutro.lambdaHome);
  });

  it("null quando falta rating de um time", () => {
    const r = computeRatings(pool());
    expect(lambdaFromRatings(r, "STRONG", "INEXISTENTE")).toBeNull();
  });
});

describe("ratingsEligible", () => {
  it("exige minHist jogos nos DOIS times", () => {
    const r = computeRatings([
      { date: "1", home: "A", away: "B", homeScore: 1, awayScore: 0 },
      { date: "2", home: "A", away: "C", homeScore: 2, awayScore: 2 },
    ]);
    // A tem 2 jogos, B tem 1
    expect(ratingsEligible(r, "A", "B", 2)).toBe(false); // B só 1
    expect(ratingsEligible(r, "A", "B", 1)).toBe(true);
  });
});

describe("homeAdvFor", () => {
  it("seleção neutro, clube com mando", () => {
    expect(homeAdvFor("selecao")).toBe(0);
    expect(homeAdvFor("clube")).toBeGreaterThan(0);
  });
  it("default homeAdv é neutro", () => {
    expect(DEFAULT_RATINGS.homeAdv).toBe(0);
  });
});
