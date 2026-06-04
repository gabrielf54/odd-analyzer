export interface ReliabilityBin {
  bin: number;
  mean_pred: number;
  mean_actual: number;
  count: number;
}

/** Erro quadrático médio entre prob prevista e resultado (0/1). Menor = melhor. */
export function brierScore(preds: number[], actuals: number[]): number {
  if (preds.length === 0) throw new Error("preds vazio");
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += (preds[i]! - actuals[i]!) ** 2;
  return s / preds.length;
}

/** Agrupa previsões em nBins faixas [0,1] e mede prob média vs frequência real. */
export function reliabilityBins(preds: number[], actuals: number[], nBins = 10): ReliabilityBin[] {
  const buckets: [number, number][][] = Array.from({ length: nBins }, () => []);
  for (let i = 0; i < preds.length; i++) {
    const idx = Math.min(Math.floor(preds[i]! * nBins), nBins - 1);
    buckets[idx]!.push([preds[i]!, actuals[i]!]);
  }
  const out: ReliabilityBin[] = [];
  for (let i = 0; i < nBins; i++) {
    const b = buckets[i]!;
    if (b.length === 0) continue;
    out.push({
      bin: i,
      mean_pred: b.reduce((a, [p]) => a + p, 0) / b.length,
      mean_actual: b.reduce((a, [, ac]) => a + ac, 0) / b.length,
      count: b.length,
    });
  }
  return out;
}

/** Entropia cruzada média. Menor = melhor. Clipa p em [eps, 1-eps]. */
export function logLoss(preds: number[], actuals: number[], eps = 1e-15): number {
  if (preds.length === 0) throw new Error("preds vazio");
  let total = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = Math.min(Math.max(preds[i]!, eps), 1 - eps);
    const a = actuals[i]!;
    total += -(a * Math.log(p) + (1 - a) * Math.log(1 - p));
  }
  return total / preds.length;
}

/** ECE = soma ponderada por bin de |mean_pred - mean_actual|. */
export function expectedCalibrationError(preds: number[], actuals: number[], nBins = 10): number {
  if (preds.length === 0) throw new Error("preds vazio");
  const n = preds.length;
  return reliabilityBins(preds, actuals, nBins).reduce(
    (acc, b) => acc + (b.count / n) * Math.abs(b.mean_pred - b.mean_actual),
    0,
  );
}

/** 1 - Brier/Brier_base (base = prever sempre a freq média). >0 = tem skill. */
export function brierSkillScore(preds: number[], actuals: number[]): number {
  if (preds.length === 0) throw new Error("preds vazio");
  const base = actuals.reduce((a, b) => a + b, 0) / actuals.length;
  const brierBase = actuals.reduce((a, x) => a + (base - x) ** 2, 0) / actuals.length;
  if (brierBase === 0) return 0.0;
  return 1.0 - brierScore(preds, actuals) / brierBase;
}
