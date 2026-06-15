// PROJEÇÃO odds CRUAS → odds UNIFICADAS (1 por aposta após line shopping), marcando
// divergências. PURA (sem I/O). É a ÚNICA fonte da unificação: a tabela `odds_unificadas`
// é gravada a partir daqui (reprojectUnifiedOdds, em service.ts) e a análise consome o
// mesmo resultado → o que a tela mostra É o que a análise usa. Ver docs/features/odds-unificadas.

import { pickBestPrice } from "./lineShop.js";
import { flagDivergences, type DivergenceFlag } from "./antiTrap.js";
import { normalize } from "../crosswalk/match.js";
import type { ManualOddsLine } from "../manual/schema.js";
import type { UnifiedOddsRow } from "../store/repo.js";

/** Mesma chave de identidade do line shopping/divergência (nome normalizado). */
function key(entidade: string, market: string, linha: number): string {
  return `${normalize(entidade)}|${market}|${linha}`;
}

/** Projeta odds cruas → linhas unificadas + flags de divergência. PURA. */
export function buildUnifiedOdds(
  raw: ManualOddsLine[], eventId: string,
): { linhas: UnifiedOddsRow[]; divergencias: DivergenceFlag[] } {
  const shopped = pickBestPrice(raw);            // vencedoras (melhor preço, com casas_comparadas)
  const divergencias = flagDivergences(raw);     // só revisão (não bloqueia nada)
  const divMap = new Map(divergencias.map((d) => [key(d.entidade, d.market_type, d.linha), d]));

  const linhas: UnifiedOddsRow[] = shopped.map((s) => {
    const d = divMap.get(key(s.entidade, s.market_type, s.linha));
    return {
      event_id: eventId,
      entidade_norm: normalize(s.entidade),
      market_type: s.market_type,
      linha: s.linha,
      entidade: s.entidade,
      odd_over: s.odd_over,
      odd_under: s.odd_under ?? null,
      book: s.book,
      casas_comparadas: s.casas_comparadas,
      divergencia: d != null,
      spread_pp: d?.spread_pp ?? null,
    };
  });
  return { linhas, divergencias };
}
