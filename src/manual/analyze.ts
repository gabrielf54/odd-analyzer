import { MARKETS, baselineFor, populacaoFor, populacaoMotivo, PLAYER_MARKET_KEYS, type MarketSpec } from "../model/markets.js";
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
import { matchPlayerOdds, type OddsMatched } from "./matchOdds.js";
import { normalize } from "../crosswalk/match.js";
import { ladderDevig } from "../value/ladderDevig.js";
import { pickBestPrice } from "../collect/lineShop.js";
import { flagDivergences } from "../collect/antiTrap.js";
import { logInfo } from "../lib/log.js";
import type { ManualOddsInput, ManualOddsLine } from "./schema.js";

export interface AnalyzeManualOpts {
  repo?: any;
  reviewerFn?: ReviewerFn;
  diagnostics?: boolean;
  // `input.odds` já vem UNIFICADO (da odds_unificadas): pula pickBestPrice/flagDivergences
  // e usa `divergencias` injetado. Garante que a análise consome EXATAMENTE o espelho.
  // Sem a flag, comporta-se como antes (calcula do cru) — retrocompatível p/ os testes diretos.
  alreadyUnified?: boolean;
  divergencias?: any[];
}

const PLAYER_MARKETS = new Set(PLAYER_MARKET_KEYS);

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
  const tStart = Date.now(); // p/ medir o tempo total da análise (achar gargalo)
  const repo = opts.repo ?? new InMemoryRepo();
  const reviewerFn = opts.reviewerFn ?? reviewCandidates;

  const event = normalizeEvent(await client.getEvent(input.event_id));
  const leagueId = event.league_id ?? null;
  // Mercados de jogador exigem stats-ids: a escalação vem em lineup-namespace
  // (que dá 404 no playerStats). CrosswalkStatsProvider resolve por nome — mesma
  // estratégia do fluxo ao vivo provado. Mercados de partida não usam squad.
  const stats = new CrosswalkStatsProvider(new BSDStatsProvider(client), client);
  const overrides = await repo.listCrosswalk();

  // LINE SHOPPING (STATUS §3 frente A+C): antes de analisar, (1) marca divergências
  // cross-casa p/ REVISÃO (detector de armadilha §5.4 — nunca aposta/rejeita sozinho) e
  // (2) colapsa as N casas de cada (jogador,mercado,linha) na de MELHOR preço. Com 1 casa
  // (fluxo manual de hoje) é no-op. As funções são puras (src/collect).
  // Quando o caller já passou o ESPELHO (odds_unificadas), reusa-o; senão calcula do cru
  // (mesma função pura → resultado idêntico). O que a tela mostra É o que entra aqui.
  const divergencias = opts.divergencias ?? flagDivergences(input.odds);
  const odds: any[] = opts.alreadyUnified ? (input.odds as any[]) : pickBestPrice(input.odds);

  const byMarket = groupByMarket(odds);
  const allCandidates: any[] = [];
  const jogadores_sem_match: any[] = [];

  logInfo("analise", `analisando ${event.jogo ?? event.id}`, { event_id: event.id, mercados: [...byMarket.keys()], casas: [...new Set(input.odds.map((l) => l.book))], divergencias: divergencias.length });

  for (const [marketKey, lines] of byMarket) {
    const market: MarketSpec | undefined = MARKETS[marketKey];
    if (market == null) continue; // schema já filtrou; defensivo
    const t0 = Date.now();
    let cands: any[];
    if (PLAYER_MARKETS.has(marketKey)) {
      cands = await playerCandidates(event, market, stats, lines, leagueId, overrides, jogadores_sem_match, input.escopo_historico);
    } else {
      const provider = new ManualOdds(lines.map((l) => ({
        entidade: l.entidade, linha: l.linha, odd_over: l.odd_over,
        // null (não 0): sem o outro lado, o builder cai no ramo conservador
        // (sem_devig). 0 cairia no de-vig e estouraria impliedProb(0) — bug do 1x2
        // só-over, que isenta o under no schema (ver schema.ts) e quebrava a análise.
        odd_under: l.odd_under ?? null, book: l.book,
        // line shopping: carrega as casas comparadas até o candidato de PARTIDA.
        casas_comparadas: (l as any).casas_comparadas ?? null,
      })));
      cands = market.kind === "contagem"
        ? await matchCount(event, market, stats, await provider.lines())
        : await runMatch(event, market, stats, provider);
    }
    allCandidates.push(...cands);
    // Checkpoint COM tempo: cada mercado vira uma linha após processar → você vê o
    // andamento E o ms de cada um (acha o gargalo sem inundar o log).
    logInfo("analise", `mercado analisado: ${market.label}`, { mercado: marketKey, linhas: lines.length, candidatos: cands.length, ms: Date.now() - t0 });
  }

  const { approved, rejected } = evaluateCandidates(allCandidates);
  const ranked = rankCandidates(approved, leagueId);
  const tIa = Date.now();
  const { candidatos: revisados, ia } = await reviewerFn(ranked, { jogo: event.jogo ?? event.id });
  logInfo("analise", "revisão da IA concluída", { candidatos_revisados: ranked.length, ms: Date.now() - tIa });

  // Dedup: 1 entrada por jogador descasado. Chaveia por nome NORMALIZADO (não a string
  // crua) — senão "Álex Baena"/"Alex Baena"/"Baena, Alex" contam como 3 perdidos sendo 1
  // jogador, inflando a contagem que o front mostra. Mantém a 1ª grafia vista.
  const semMatchUnico = [...new Map(jogadores_sem_match.map((j) => [normalize(j.nome_casa), j])).values()];

  // Pré-lineup (escalação não confirmada) → algum candidato fica "provavel".
  // N1: a UI mostra "análise provisória — aguarde a escalação (~1h antes)" e
  // nenhum candidato sai recomendado firme (ver rankCandidates).
  const pendente_lineup = revisados.some((c: any) => c.titularidade === "provavel");

  // Badge de população (texto, fora do money-path): o front mostra o selo + o
  // porquê de uma linha não ganhar estrela. Derivado da liga, nunca do usuário.
  const populacao = populacaoFor(leagueId);
  const result = {
    jogo: event.jogo,
    populacao,
    populacao_motivo: populacaoMotivo(populacao),
    pendente_lineup,
    candidatos: revisados,
    reprovados: opts.diagnostics ? rejected : [],
    jogadores_sem_match: semMatchUnico,
    linhas_rejeitadas: input.linhas_rejeitadas,
    // Line shopping: divergências cross-casa marcadas p/ REVISÃO (não bloqueiam nada).
    divergencias,
    ia,
  };

  // Persiste o resultado COMPLETO (fonte de verdade; o front recupera daqui na
  // hidratação → sobrevive a localStorage falho / cache limpo / outro dispositivo).
  await repo.saveManualResult(event.id, result, new Date().toISOString());

  // Loop forward (I7): registra TODO candidato com edge>0 (o universo de "valor"
  // do modelo) no paper_ledger p/ calibração/CLV. Upsert idempotente. O subconjunto
  // a aposta de valor recomendada é o recomendado/pronto_para_apostar (N1 + mercado validado) — não filtra aqui.
  const ledgerRows = revisados
    .filter((c: any) => typeof c.edge === "number" && c.edge > 0)
    .map((c: any) => ({
      event_id: event.id, jogador: c.jogador, player_id: c.player_id ?? null,
      linha: c.linha, market_type: c.market_type, odd_flag: c.odd,
      prob_modelo: c.prob_modelo, prob_devig: c.prob_devig, edge: c.edge, ev: c.ev,
      // NB: a provenance de `book` no ledger fica DIFERIDA p/ o go-live do coletor (precisa
      // da migração add_book_to_paper_ledger, aplicada COM o dono). A colisão multi-casa
      // que motivava isso já não ocorre — pickBestPrice colapsa p/ 1 book/linha antes daqui.
    }));
  if (ledgerRows.length) await repo.saveLedger(ledgerRows);

  logInfo("analise", "análise concluída", { candidatos: revisados.length, sem_match: semMatchUnico.length, pendente_lineup, ms_total: Date.now() - tStart });

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

  if (market.ladder) {
    // Escada one-sided (passes): a casa dá vários degraus "N+" por jogador. Agrupa os
    // degraus por jogador, computa a forma UMA vez, e de-viga a escada inteira p/ a prob
    // justa de cada degrau (em vez da implícita crua, que subestima o edge).
    const rungsByPlayer = new Map<string, OddsMatched[]>();
    for (const od of casados) {
      const arr = rungsByPlayer.get(od.player_id);
      if (arr) arr.push(od); else rungsByPlayer.set(od.player_id, [od]);
    }
    for (const [pid, rungs] of rungsByPlayer) {
      const entity = byId.get(pid);
      if (!entity) continue;
      const isHome = entity.team_id === homeId;
      const titularidade = xiTeamIds.size > 0 ? (xiTeamIds.has(pid) ? "confirmado" : "fora_do_xi") : "provavel";
      const ctx = {
        event, entity_team_id: entity.team_id ?? entity.id, is_home: isHome,
        opp_team_id: isHome ? awayId : homeId, league_avg_conceded: base,
        xi_team_ids: xiTeamIds, escopo_historico: scope, posicao: entity.posicao ?? "",
      };
      const rate = await stats.entityRate(entity.id, market, ctx);
      if (rate == null) continue;
      const ladder = ladderDevig(rungs.map((r) => ({ linha: r.linha, odd: r.odd_over })));
      const devigByLinha = new Map(ladder.rungs.map((dr) => [dr.linha, dr]));
      for (const od of rungs) {
        const dr = devigByLinha.get(od.linha);
        out.push(buildCandidate({
          jogador: entity.name, linha: od.linha, odd_over: od.odd_over, odd_under: od.odd_under,
          prob_modelo: probOverLine(rate.mu, od.linha, market.nb_dispersion), mu: rate.mu,
          minutos_esperados: rate.minutos_esperados, xi_confirmado: rate.xi_confirmado,
          amostra_jogos: rate.amostra_jogos, concedido_adversario: rate.concedido_adversario,
          incerteza: rate.incerteza, market_type: market.key, player_id: entity.id, trace: rate.trace,
          posicao: entity.posicao ?? null, titularidade,
          concedido_posicao: rate.concedido_posicao ?? null,
          stats_detalhadas: rate.stats_detalhadas ?? null,
          posse_adversario: rate.posse_adversario ?? null,
          book: od.book ?? null, casas_comparadas: (od as any).casas_comparadas ?? null,
          devig: dr ? { prob: dr.prob_devig, sem_devig: dr.sem_devig } : null,
        }));
      }
    }
    return out;
  }

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
      posse_adversario: rate.posse_adversario ?? null,
      book: od.book ?? null, casas_comparadas: (od as any).casas_comparadas ?? null,
    }));
  }
  return out;
}
