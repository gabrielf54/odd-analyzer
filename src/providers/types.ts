import type { MarketSpec } from "../model/markets.js";
import type { RateTrace } from "../model/trace.js";
import type { StatsDetalhadas } from "../model/detailedStats.js";

export interface OddsLine {
  entidade: string;
  linha: number;
  odd_over: number;
  // null quando a casa só dá o over (player prop, 1x2 só-mandante): o builder cai
  // no ramo conservador (sem_devig) em vez de tentar de-vig com lado ausente.
  odd_under: number | null;
  book: string;
  odd_draw?: number | null;
}

export interface OddsProvider {
  lines(event: any, market: MarketSpec): OddsLine[] | Promise<OddsLine[]>;
}

export interface EntityRate {
  mu: number;
  minutos_esperados: number;
  xi_confirmado: boolean;
  amostra_jogos: number;
  // texto leigo da concessão do adversário ("17.0", "n/d (neutro)") OU null quando
  // o mercado neutraliza o confronto (opp_mode "none", ex.: passes — não há eixo).
  concedido_adversario: string | null;
  incerteza: string;
  trace?: RateTrace;
  concedido_posicao?: string | null;
  stats_detalhadas?: StatsDetalhadas;
  // I5 (descritivo, fora do money-path): % média de posse do adversário nos jogos
  // recentes. Vai pra IA como contexto de confronto — NÃO entra no μ/prob/edge.
  posse_adversario?: number | null;
}

export interface StatsProvider {
  squad(event: any): any[] | Promise<any[]>;
  entityRate(id: unknown, market: MarketSpec, ctx: any): (EntityRate | null) | Promise<EntityRate | null>;
  teamRates(teamId: unknown, ctx: any): any | Promise<any>;
}
