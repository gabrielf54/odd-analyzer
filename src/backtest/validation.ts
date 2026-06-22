// Validação HONESTA de calibração — além de "acertou o resultado?":
//  • modelVsMarket: o SEU número × o da casa, os dois contra o real. Bater a média
//    (BrierSkill) é necessário mas NÃO suficiente; o que paga é bater a CASA.
//  • bootstrapMetricCI: intervalo de confiança numa métrica (Brier/skill) por
//    reamostragem — com n pequeno, diz se "+0.26" é real ou ruído (evita graduar por sorte).
import { brierScore, logLoss } from "./calibration.js";

export interface ModelVsMarket {
  n: number;
  brierModelo: number;
  brierMercado: number;
  loglossModelo: number;
  loglossMercado: number;
  /** brierMercado − brierModelo. >0 = modelo bate a casa; <0 = casa é mais precisa. */
  vantagem: number;
}

/** Compara o forecaster do MODELO com o da CASA (prob de-vig), ambos contra o
 * resultado real. Arrays alinhados, já filtrados (só linhas com de-vig real). */
export function modelVsMarket(probModelo: number[], probMercado: number[], actuals: number[]): ModelVsMarket {
  const brierModelo = brierScore(probModelo, actuals);
  const brierMercado = brierScore(probMercado, actuals);
  return {
    n: actuals.length,
    brierModelo,
    brierMercado,
    loglossModelo: logLoss(probModelo, actuals),
    loglossMercado: logLoss(probMercado, actuals),
    vantagem: brierMercado - brierModelo,
  };
}

export interface MetricCI {
  point: number;
  lo: number;
  hi: number;
}

/** PRNG determinístico (mulberry32) — bootstrap reprodutível em teste/relatório. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BootstrapOpts {
  resamples?: number;
  alpha?: number; // 0.05 → IC de 95%
  rng?: () => number;
}

/** IC por bootstrap de uma métrica (preds,actuals)→número. `point` = métrica na
 * amostra cheia; lo/hi = percentis alpha/2 e 1-alpha/2 das reamostragens com
 * reposição. Reamostragens com base degenerada (toda 0 ou toda 1) são puladas —
 * BrierSkill é indefinido ali. */
export function bootstrapMetricCI(
  preds: number[], actuals: number[],
  metric: (p: number[], a: number[]) => number,
  opts: BootstrapOpts = {},
): MetricCI {
  const n = preds.length;
  if (n === 0) throw new Error("amostra vazia");
  const resamples = opts.resamples ?? 1000;
  const alpha = opts.alpha ?? 0.05;
  const rng = opts.rng ?? Math.random;
  const point = metric(preds, actuals);
  const vals: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const ps: number[] = new Array(n), as: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.min(n - 1, Math.floor(rng() * n));
      ps[i] = preds[idx]!; as[i] = actuals[idx]!;
    }
    const v = metric(ps, as);
    if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((x, y) => x - y);
  const q = (p: number) => vals.length ? vals[Math.min(vals.length - 1, Math.max(0, Math.floor(p * (vals.length - 1))))]! : point;
  return { point, lo: q(alpha / 2), hi: q(1 - alpha / 2) };
}
