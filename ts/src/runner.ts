import { MARKETS, type MarketSpec } from "./model/markets.js";
import { analisarJogo } from "./pipeline.js";
import { ManualOdds } from "./providers/odds.js";
import { BSDStatsProvider, CrosswalkStatsProvider, OnlyPlayer } from "./providers/stats.js";
import { InMemoryRepo } from "./store/repo.js";
import { analisar as aiAnalista, fakeAnalista } from "./ai/analista.js";

/** Forma real flat de /events/{id}/ → forma aninhada que o pipeline espera. */
export function normalizeEvent(raw: any): any {
  const home = String(raw.home_team ?? "");
  const away = String(raw.away_team ?? "");
  return {
    id: String(raw.id),
    jogo: `${home} x ${away}`,
    league_id: raw.league_id,
    home_team: { id: String(raw.home_team_id ?? ""), name: home },
    away_team: { id: String(raw.away_team_id ?? ""), name: away },
  };
}

export interface RunAnaliseOpts {
  linha?: number;
  oddOver?: number;
  oddUnder?: number;
  usarIa?: boolean;
  repo?: any;
  escopoHistorico?: string;
  leagueId?: unknown;
  oddsProvider?: any;
}

/** Orquestra um run real. nivel=jogador exige playerRef; nivel=partida usa as 2 equipes. */
export async function runAnalise(
  client: any, eventId: string, marketKey: string, playerRef: string | null,
  opts: RunAnaliseOpts = {},
): Promise<{ candidatos: any[]; ia: any }> {
  if (!(marketKey in MARKETS)) throw new Error(`mercado desconhecido: ${marketKey}. Opções: ${Object.keys(MARKETS).join(", ")}`);
  const market: MarketSpec = MARKETS[marketKey]!;

  const rawEvent = await client.getEvent(eventId);
  const event = normalizeEvent(rawEvent);
  let leagueId = opts.leagueId ?? null;
  if (leagueId == null) leagueId = event.league_id;

  const base = new BSDStatsProvider(client);
  let stats: any;
  if (market.nivel === "partida") stats = base;
  else if (playerRef) stats = new OnlyPlayer(new CrosswalkStatsProvider(base, client), playerRef);
  else stats = new CrosswalkStatsProvider(base, client);

  const odds = opts.oddsProvider ?? new ManualOdds([{
    entidade: "partida", linha: opts.linha ?? 0.0,
    odd_over: opts.oddOver ?? 0.0, odd_under: opts.oddUnder ?? 0.0, book: "manual",
  }]);

  const analistaFn = opts.usarIa ? aiAnalista : fakeAnalista;

  return analisarJogo(event, market, stats, odds, opts.repo ?? new InMemoryRepo(), {
    analistaFn, escopoHistorico: opts.escopoHistorico ?? "todos", leagueId,
  });
}
