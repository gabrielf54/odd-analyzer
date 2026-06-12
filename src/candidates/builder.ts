import { fairProbOver, impliedProb } from "../value/devig.js";
import { edgeEv } from "../value/ev.js";
import { finalizeTrace, type RateTrace } from "../model/trace.js";
import { ALERTA_MINUTOS_THRESHOLD } from "../model/params.js";
import { formaTendencia, type StatsDetalhadas } from "../model/detailedStats.js";

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
  stats_detalhadas?: StatsDetalhadas | null;
  posse_adversario?: number | null;
  // Override de de-vig (de-vig de escada one-sided, ver value/ladderDevig). Quando
  // presente, usa esta prob justa em vez de calcular da odd_under (que não existe na
  // escada). sem_devig acompanha (false = a escada ajustou; true = fallback conservador).
  devig?: { prob: number; sem_devig: boolean } | null;
}

/** Monta o dossiê de UM candidato. Toda a matemática (de-vig, edge, EV) vem daqui
 * — a IA nunca calcula. Chaves em snake_case (fluem p/ API/DB/IA). */
export function buildCandidate(a: BuildCandidateArgs): Record<string, unknown> {
  // Só over (odd_under ausente OU inválido ≤ 1): sem o outro lado não dá pra tirar
  // a margem. Usamos a implícita CRUA do over — teste conservador (margem inflada →
  // mais difícil de passar), nunca sinaliza valor-fantasma vindo só da margem.
  // O `<= 1.0` é defesa em profundidade: blinda contra um 0/lado-ausente que vaze de
  // qualquer borda (evita o throw de impliedProb numa odd inválida).
  const semDevig = a.devig ? a.devig.sem_devig : (a.odd_under == null || a.odd_under <= 1.0);
  const prob_devig = a.devig ? a.devig.prob : (semDevig ? impliedProb(a.odd_over) : fairProbOver(a.odd_over, a.odd_under as number));
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
    alerta_minutos: a.minutos_esperados < ALERTA_MINUTOS_THRESHOLD,
    concedido_posicao: a.concedido_posicao ?? null,
    stats_detalhadas: a.stats_detalhadas ?? null,
    // I5: rótulo DESCRITIVO de forma recente (texto p/ a IA citar). Derivado do
    // stats_detalhadas que já está no candidato — NÃO entra no cálculo do número.
    forma_tendencia: formaTendencia(a.stats_detalhadas ?? null),
    // I5: posse média do adversário (%) — contexto de confronto p/ a IA. Também
    // DESCRITIVO: não toca prob_modelo/edge/ev (esses vêm só do motor).
    posse_adversario: a.posse_adversario ?? null,
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
