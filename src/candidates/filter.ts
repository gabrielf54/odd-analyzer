export interface Cuts {
  edge_min: number;
  ev_min: number;
  amostra_min: number;
}

export const CUTS_DEFAULT: Cuts = { edge_min: 0.04, ev_min: 0.05, amostra_min: 10 };

/** Códigos dos cortes (valores no fio — PT, como `incerteza`). */
export type CutReason = "edge" | "ev" | "titular" | "amostra";

/** Candidato reprovado + por quais cortes ele caiu. Mantém o dossiê inteiro
 * (edge/ev/amostra/xi reais) pra UI mostrar o número, não só o veredito.
 * `motivos` é chave de dados (PT snake_case, como as demais do candidato). */
export interface RejectedCandidate extends Record<string, unknown> {
  motivos: CutReason[];
}

export interface Evaluation {
  approved: Record<string, unknown>[];
  rejected: RejectedCandidate[];
}

/** Lista os cortes que um candidato falhou. Vazio = passou em tudo. */
function failedCuts(c: Record<string, unknown>, cuts: Cuts): CutReason[] {
  const motivos: CutReason[] = [];
  if (((c["edge"] as number) ?? -Infinity) < cuts.edge_min) motivos.push("edge");
  if (((c["ev"] as number) ?? -Infinity) < cuts.ev_min) motivos.push("ev");
  if ((c["xi_confirmado"] as boolean) !== true) motivos.push("titular");
  if (((c["amostra_jogos"] as number) ?? 0) < cuts.amostra_min) motivos.push("amostra");
  return motivos;
}

/** Avalia todos os candidatos: separa aprovados (passam em tudo, ordenados por EV
 * desc) dos reprovados (com o motivo de cada corte falhado). Lista vazia é válida. */
export function evaluateCandidates(
  candidatos: Record<string, unknown>[],
  cuts: Cuts = CUTS_DEFAULT,
): Evaluation {
  const approved: Record<string, unknown>[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const c of candidatos) {
    const motivos = failedCuts(c, cuts);
    if (motivos.length === 0) approved.push(c);
    else rejected.push({ ...c, motivos });
  }
  approved.sort((a, b) => (b["ev"] as number) - (a["ev"] as number));
  return { approved, rejected };
}

/** Mantém só candidatos com valor real (edge/ev acima do corte, titular confirmado,
 * amostra suficiente). Ordena por EV desc. Lista vazia é resultado válido. */
export function filterCandidates(
  candidatos: Record<string, unknown>[],
  cuts: Cuts = CUTS_DEFAULT,
): Record<string, unknown>[] {
  return evaluateCandidates(candidatos, cuts).approved;
}
