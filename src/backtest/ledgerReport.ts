import { brierScore, expectedCalibrationError, brierSkillScore } from "./calibration.js";
import { modelVsMarket, bootstrapMetricCI } from "./validation.js";

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

export interface ValidationReport extends MarketReport {
  /** IC 95% (bootstrap) do BrierSkill — diz se o skill é real ou ruído de amostra pequena. */
  skill_lo: number;
  skill_hi: number;
  /** Linhas com de-vig REAL (2 lados) — base do modelo×mercado. */
  n_mercado: number;
  brier_modelo: number | null;
  brier_mercado: number | null;
  /** brier_mercado − brier_modelo. >0 = modelo bate a casa (edge); <0 = casa mais precisa. */
  vantagem: number | null;
}

/** Uma linha tem de-vig REAL (2 lados) quando prob_devig ≠ 1/odd_flag — o single-sided
 * grava prob_devig = implícita crua (1/odd), que não é o número justo da casa. */
function temDevigReal(r: any, eps = 1e-6): boolean {
  if (r.prob_devig == null || r.odd_flag == null) return false;
  const odd = Number(r.odd_flag);
  if (!(odd > 1)) return false;
  return Math.abs(Number(r.prob_devig) - 1 / odd) > eps;
}

/** Relatório de validação por mercado: calibração + IC do skill (bootstrap) +
 * MODELO×MERCADO (só nas linhas com de-vig real). Responde "tenho edge?", não só
 * "acertei?". Reusa as funções puras já testadas. */
export function validationByMarket(
  rows: any[], opts: { bootstrapResamples?: number; rng?: () => number } = {},
): ValidationReport[] {
  const base = reportByMarket(rows);
  const settled = rows.filter((r) => r.resultado === 0 || r.resultado === 1);
  const out: ValidationReport[] = [];
  for (const m of base) {
    const rs = settled.filter((r) => r.market_type === m.market_type);
    const preds = rs.map((r) => Number(r.prob_modelo));
    const acts = rs.map((r) => Number(r.resultado));
    const ci = bootstrapMetricCI(preds, acts, brierSkillScore, { resamples: opts.bootstrapResamples ?? 1000, rng: opts.rng });
    const mkt = rs.filter((r) => temDevigReal(r));
    let brier_modelo: number | null = null, brier_mercado: number | null = null, vantagem: number | null = null;
    if (mkt.length >= 1) {
      const mvm = modelVsMarket(
        mkt.map((r) => Number(r.prob_modelo)),
        mkt.map((r) => Number(r.prob_devig)),
        mkt.map((r) => Number(r.resultado)),
      );
      brier_modelo = mvm.brierModelo; brier_mercado = mvm.brierMercado; vantagem = mvm.vantagem;
    }
    out.push({ ...m, skill_lo: ci.lo, skill_hi: ci.hi, n_mercado: mkt.length, brier_modelo, brier_mercado, vantagem });
  }
  return out;
}
