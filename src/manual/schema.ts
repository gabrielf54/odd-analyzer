import { z } from "zod";
import { MARKET_KEYS, PLAYER_MARKET_KEYS } from "../model/markets.js";

// Fonte ÚNICA: derivam de MARKETS (model). Mercado novo no motor é aceito na borda
// sem re-listar aqui — corrige o bug de `faltas` ser rejeitada no parse (2026-06-11).
const MARKET_TYPES = MARKET_KEYS;
const PLAYER_MARKETS = new Set(PLAYER_MARKET_KEYS);

/** Linha crua do JSON (pré-validação semântica). */
const rawLineSchema = z.object({
  market_type: z.string(),
  entidade: z.string(),
  linha: z.number().optional(),
  odd_over: z.number(),
  odd_under: z.number().nullish(),
  odd_draw: z.number().nullish(),
  book: z.string().default("manual"),
});

const bodySchema = z.object({
  event_id: z.string(),
  coletado_em: z.string(),
  odds: z.array(z.unknown()),
  escopo_historico: z.enum(["todos", "selecao", "clube"]).default("todos"),
});

export interface ManualOddsLine {
  market_type: string;
  entidade: string;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  /** Só 1X2 (`vitoria`): odd do EMPATE. Ausente/null nos over/under comuns. */
  odd_draw?: number | null;
  book: string;
}

export interface LinhaRejeitada { linha_crua: unknown; motivo: string; }

export interface ManualOddsInput {
  event_id: string;
  coletado_em: string;
  odds: ManualOddsLine[];
  linhas_rejeitadas: LinhaRejeitada[];
  escopo_historico: string;
}

/** Valida o JSON colado. Lança em erro estrutural (body). Erros por-linha NÃO
 * lançam — vão para linhas_rejeitadas, para o operador inspecionar o que a
 * IA/casa mandou torto. O que não passa nunca entra no money-path. */
export function parseManualOdds(body: unknown): ManualOddsInput {
  const b = bodySchema.parse(body); // lança se faltar event_id/coletado_em/odds
  const odds: ManualOddsLine[] = [];
  const linhas_rejeitadas: LinhaRejeitada[] = [];

  for (const raw of b.odds) {
    const p = rawLineSchema.safeParse(raw);
    if (!p.success) { linhas_rejeitadas.push({ linha_crua: raw, motivo: "formato inválido da linha" }); continue; }
    const l = p.data;
    if (!MARKET_TYPES.includes(l.market_type)) {
      linhas_rejeitadas.push({ linha_crua: raw, motivo: `market_type desconhecido: ${l.market_type}` }); continue;
    }
    if (l.odd_over <= 1.01) {
      linhas_rejeitadas.push({ linha_crua: raw, motivo: "odd_over deve ser > 1.01" }); continue;
    }
    if (l.odd_under != null && l.odd_under <= 1.01) {
      linhas_rejeitadas.push({ linha_crua: raw, motivo: "odd_under deve ser > 1.01" }); continue;
    }
    if (l.odd_draw != null && l.odd_draw <= 1.01) {
      linhas_rejeitadas.push({ linha_crua: raw, motivo: "odd_draw deve ser > 1.01" }); continue;
    }
    const isPlayer = PLAYER_MARKETS.has(l.market_type);
    if (isPlayer) {
      if (l.entidade === "partida" || l.linha == null) {
        linhas_rejeitadas.push({ linha_crua: raw, motivo: "mercado de jogador exige entidade (nome) e linha" }); continue;
      }
    } else if (l.market_type !== "vitoria") {
      // gols/escanteios: totais precisam dos dois lados p/ de-vig
      if (l.odd_under == null || l.linha == null) {
        linhas_rejeitadas.push({ linha_crua: raw, motivo: "mercado de partida (totais) exige os dois lados e linha" }); continue;
      }
    }
    odds.push({
      market_type: l.market_type, entidade: l.entidade, linha: l.linha ?? 0,
      odd_over: l.odd_over, odd_under: l.odd_under ?? null, odd_draw: l.odd_draw ?? null, book: l.book,
    });
  }
  return { event_id: b.event_id, coletado_em: b.coletado_em, odds, linhas_rejeitadas, escopo_historico: b.escopo_historico };
}
