import type { MarketSpec } from "../model/markets.js";

export interface OddsLine {
  entidade: string;
  linha: number;
  odd_over: number;
  odd_under: number;
  book: string;
  odd_draw?: number | null;
}

export interface OddsProvider {
  linhas(event: any, market: MarketSpec): OddsLine[] | Promise<OddsLine[]>;
}

export interface EntityTaxa {
  mu: number;
  minutos_esperados: number;
  xi_confirmado: boolean;
  amostra_jogos: number;
  concedido_adversario: string;
  incerteza: string;
}

export interface StatsProvider {
  elenco(event: any): any[] | Promise<any[]>;
  entity_taxa(id: unknown, market: MarketSpec, ctx: any): (EntityTaxa | null) | Promise<EntityTaxa | null>;
  team_rates(teamId: unknown, ctx: any): any | Promise<any>;
}
