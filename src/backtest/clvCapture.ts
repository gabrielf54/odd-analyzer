// CLV automático: dada a lista de apostas já logadas (com odd_flag = odd de ENTRADA)
// e as odds ATUAIS (re-coletadas perto do kickoff = fechamento), casa cada aposta à
// sua odd atual e calcula o Closing Line Value. Função PURA → testável, sem I/O. O
// endpoint/serviço aplica os updates no paper_ledger (odd_fechamento/clv/fechamento_em).
import { normalize } from "../crosswalk/match.js";
import { fairProbOver, impliedProb } from "../value/devig.js";

export interface LedgerBetEntry {
  event_id: string;
  jogador: string;
  linha: number;
  market_type: string;
  odd_flag: number | null;
}

/** Odd atual (fechamento). Espelha a forma da odds_unificadas (entidade_norm = identidade
 * normalizada; odd_under nullable p/ mercados só-over). */
export interface CurrentOdd {
  entidade_norm: string;
  market_type: string;
  linha: number;
  odd_over: number;
  odd_under?: number | null;
}

export interface ClosingUpdate {
  event_id: string;
  jogador: string;
  linha: number;
  market_type: string;
  odd_fechamento: number;
  prob_devig_fechamento: number;
  /** odd_flag/odd_fechamento − 1. >0 = peguei preço melhor que o fechamento (bati a linha). */
  clv: number;
}

const key = (entidadeNorm: string, market: string, linha: number) => `${entidadeNorm}|${market}|${linha}`;

/** Para cada aposta COM odd_flag (entrada), acha a odd atual de mesma identidade/mercado/
 * linha e devolve o update de fechamento + CLV. Apostas sem odd_flag (linhas de calibração)
 * ou sem odd atual correspondente são ignoradas (fail-closed). */
export function computeClosingUpdates(bets: LedgerBetEntry[], currentOdds: CurrentOdd[]): ClosingUpdate[] {
  const byKey = new Map<string, CurrentOdd>();
  for (const o of currentOdds) byKey.set(key(o.entidade_norm, o.market_type, Number(o.linha)), o);

  const out: ClosingUpdate[] = [];
  for (const b of bets) {
    if (b.odd_flag == null) continue; // sem entrada → não há CLV a medir
    const o = byKey.get(key(normalize(b.jogador), b.market_type, Number(b.linha)));
    if (!o) continue;
    const closing = Number(o.odd_over);
    if (!(closing > 1)) continue;
    const prob_devig_fechamento = (o.odd_under != null && Number(o.odd_under) > 1)
      ? fairProbOver(closing, Number(o.odd_under))
      : impliedProb(closing);
    out.push({
      event_id: b.event_id, jogador: b.jogador, linha: Number(b.linha), market_type: b.market_type,
      odd_fechamento: closing, prob_devig_fechamento,
      clv: Number(b.odd_flag) / closing - 1, // espelha repo.clv
    });
  }
  return out;
}
