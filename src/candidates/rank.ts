import { isValidated } from "../model/markets.js";

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

/** Um candidato é uma APOSTA DE VALOR que vale a pena (elegível à estrela) quando,
 * ao mesmo tempo: titularidade confirmada (N1 — não recomendar quem pode ficar no
 * banco), sem alerta de minutos, e mercado VALIDADO (calibração provada —
 * desarmes/gols/etc seguem em validação). Falha em qualquer um → fora da estrela. */
function prontoParaApostar(c: Record<string, unknown>, leagueId?: unknown): boolean {
  return (
    c["titularidade"] === "confirmado" &&
    c["alerta_minutos"] !== true &&
    isValidated(String(c["market_type"] ?? ""), c["linha"] as number | undefined, leagueId)
  );
}

/** Cópia ordenada por faixa (seguro→moderado→tiro_longo) e EV desc dentro da faixa.
 * Anexa `risco`, `pronto_para_apostar` (gate N1 + mercado validado) a cada candidato e
 * `recomendado: true` ao MELHOR pronto. Se NENHUM está pronto (pré-lineup ou só
 * mercados selados), ninguém é recomendado — a análise ainda aparece (não remove
 * ninguém; o selo avisa). Não é o proibido "filtrar por prob alta". Vazia → vazia. */
export function rankCandidates(
  approved: Record<string, unknown>[],
  leagueId?: unknown,
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
  const starIdx = withRisk.findIndex((c) => prontoParaApostar(c as Record<string, unknown>, leagueId));
  return withRisk.map((c, i) => ({
    ...c,
    pronto_para_apostar: prontoParaApostar(c as Record<string, unknown>, leagueId),
    recomendado: starIdx !== -1 && i === starIdx,
  }));
}
