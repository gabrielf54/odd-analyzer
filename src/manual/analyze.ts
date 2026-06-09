import { MARKETS, baselineFor, type MarketSpec } from "../model/markets.js";
import { probOverLine } from "../model/sotModel.js";
import { matchCount, runMatch } from "../pipeline.js";
import { buildCandidate } from "../candidates/builder.js";
import { evaluateCandidates } from "../candidates/filter.js";
import { BSDStatsProvider } from "../providers/stats.js";
import { ManualOdds } from "../providers/odds.js";
import { InMemoryRepo } from "../store/repo.js";
import { fakeAnalyst as defaultFake } from "../ai/analyst.js";
import { normalizeEvent } from "../runner.js";
import { matchPlayerOdds } from "./matchOdds.js";
import type { ManualOddsInput, ManualOddsLine } from "./schema.js";

export interface AnalyzeManualOpts {
  repo?: any;
  analystFn?: (cands: any[], ctx: any) => any | Promise<any>;
  diagnostics?: boolean;
}

const PLAYER_MARKETS = new Set(["sot", "finalizacoes", "desarmes"]);

function groupByMarket(odds: ManualOddsLine[]): Map<string, ManualOddsLine[]> {
  const m = new Map<string, ManualOddsLine[]>();
  for (const l of odds) {
    const bucket = m.get(l.market_type);
    if (bucket) bucket.push(l);
    else m.set(l.market_type, [l]);
  }
  return m;
}

/** Analisa um jogo a partir de odds coladas, cobrindo TODOS os mercados presentes.
 * Mercados de jogador casam a odd a cada jogador (matchPlayerOdds); mercados de
 * partida reusam matchCount/runMatch do pipeline. Filtra uma vez, IA uma vez,
 * persiste uma vez. O motor (model/value) não muda. */
export async function analyzeManual(
  client: any, input: ManualOddsInput, opts: AnalyzeManualOpts = {},
): Promise<any> {
  const repo = opts.repo ?? new InMemoryRepo();
  const analystFn = opts.analystFn ?? defaultFake;

  const event = normalizeEvent(await client.getEvent(input.event_id));
  const leagueId = event.league_id ?? null;
  const stats = new BSDStatsProvider(client);
  const overrides = await repo.listCrosswalk();

  const byMarket = groupByMarket(input.odds);
  const allCandidates: any[] = [];
  const jogadores_sem_match: any[] = [];

  for (const [marketKey, lines] of byMarket) {
    const market: MarketSpec | undefined = MARKETS[marketKey];
    if (market == null) continue; // schema já filtrou; defensivo
    if (PLAYER_MARKETS.has(marketKey)) {
      const cands = await playerCandidates(event, market, stats, lines, leagueId, overrides, jogadores_sem_match);
      allCandidates.push(...cands);
    } else {
      const provider = new ManualOdds(lines.map((l) => ({
        entidade: l.entidade, linha: l.linha, odd_over: l.odd_over,
        odd_under: l.odd_under ?? 0, book: l.book,
      })));
      const cands = market.kind === "contagem"
        ? await matchCount(event, market, stats, await provider.lines())
        : await runMatch(event, market, stats, provider);
      allCandidates.push(...cands);
    }
  }

  const { approved, rejected } = evaluateCandidates(allCandidates);
  const ia = await analystFn(approved, { jogo: event.jogo ?? event.id });

  await repo.saveAnalysis(event.id, {
    jogo: event.jogo, market_type: "manual_todos", candidatos: approved, llm_resultado: ia,
  });

  const hideTrace = (c: any) => {
    if (opts.diagnostics || !c || c.trace === undefined) return c;
    const { trace, ...rest } = c; return rest;
  };
  return {
    jogo: event.jogo,
    candidatos: approved.map(hideTrace),
    reprovados: opts.diagnostics ? rejected : [],
    jogadores_sem_match,
    linhas_rejeitadas: input.linhas_rejeitadas,
    ia,
  };
}

/** Calcula candidatos de UM mercado de jogador, anexando a odd específica de cada
 * jogador casado. Jogadores sem match acumulam em `semMatchSink`. */
async function playerCandidates(
  event: any, market: MarketSpec, stats: any, lines: ManualOddsLine[],
  leagueId: unknown, overrides: Record<string, string>, semMatchSink: any[],
): Promise<any[]> {
  const squad: any[] = await stats.squad(event);
  const squadForMatch = squad.map((p) => ({ id: String(p.id), name: p.name }));
  const { casados, sem_match } = matchPlayerOdds(lines, squadForMatch, overrides);
  for (const sm of sem_match) semMatchSink.push({ ...sm, market_type: market.key });

  const homeId = String(event.home_team?.id ?? "");
  const awayId = String(event.away_team?.id ?? "");
  const xiTeamIds: Set<string> = typeof stats.xiIds === "function" ? await stats.xiIds(event) : new Set();
  const base = baselineFor(market, leagueId);
  const byId = new Map(squad.map((p) => [String(p.id), p]));
  const out: any[] = [];

  for (const od of casados) {
    const entity = byId.get(od.player_id);
    if (!entity) continue;
    const isHome = entity.team_id === homeId;
    const ctx = {
      event, entity_team_id: entity.team_id ?? entity.id, is_home: isHome,
      opp_team_id: isHome ? awayId : homeId, league_avg_conceded: base,
      xi_team_ids: xiTeamIds, escopo_historico: "todos",
    };
    const rate = await stats.entityRate(entity.id, market, ctx);
    if (rate == null) continue;
    out.push(buildCandidate({
      jogador: entity.name, linha: od.linha, odd_over: od.odd_over, odd_under: od.odd_under,
      prob_modelo: probOverLine(rate.mu, od.linha, market.nb_dispersion), mu: rate.mu,
      minutos_esperados: rate.minutos_esperados, xi_confirmado: rate.xi_confirmado,
      amostra_jogos: rate.amostra_jogos, concedido_adversario: rate.concedido_adversario,
      incerteza: rate.incerteza, market_type: market.key, player_id: entity.id, trace: rate.trace,
    }));
  }
  return out;
}
