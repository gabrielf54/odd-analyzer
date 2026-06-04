import { fairProbOver } from "../value/devig.js";
import { edgeEv } from "../value/ev.js";

export interface BuildCandidateArgs {
  jogador: unknown;
  linha: number;
  odd_over: number;
  odd_under: number;
  prob_modelo: number;
  mu: number;
  minutos_esperados: number;
  xi_confirmado: boolean;
  amostra_jogos: number;
  concedido_adversario: unknown;
  incerteza: unknown;
  market_type: string;
  player_id?: unknown;
}

/** Monta o dossiê de UM candidato. Toda a matemática (de-vig, edge, EV) vem daqui
 * — a IA nunca calcula. Chaves em snake_case (fluem p/ API/DB/IA). */
export function buildCandidate(a: BuildCandidateArgs): Record<string, unknown> {
  const prob_devig = fairProbOver(a.odd_over, a.odd_under);
  const m = edgeEv(a.prob_modelo, prob_devig, a.odd_over);
  return {
    jogador: a.jogador,
    player_id: a.player_id ?? null,
    linha: a.linha,
    odd: a.odd_over,
    prob_modelo: a.prob_modelo,
    prob_devig,
    edge: m.edge,
    ev: m.ev,
    lambda: a.mu,
    minutos_esperados: a.minutos_esperados,
    xi_confirmado: a.xi_confirmado,
    amostra_jogos: a.amostra_jogos,
    concedido_adversario: a.concedido_adversario,
    incerteza: a.incerteza,
    market_type: a.market_type,
  };
}
