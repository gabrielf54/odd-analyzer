import { MARKETS, type MarketSpec } from "./model/markets.js";
import { analyzeMatch } from "./pipeline.js";
import { ManualOdds } from "./providers/odds.js";
import { BSDStatsProvider, CrosswalkStatsProvider, OnlyPlayer } from "./providers/stats.js";
import { InMemoryRepo } from "./store/repo.js";
import { analyze as aiAnalyst, fakeAnalyst } from "./ai/analyst.js";

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

export interface RunAnalyzeOpts {
  linha?: number;
  oddOver?: number;
  oddUnder?: number;
  useAi?: boolean;
  repo?: any;
  historyScope?: string;
  leagueId?: unknown;
  oddsProvider?: any;
  diagnostics?: boolean;
}

/** Orquestra um run real. nivel=jogador exige playerRef; nivel=partida usa as 2 equipes. */
export async function runAnalyze(
  client: any, eventId: string, marketKey: string, playerRef: string | null,
  opts: RunAnalyzeOpts = {},
): Promise<{ candidatos: any[]; reprovados: any[]; ia: any }> {
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

  const analystFn = opts.useAi ? aiAnalyst : fakeAnalyst;

  return analyzeMatch(event, market, stats, odds, opts.repo ?? new InMemoryRepo(), {
    analystFn, historyScope: opts.historyScope ?? "todos", leagueId,
    diagnostics: opts.diagnostics ?? false,
  });
}
