import { brierScore, expectedCalibrationError, brierSkillScore } from "./calibration.js";

export interface MarketReport {
  market_type: string;
  n: number;
  brier: number;
  ece: number;
  brier_skill: number;
  clv_medio: number | null;
}

/** Agrega o paper_ledger por market_type, usando só linhas com `resultado` 0/1.
 * Reusa as métricas de calibração (Brier/ECE/BrierSkill). CLV médio quando houver. */
export function reportByMarket(rows: any[]): MarketReport[] {
  const settled = rows.filter((r) => r.resultado === 0 || r.resultado === 1);
  const byMk = new Map<string, any[]>();
  for (const r of settled) {
    const b = byMk.get(r.market_type) ?? [];
    b.push(r);
    byMk.set(r.market_type, b);
  }
  const out: MarketReport[] = [];
  for (const [mk, rs] of byMk) {
    const preds = rs.map((r) => Number(r.prob_modelo));
    const acts = rs.map((r) => Number(r.resultado));
    const clvs = rs.map((r) => r.clv).filter((x) => typeof x === "number") as number[];
    out.push({
      market_type: mk,
      n: rs.length,
      brier: brierScore(preds, acts),
      ece: expectedCalibrationError(preds, acts),
      brier_skill: brierSkillScore(preds, acts),
      clv_medio: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
    });
  }
  return out;
}
