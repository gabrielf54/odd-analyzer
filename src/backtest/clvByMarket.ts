// CLV AGREGADO por mercado, entre TODOS os jogos. Função PURA — recebe os CLVs (entrada→
// fechamento) de cada aposta JÁ AGRUPADOS por market_type e devolve, por mercado, a média
// do CLV + IC 95% (bootstrap) + n. Reusa `lineupEdge` (mesma máquina de média+IC do CLV por
// jogo). >0 = peguei preço melhor que o fechamento (a meu favor). IC longe de zero = sinal
// real, não ruído de amostra pequena. Sem I/O — testável em node.
import { lineupEdge } from "./clvSegments.js";

export interface MarketClv {
  market_type: string;
  n: number;
  clv_medio: number;
  lo: number;
  hi: number;
}

/** Agrega o CLV por mercado. `clvsByMarket[mk]` = lista de CLVs-total das apostas daquele
 * mercado. Mercado sem amostra é omitido. Saída ordenada por market_type. */
export function aggregateClvByMarket(
  clvsByMarket: Record<string, number[]>,
  opts: { rng?: () => number } = {},
): MarketClv[] {
  const out: MarketClv[] = [];
  for (const [mk, clvs] of Object.entries(clvsByMarket)) {
    if (!clvs.length) continue;
    const edge = lineupEdge(clvs, { rng: opts.rng });
    out.push({ market_type: mk, n: edge.n, clv_medio: edge.media, lo: edge.lo, hi: edge.hi });
  }
  out.sort((a, b) => a.market_type.localeCompare(b.market_type));
  return out;
}
