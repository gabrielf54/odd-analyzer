// Extrai a odd de fechamento (lado over) de um payload de odds da BSD para um
// mercado de PARTIDA + linha. Defensivo: tolera formatos comuns e devolve null
// quando não acha (o CLI então erra de forma limpa). Player prop NÃO usa isto
// (BSD não dá odd de prop — a odd de fechamento é colada manual).
// NOTA: o mapeamento exato do payload da BSD p/ mercados de partida precisa de
// sondagem quando o CLV de partida for ativado (mercados de partida hoje = selados).
export function matchClosingOdd(
  oddsPayload: any, marketType: string, linha: number, book?: string,
): number | null {
  const rows: any[] = Array.isArray(oddsPayload?.odds)
    ? oddsPayload.odds
    : Array.isArray(oddsPayload?.results)
      ? oddsPayload.results
      : Array.isArray(oddsPayload)
        ? oddsPayload
        : [];
  const norm = (s: unknown) => String(s ?? "").toLowerCase();
  const cands = rows.filter((r) => {
    const mt = norm(r.market_type ?? r.market);
    const ln = Number(r.linha ?? r.line ?? r.point);
    const okMarket = mt === norm(marketType) || mt.includes(norm(marketType));
    const okLinha = !Number.isFinite(linha) || ln === linha;
    const okBook = !book || norm(r.book ?? r.bookmaker) === norm(book);
    return okMarket && okLinha && okBook;
  });
  if (!cands.length) return null;
  const r = cands[0];
  const over = Number(r.odd_over ?? r.over ?? r.price_over ?? r.odd);
  return Number.isFinite(over) && over > 1 ? over : null;
}
