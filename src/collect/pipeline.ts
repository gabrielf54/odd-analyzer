// Pipeline de COLETA sob demanda: compõe as peças puras numa só chamada.
//   collectAll (dispara as casas, "pula e avisa") → normalizeByBook (de-para de CADA
//   casa) → flagDivergences (anti-armadilha, só revisão) → pickBestPrice (line shopping).
// Tudo PURO (collectors + resolução de tabela injetados) → testável offline. O CLI
// (src/cli/collectOdds.ts) liga o fetch ao vivo + grava no `odds`. Ver STATUS §3/§6.

import { collectAll, type OddsCollector, type CollectContext, type CasaStatus } from "./types.js";
import { normalizeCollected, type RawCollectedLine, type HouseMarketTable, type NormalizedLine } from "./normalizer.js";
import { pickBestPrice, type ShoppedLine } from "./lineShop.js";
import { flagDivergences, type DivergenceFlag } from "./antiTrap.js";
import { tableFor } from "./tables.js";
import type { LinhaRejeitada } from "../manual/schema.js";

export interface CollectOddsResult {
  linhas: ShoppedLine[];               // melhor preço por (jogador, mercado, linha) — p/ EXIBIR
  linhas_por_casa: NormalizedLine[];   // TODAS as casas — é o que se GRAVA no `odds` (PK inclui
                                       // book). A análise re-faz o line shopping/divergência.
  linhas_rejeitadas: LinhaRejeitada[];
  divergencias: DivergenceFlag[];      // só revisão — nunca aposta/rejeita sozinho
  casas: CasaStatus[];
}

/** Normaliza raws de VÁRIAS casas: agrupa por book e aplica o de-para de CADA uma
 * (collectAll devolve as casas misturadas). `resolveTable` injetável p/ teste. */
export function normalizeByBook(
  raws: RawCollectedLine[],
  resolveTable: (book: string) => HouseMarketTable = tableFor,
): { linhas: NormalizedLine[]; linhas_rejeitadas: LinhaRejeitada[] } {
  const byBook = new Map<string, RawCollectedLine[]>();
  for (const r of raws) {
    const arr = byBook.get(r.book);
    if (arr) arr.push(r); else byBook.set(r.book, [r]);
  }
  const linhas: NormalizedLine[] = [];
  const linhas_rejeitadas: LinhaRejeitada[] = [];
  for (const [book, group] of byBook) {
    const res = normalizeCollected(group, resolveTable(book));
    linhas.push(...res.linhas);
    linhas_rejeitadas.push(...res.linhas_rejeitadas);
  }
  return { linhas, linhas_rejeitadas };
}

/** Coleta de odds de uma partida em N casas → linhas canônicas de MELHOR PREÇO, com
 * rejeições, flags de divergência e status por casa. PURO (collectors injetados). */
export async function collectOdds(
  collectors: OddsCollector[],
  ctx: CollectContext,
  resolveTable: (book: string) => HouseMarketTable = tableFor,
): Promise<CollectOddsResult> {
  const { raws, casas } = await collectAll(collectors, ctx);
  const { linhas: norm, linhas_rejeitadas } = normalizeByBook(raws, resolveTable);
  const divergencias = flagDivergences(norm);
  const linhas = pickBestPrice(norm);
  return { linhas, linhas_por_casa: norm, linhas_rejeitadas, divergencias, casas };
}
