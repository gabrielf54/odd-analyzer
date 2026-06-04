export interface Cortes {
  edge_min: number;
  ev_min: number;
  amostra_min: number;
}

export const CORTES_DEFAULT: Cortes = { edge_min: 0.04, ev_min: 0.05, amostra_min: 10 };

/** Mantém só candidatos com valor real (edge/ev acima do corte, titular confirmado,
 * amostra suficiente). Ordena por EV desc. Lista vazia é resultado válido. */
export function filterCandidates(
  candidatos: Record<string, unknown>[],
  cuts: Cortes = CORTES_DEFAULT,
): Record<string, unknown>[] {
  const keep = candidatos.filter(
    (c) =>
      (c["edge"] as number) >= cuts.edge_min &&
      (c["ev"] as number) >= cuts.ev_min &&
      (c["xi_confirmado"] as boolean) === true &&
      ((c["amostra_jogos"] as number) ?? 0) >= cuts.amostra_min,
  );
  return keep.sort((a, b) => (b["ev"] as number) - (a["ev"] as number));
}
