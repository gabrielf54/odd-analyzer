import { MARKETS, settleField } from "../model/markets.js";

/** Mínimo de minutos p/ uma aposta de PLAYER PROP entrar na calibração. Uma prop
 * (over chutes/desarmes/etc.) pressupõe que o jogador ATUOU; quem entra nos minutos
 * finais (ex.: 16') quase nunca bate a linha e marcaria a previsão como "erro" sem
 * o jogador ter tido a chance — viés de DNP que sujava o forward (Berhalter 16'/0
 * chutes contava como modelo errado). Espelha o filtro ≥60min da calibração offline
 * (audit-player-markets.mts), p/ o forward ser comparável. */
export const MIN_SETTLE_MINUTES = 60;

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

/** Lê o desfecho 1X2 a partir do RÓTULO do jogador. A vitória loga 3 linhas por jogo
 * — "Casa x Fora (1)" (mandante), "(X)" (empate), "(2)" (visitante) — produzidas por
 * `runMatch` (pipeline.ts), o único produtor, que SEMPRE anexa esse sufixo. Sem sufixo
 * reconhecido → "home" (retrocompat com linhas legadas, que eram só do mandante). */
export function outcome1x2FromLabel(jogador: unknown): "home" | "draw" | "away" {
  const s = String(jogador ?? "").trim();
  if (s.endsWith("(2)")) return "away";
  if (s.endsWith("(X)") || s.endsWith("(x)")) return "draw";
  return "home";
}

/** Liquida as linhas de MERCADO DE PARTIDA (gols/vitória) pelo PLACAR final do jogo.
 * gols (partida_totais): over total > linha. vitória (partida_1x2): cada linha é UM
 * desfecho (mandante/empate/visitante) — liquida o LADO certo lido do rótulo (1)/(X)/(2),
 * NÃO "o mandante venceu?" pra todas (bug pré-2026-06-21 que marcava (2)/(X) errado).
 * Escanteios (contagem de partida) liquida por eventStats, fora deste path. Sem placar → []. */
export function settleMatchRows(ledger: any[], ev: { home_score?: unknown; away_score?: unknown }): SettleInstruction[] {
  const hs = Number(ev?.home_score), as = Number(ev?.away_score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return [];
  const out: SettleInstruction[] = [];
  for (const row of ledger) {
    const mkt = MARKETS[row.market_type];
    if (!mkt || mkt.nivel !== "partida") continue;
    let resultado: number;
    if (mkt.kind === "partida_totais") resultado = hs + as > Number(row.linha) ? 1 : 0;
    else if (mkt.kind === "partida_1x2") {
      const lado = outcome1x2FromLabel(row.jogador);
      resultado = lado === "home" ? (hs > as ? 1 : 0)
        : lado === "away" ? (as > hs ? 1 : 0)
          : (hs === as ? 1 : 0);
    } else continue; // escanteios (contagem): precisa de eventStats, não do placar
    out.push({ event_id: row.event_id, jogador: row.jogador, linha: Number(row.linha), market_type: row.market_type, resultado });
  }
  return out;
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
    // DNP/poucos minutos: a prop pressupõe que o jogador atuou. Pula se minutos
    // presentes e < MIN_SETTLE_MINUTES (ausente → liquida, retrocompat). Idempotente:
    // a linha fica pendente em vez de virar "erro" fantasma.
    const min = (stat as Record<string, unknown>).minutes_played;
    if (min != null && Number(min) < MIN_SETTLE_MINUTES) continue;
    const field = settleField(row.market_type);
    if (!field) continue;
    out.push({
      event_id: row.event_id, jogador: row.jogador, linha: Number(row.linha),
      market_type: row.market_type, resultado: resultadoFor(stat, field, Number(row.linha)),
    });
  }
  return out;
}
