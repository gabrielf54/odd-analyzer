import { MARKETS, settleField } from "../model/markets.js";

/** resultado 0/1 de um over: stat real do jogador > linha. Linhas são .5 (sem empate). */
export function resultadoFor(playerStat: Record<string, unknown>, statField: string, linha: number): number {
  return Number(playerStat?.[statField] ?? 0) > linha ? 1 : 0;
}

export interface SettleInstruction {
  event_id: string;
  jogador: string;
  linha: number;
  market_type: string;
  resultado: number;
}

/** Liquida as linhas de PLAYER PROP de um ledger contra o /player-stats/ do jogo.
 * Casa por `player_id` (stats-id; eventPlayerStats não traz nome). Usa o
 * `settle_field` do mercado — o que a CASA paga (desarme: won_tackle, não
 * total_tackle). Mercados de partida e linhas sem match são ignorados (pula). */
export function settlePlayerRows(ledger: any[], playerStats: any[]): SettleInstruction[] {
  const byId = new Map(playerStats.map((p) => [String(p.player_id), p]));
  const out: SettleInstruction[] = [];
  for (const row of ledger) {
    const mkt = MARKETS[row.market_type];
    if (!mkt || mkt.nivel !== "jogador") continue; // partida: settle por placar/stats, à parte
    const stat = byId.get(String(row.player_id));
    if (!stat) continue; // sem match → não liquida (fail-closed)
    const field = settleField(row.market_type);
    if (!field) continue;
    out.push({
      event_id: row.event_id, jogador: row.jogador, linha: Number(row.linha),
      market_type: row.market_type, resultado: resultadoFor(stat, field, Number(row.linha)),
    });
  }
  return out;
}
