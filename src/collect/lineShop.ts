// LINE SHOPPING — o diferencial. Colapsa as N casas de uma mesma (jogador, mercado,
// linha) na de MELHOR PREÇO. Em prop one-sided (só over) o de-vig é a implícita crua
// (1/odd_over), então a MAIOR odd_over = melhor EV = melhor preço (escolha por casa,
// nunca cruzando margem de casas diferentes). Função PURA. Ver STATUS §3 frente A.

import type { ManualOddsLine } from "../manual/schema.js";

/** Linha vencedora do line shopping, com as casas comparadas anexadas (a UI usa p/
 * dizer "melhor odd X na casa Y"). */
export type ShoppedLine = ManualOddsLine & {
  casas_comparadas: { book: string; odd_over: number }[];
};

function groupKey(l: ManualOddsLine): string {
  return `${l.entidade}|${l.market_type}|${l.linha}`;
}

/** Agrupa por (entidade, market_type, linha) e escolhe a casa de MAIOR odd_over.
 * Mantém o odd_under da MESMA casa vencedora (coerência de de-vig). Anexa todas as
 * casas comparadas. Estável: empate fica com a 1ª vista. */
export function pickBestPrice(lines: ManualOddsLine[]): ShoppedLine[] {
  const groups = new Map<string, ManualOddsLine[]>();
  for (const l of lines) {
    const k = groupKey(l);
    const arr = groups.get(k);
    if (arr) arr.push(l); else groups.set(k, [l]);
  }
  const out: ShoppedLine[] = [];
  for (const arr of groups.values()) {
    let best = arr[0]!;
    for (const l of arr) if (l.odd_over > best.odd_over) best = l;
    out.push({
      ...best,
      casas_comparadas: arr.map((l) => ({ book: l.book, odd_over: l.odd_over }))
        .sort((a, b) => b.odd_over - a.odd_over),
    });
  }
  return out;
}
