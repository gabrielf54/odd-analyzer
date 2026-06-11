import { MARKETS, baselineFor, type MarketSpec } from "../model/markets.js";
import { probOverLine } from "../model/sotModel.js";
import { matchCount, runMatch } from "../pipeline.js";
import { buildCandidate } from "../candidates/builder.js";
import { evaluateCandidates } from "../candidates/filter.js";
import { BSDStatsProvider, CrosswalkStatsProvider } from "../providers/stats.js";
import { ManualOdds } from "../providers/odds.js";
import { InMemoryRepo } from "../store/repo.js";
import { rankCandidates } from "../candidates/rank.js";
import { reviewCandidates, type ReviewerFn } from "../ai/reviewer.js";
import { normalizeEvent } from "../runner.js";
import { matchPlayerOdds } from "./matchOdds.js";
import type { ManualOddsInput, ManualOddsLine } from "./schema.js";

export interface AnalyzeManualOpts {
  repo?: any;
  reviewerFn?: ReviewerFn;
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
 * persiste uma vez. O motor (model/value) não muda.
 * `trace` e `stats_detalhadas` sempre presentes nos candidatos (o drawer do front
 * precisa deles). `reprovados` fica gateado por `diagnostics`. */
export async function analyzeManual(
  client: any, input: ManualOddsInput, opts: AnalyzeManualOpts = {},
): Promise<any> {
  const repo = opts.repo ?? new InMemoryRepo();
  const reviewerFn = opts.reviewerFn ?? reviewCandidates;

  const event = normalizeEvent(await client.getEvent(input.event_id));
  const leagueId = event.league_id ?? null;
  // Mercados de jogador exigem stats-ids: a escalação vem em lineup-namespace
  // (que dá 404 no playerStats). CrosswalkStatsProvider resolve por nome — mesma
  // estratégia do fluxo ao vivo provado. Mercados de partida não usam squad.
  const stats = new CrosswalkStatsProvider(new BSDStatsProvider(client), client);
  const overrides = await repo.listCrosswalk();

  const byMarket = groupByMarket(input.odds);
  const allCandidates: any[] = [];
  const jogadores_sem_match: any[] = [];

  for (const [marketKey, lines] of byMarket) {
    const market: MarketSpec | undefined = MARKETS[marketKey];
    if (market == null) continue; // schema já filtrou; defensivo
    if (PLAYER_MARKETS.has(marketKey)) {
      const cands = await playerCandidates(event, market, stats, lines, leagueId, overrides, jogadores_sem_match, input.escopo_historico);
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
  const ranked = rankCandidates(approved);
  const { candidatos: revisados, ia } = await reviewerFn(ranked, { jogo: event.jogo ?? event.id });

  // Dedup: 1 entrada por jogador descasado (várias linhas/mercados geram cópias
  // idênticas — candidatos vêm do nome vs squad, não do mercado). Mantém a 1ª vista.
  const semMatchUnico = [...new Map(jogadores_sem_match.map((j) => [j.nome_casa, j])).values()];

  // Pré-lineup (escalação não confirmada) → algum candidato fica "provavel".
  // N1: a UI mostra "análise provisória — aguarde a escalação (~1h antes)" e
  // nenhum candidato sai recomendado firme (ver rankCandidates).
  const pendente_lineup = revisados.some((c: any) => c.titularidade === "provavel");

  const result = {
    jogo: event.jogo,
    pendente_lineup,
    candidatos: revisados,
    reprovados: opts.diagnostics ? rejected : [],
    jogadores_sem_match: semMatchUnico,
    linhas_rejeitadas: input.linhas_rejeitadas,
    ia,
  };

  // Persiste o resultado COMPLETO (fonte de verdade; o front recupera daqui na
  // hidratação → sobrevive a localStorage falho / cache limpo / outro dispositivo).
  await repo.saveManualResult(event.id, result, new Date().toISOString());

  // Loop forward (I7): registra TODO candidato com edge>0 (o universo de "valor"
  // do modelo) no paper_ledger p/ calibração/CLV. Upsert idempotente. O subconjunto
  // "apostado" é o recomendado/pronto_para_apostar (N1 + money_ready) — não filtra aqui.
  const ledgerRows = revisados
    .filter((c: any) => typeof c.edge === "number" && c.edge > 0)
    .map((c: any) => ({
      event_id: event.id, jogador: c.jogador, player_id: c.player_id ?? null,
      linha: c.linha, market_type: c.market_type, odd_flag: c.odd,
      prob_modelo: c.prob_modelo, prob_devig: c.prob_devig, edge: c.edge, ev: c.ev,
    }));
  if (ledgerRows.length) await repo.saveLedger(ledgerRows);

  return result;
}

/** Calcula candidatos de UM mercado de jogador, anexando a odd específica de cada
 * jogador casado. Jogadores sem match acumulam em `semMatchSink`. */
async function playerCandidates(
  event: any, market: MarketSpec, stats: any, lines: ManualOddsLine[],
  leagueId: unknown, overrides: Record<string, string>, semMatchSink: any[],
  scope: string,
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
    const titularidade = xiTeamIds.size > 0
      ? (xiTeamIds.has(od.player_id) ? "confirmado" : "fora_do_xi")
      : "provavel";
    const ctx = {
      event, entity_team_id: entity.team_id ?? entity.id, is_home: isHome,
      opp_team_id: isHome ? awayId : homeId, league_avg_conceded: base,
      xi_team_ids: xiTeamIds, escopo_historico: scope, posicao: entity.posicao ?? "",
    };
    const rate = await stats.entityRate(entity.id, market, ctx);
    if (rate == null) continue;
    out.push(buildCandidate({
      jogador: entity.name, linha: od.linha, odd_over: od.odd_over, odd_under: od.odd_under,
      prob_modelo: probOverLine(rate.mu, od.linha, market.nb_dispersion), mu: rate.mu,
      minutos_esperados: rate.minutos_esperados, xi_confirmado: rate.xi_confirmado,
      amostra_jogos: rate.amostra_jogos, concedido_adversario: rate.concedido_adversario,
      incerteza: rate.incerteza, market_type: market.key, player_id: entity.id, trace: rate.trace,
      posicao: entity.posicao ?? null, titularidade,
      concedido_posicao: rate.concedido_posicao ?? null,
      stats_detalhadas: rate.stats_detalhadas ?? null,
    }));
  }
  return out;
}
