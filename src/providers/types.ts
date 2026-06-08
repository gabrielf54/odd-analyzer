import type { MarketSpec } from "../model/markets.js";
import type { RateTrace } from "../model/trace.js";

export interface OddsLine {
  entidade: string;
  linha: number;
  odd_over: number;
  odd_under: number;
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
  concedido_adversario: string;
  incerteza: string;
  trace?: RateTrace;
}

export interface StatsProvider {
  squad(event: any): any[] | Promise<any[]>;
  entityRate(id: unknown, market: MarketSpec, ctx: any): (EntityRate | null) | Promise<EntityRate | null>;
  teamRates(teamId: unknown, ctx: any): any | Promise<any>;
}
