import { impliedProb } from "./devig.js";

/** Sobrevivência da Normal padrão S(z)=P(Z>z)=1-Φ(z), via erf (Abramowitz-Stegun 7.1.26). */
export function normalSf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erfAbs = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  const erf = z < 0 ? -erfAbs : erfAbs;
  return 0.5 * (1 - erf);
}

export interface Rung { linha: number; odd: number; }
export interface DevigRung { linha: number; odd: number; prob_devig: number; sem_devig: boolean; }
export interface LadderResult { ok: boolean; m: number | null; s: number | null; c: number | null; rungs: DevigRung[]; }

/** De-vig de escada one-sided: ajusta Normal(m,s) + margem c às implícitas dos degraus
 * (q_k = c·S((L_k−m)/s)), por grid em (m,s) com c em forma fechada, e devolve a prob
 * JUSTA S((L_k−m)/s) por degrau. Fail-safe: K<3 / odds não-monótonas / ajuste ruim →
 * fallback sem_devig (implícita crua, conservadora). */
export function ladderDevig(rungsIn: Rung[]): LadderResult {
  const rungs = [...rungsIn].sort((a, b) => a.linha - b.linha);
  const fallback = (): LadderResult => ({
    ok: false, m: null, s: null, c: null,
    rungs: rungs.map((r) => ({ linha: r.linha, odd: r.odd, prob_devig: impliedProb(r.odd), sem_devig: true })),
  });
  if (rungs.length < 3) return fallback();
  const L = rungs.map((r) => r.linha + 0.5); // limiar N
  const q = rungs.map((r) => impliedProb(r.odd)); // P_book(X≥N), com margem
  for (let i = 1; i < q.length; i++) if (q[i]! >= q[i - 1]!) return fallback();

  const lo = L[0]!, hi = L[L.length - 1]!;
  let best = { m: 0, s: 0, c: 1, res: Infinity };
  for (let m = lo - 25; m <= hi + 25; m += 1) {
    for (let s = 3; s <= 40; s += 0.5) {
      const S = L.map((l) => normalSf((l - m) / s));
      const denom = S.reduce((a, v) => a + v * v, 0);
      if (denom <= 0) continue;
      const c = S.reduce((a, v, i) => a + v * q[i]!, 0) / denom; // c* fechado (mínimos quadrados)
      if (c < 1.0) continue;
      let res = 0;
      for (let i = 0; i < S.length; i++) { const d = q[i]! - c * S[i]!; res += d * d; }
      if (res < best.res) best = { m, s, c, res };
    }
  }
  const rmse = Math.sqrt(best.res / q.length);
  if (!Number.isFinite(rmse) || rmse > 0.05) return fallback();
  return {
    ok: true, m: best.m, s: best.s, c: best.c,
    rungs: rungs.map((r) => ({
      linha: r.linha, odd: r.odd,
      prob_devig: normalSf((r.linha + 0.5 - best.m) / best.s), sem_devig: false,
    })),
  };
}
