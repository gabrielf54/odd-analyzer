/** Faixa de risco de um candidato, derivada da prob_modelo. Valor no fio (PT). */
export type Risco = "seguro" | "moderado" | "tiro_longo";

// Cortes ajustáveis num lugar só. Âncoras leigas:
// 0.50 = "acontece mais vezes que não"; 0.35 = "acontece com frequência razoável".
export const RISK_SEGURO = 0.50;
export const RISK_MODERADO = 0.35;

export function classifyRisk(probModelo: number): Risco {
  if (probModelo >= RISK_SEGURO) return "seguro";
  if (probModelo >= RISK_MODERADO) return "moderado";
  return "tiro_longo";
}

const ORDEM: Record<Risco, number> = { seguro: 0, moderado: 1, tiro_longo: 2 };

/** Cópia ordenada por faixa (seguro→moderado→tiro_longo) e EV desc dentro da faixa.
 * Anexa `risco` a cada candidato e `recomendado: true` ao primeiro SEM alerta_minutos.
 * Se todos têm alerta, o primeiro leva a estrela mesmo assim — ninguém é removido.
 * Isto é APRESENTAÇÃO (ninguém é removido — todos já passaram no edge>0), não o
 * proibido "filtrar por probabilidade alta". Lista vazia → vazia. */
export function rankCandidates(
  approved: Record<string, unknown>[],
): Record<string, unknown>[] {
  const withRisk = approved.map((c) => ({
    ...c,
    risco: classifyRisk((c["prob_modelo"] as number) ?? 0),
  }));
  withRisk.sort((a, b) => {
    const d = ORDEM[a.risco as Risco] - ORDEM[b.risco as Risco];
    if (d !== 0) return d;
    const ar = a as Record<string, unknown>;
    const br = b as Record<string, unknown>;
    return ((br["ev"] as number) ?? -Infinity) - ((ar["ev"] as number) ?? -Infinity);
  });
  // Estrela: primeiro da ordem SEM risco de minutos (pode estar no banco /
  // sair cedo). Se todos tiverem alerta, o primeiro leva a estrela mesmo assim
  // — ninguém é removido; o selo avisa.
  const starIdx = withRisk.findIndex((c) => (c as Record<string, unknown>)["alerta_minutos"] !== true);
  const star = starIdx === -1 ? 0 : starIdx;
  return withRisk.map((c, i) => ({ ...c, recomendado: i === star }));
}
