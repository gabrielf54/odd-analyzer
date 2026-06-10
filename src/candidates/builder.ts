import { fairProbOver, impliedProb } from "../value/devig.js";
import { edgeEv } from "../value/ev.js";
import { finalizeTrace, type RateTrace } from "../model/trace.js";

export interface BuildCandidateArgs {
  jogador: unknown;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  prob_modelo: number;
  mu: number;
  minutos_esperados: number;
  xi_confirmado: boolean;
  amostra_jogos: number;
  concedido_adversario: unknown;
  incerteza: unknown;
  market_type: string;
  player_id?: unknown;
  trace?: RateTrace;
  posicao?: string | null;
  titularidade?: "confirmado" | "provavel" | "fora_do_xi" | "desconhecido" | null;
  concedido_posicao?: string | null;
}

/** Monta o dossiê de UM candidato. Toda a matemática (de-vig, edge, EV) vem daqui
 * — a IA nunca calcula. Chaves em snake_case (fluem p/ API/DB/IA). */
export function buildCandidate(a: BuildCandidateArgs): Record<string, unknown> {
  // Só over (odd_under ausente): sem o outro lado não dá pra tirar a margem.
  // Usamos a implícita CRUA do over — teste conservador (margem inflada → mais
  // difícil de passar), nunca sinaliza valor-fantasma vindo só da margem.
  const semDevig = a.odd_under == null;
  const prob_devig = semDevig ? impliedProb(a.odd_over) : fairProbOver(a.odd_over, a.odd_under as number);
  const m = edgeEv(a.prob_modelo, prob_devig, a.odd_over);
  const out: Record<string, unknown> = {
    jogador: a.jogador,
    player_id: a.player_id ?? null,
    linha: a.linha,
    odd: a.odd_over,
    prob_modelo: a.prob_modelo,
    prob_devig,
    sem_devig: semDevig,
    edge: m.edge,
    ev: m.ev,
    lambda: a.mu,
    minutos_esperados: a.minutos_esperados,
    xi_confirmado: a.xi_confirmado,
    amostra_jogos: a.amostra_jogos,
    concedido_adversario: a.concedido_adversario,
    incerteza: a.incerteza,
    market_type: a.market_type,
    posicao: a.posicao ?? null,
    titularidade: a.titularidade ?? null,
    alerta_minutos: a.minutos_esperados < 60,
    concedido_posicao: a.concedido_posicao ?? null,
  };
  if (a.trace) {
    out.trace = finalizeTrace(a.trace, {
      alvo: String(a.jogador),
      linha: a.linha,
      probModelo: a.prob_modelo,
      probDevig: prob_devig,
      edge: m.edge,
      ev: m.ev,
    });
  }
  return out;
}
