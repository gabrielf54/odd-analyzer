import { buildCandidate } from "./candidates/builder.js";
import { evaluateCandidates } from "./candidates/filter.js";
import { probOverLine } from "./model/sotModel.js";
import { scoreMatrix, probs1x2, probTotalOver } from "./model/matchModel.js";
import { computeRatings, lambdaFromRatings, ratingsEligible, homeAdvFor } from "./model/ratings.js";
import { baselineFor, populacaoFor, ratingsPoolLeagues, type MarketSpec } from "./model/markets.js";
import { analyze as defaultAnalyst } from "./ai/analyst.js";
import { type RateTrace } from "./model/trace.js";

const UNCERTAINTY_ORDER: Record<string, number> = { baixa: 0, media: 1, alta: 2 };

export interface AnalyzeOpts {
  analystFn?: (cands: any[], ctx: any) => any | Promise<any>;
  historyScope?: string;
  leagueId?: unknown;
  diagnostics?: boolean;
}

/** Analisa 1 jogo para 1 mercado. Retorna {candidatos, reprovados, ia}.
 * `reprovados` só vem preenchido com diagnostico=true (caixa-preta vira vidro). */
export async function analyzeMatch(
  event: any, market: MarketSpec, statsProvider: any, oddsProvider: any, repo: any,
  opts: AnalyzeOpts = {},
): Promise<{ candidatos: any[]; reprovados: any[]; ia: any }> {
  const analystFn = opts.analystFn ?? defaultAnalyst;
  const scope = opts.historyScope ?? "todos";
  const leagueId = opts.leagueId ?? null;

  let candidates: any[];
  if (market.kind === "contagem") {
    candidates = await runCount(event, market, statsProvider, oddsProvider, scope, leagueId);
  } else if (market.kind === "partida_totais" || market.kind === "partida_1x2") {
    candidates = await runMatch(event, market, statsProvider, oddsProvider);
  } else {
    candidates = [];
  }

  const { approved, rejected } = evaluateCandidates(candidates);
  const ia = await analystFn(approved, { jogo: event.jogo ?? event.id });

  await repo.saveAnalysis(event.id, {
    jogo: event.jogo, market_type: market.key, candidatos: approved, llm_resultado: ia,
  });

  const bet = ia?.melhor_aposta;
  if (bet && bet.veredito === "APOSTAR") {
    const c = approved.find((x) => x.jogador === bet.jogador && x.linha === bet.linha);
    if (c) {
      await repo.saveLedger([{
        event_id: event.id, jogador: c.jogador, linha: c.linha, market_type: c.market_type,
        odd_flag: c.odd, prob_modelo: c.prob_modelo, prob_devig: c.prob_devig, edge: c.edge, ev: c.ev,
      }]);
    }
  }
  const hideTrace = (c: any) => {
    if (opts.diagnostics || !c || c.trace === undefined) return c;
    const { trace, ...rest } = c;
    return rest;
  };
  return {
    candidatos: approved.map(hideTrace),
    reprovados: opts.diagnostics ? rejected : [],
    ia,
  };
}

async function runCount(event: any, market: MarketSpec, sp: any, op: any, scope: string, leagueId: unknown): Promise<any[]> {
  const lines = await op.lines(event, market);
  if (!lines || lines.length === 0) return [];
  if (market.nivel === "partida") return matchCount(event, market, sp, lines);
  return playerCount(event, market, sp, lines, scope, leagueId);
}

/** Trace mínimo de partida: só o esperado final (sem evidência por-jogo). `fonte`
 * indica como o λ foi montado (ratings_forca | media_movel) — diagnóstico, fora do número. */
function matchRateTrace(statField: string, mu: number, fonte = "media_movel"): RateTrace {
  const m = Math.round(mu * 100) / 100;
  return {
    statField, mu,
    passos: [{
      passo: "esperado_final",
      titulo: "Total esperado na partida",
      formula: "soma dos esperados dos dois times",
      entradas: { esperado: m, fonte },
      saida: m,
      frase: `No total, esperamos ${m} nesta partida.`,
    }],
  };
}

export async function matchCount(event: any, market: MarketSpec, sp: any, lines: any[]): Promise<any[]> {
  const home = event.home_team ?? {}, away = event.away_team ?? {};
  const th = await sp.teamRate(home.id, market, { event, is_home: true, opp_team_id: away.id, league_avg_conceded: market.concede_baseline });
  const ta = await sp.teamRate(away.id, market, { event, is_home: false, opp_team_id: home.id, league_avg_conceded: market.concede_baseline });
  if (th == null || ta == null) return [];
  const muTotal = th.mu + ta.mu;
  const sample = Math.min(th.amostra_jogos, ta.amostra_jogos);
  const uncertainty = [th.incerteza, ta.incerteza].sort((a, b) => (UNCERTAINTY_ORDER[b] ?? 2) - (UNCERTAINTY_ORDER[a] ?? 2))[0];
  const label = event.jogo || `${home.name ?? ""} x ${away.name ?? ""}`.trim() || "partida";
  return lines.map((li) => buildCandidate({
    jogador: label, linha: li.linha, odd_over: li.odd_over, odd_under: li.odd_under,
    prob_modelo: probOverLine(muTotal, li.linha, market.nb_dispersion), mu: muTotal, minutos_esperados: 90.0,
    xi_confirmado: true, amostra_jogos: sample, concedido_adversario: "n/d", incerteza: uncertainty ?? "media",
    market_type: market.key, trace: matchRateTrace(market.stat_field, muTotal),
  }));
}

export async function runMatch(event: any, market: MarketSpec, sp: any, op: any): Promise<any[]> {
  const lines = await op.lines(event, market);
  if (!lines || lines.length === 0) return [];
  const home = event.home_team ?? {}, away = event.away_team ?? {};
  const league = market.concede_baseline || 1.3;

  // RATINGS de força (Elo causal) — calibram gols/1X2 melhor que a média-crua
  // (exp 2026-06-12b: ECE 0.13→0.04). Pré-requisitos: liga conhecida, provider com
  // leaguePool, e os DOIS times com histórico suficiente. Senão → fallback média-crua.
  let lambdaHome: number | null = null, lambdaAway: number | null = null;
  let fonte = "media_movel";
  const leagueId = event.league_id ?? null;
  if (leagueId != null && typeof sp.leaguePool === "function") {
    try {
      const homeAdv = homeAdvFor(populacaoFor(leagueId));
      // Pool population-aware: seleção = forma recente cross-competição (a liga da Copa
      // é rasa/velha demais); clube = a própria liga. Une os jogos das ligas-fonte.
      const pools = await Promise.all(ratingsPoolLeagues(leagueId).map((lg: number) => sp.leaguePool(lg)));
      const ratings = computeRatings(pools.flat(), { mu0: league, homeAdv });
      if (ratingsEligible(ratings, String(home.id), String(away.id))) {
        const lam = lambdaFromRatings(ratings, String(home.id), String(away.id), { mu0: league, homeAdv });
        if (lam) { lambdaHome = lam.lambdaHome; lambdaAway = lam.lambdaAway; fonte = "ratings_forca"; }
      }
    } catch { /* fall back p/ média-crua */ }
  }
  if (lambdaHome == null || lambdaAway == null) {
    const rh = await sp.teamRates(home.id, { event, is_home: true });
    const ra = await sp.teamRates(away.id, { event, is_home: false });
    if (rh == null || ra == null) return [];
    lambdaHome = rh.lambda_for * ((ra.lambda_against ?? league) / league);
    lambdaAway = ra.lambda_for * ((rh.lambda_against ?? league) / league);
  }
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const muTotal = lambdaHome + lambdaAway;
  const fonteLambda = fonte;
  const label = event.jogo || `${home.name ?? ""} x ${away.name ?? ""}`.trim();
  const isTotals = market.kind === "partida_totais";
  return lines.map((li: any) => {
    let prob: number, jogador: string;
    if (isTotals) { prob = probTotalOver(matrix, li.linha); jogador = label; }
    else { prob = probs1x2(matrix).home; jogador = `${label} (1)`; }
    return buildCandidate({
      jogador, linha: li.linha, odd_over: li.odd_over, odd_under: li.odd_under,
      prob_modelo: prob, mu: muTotal, minutos_esperados: 90.0,
      xi_confirmado: true, amostra_jogos: 10, concedido_adversario: "n/d", incerteza: "media", market_type: market.key,
      // 1x2: prob_modelo é vitória do mandante, não "over de gols" — anexar o trace
      // de gols contaria uma história falsa. Só totais (over genuíno) ganham trace.
      trace: isTotals ? matchRateTrace(market.stat_field, muTotal, fonteLambda) : undefined,
    });
  });
}

async function playerCount(event: any, market: MarketSpec, sp: any, lines: any[], scope: string, leagueId: unknown): Promise<any[]> {
  const squad: any[] = await sp.squad(event);
  const homeId = String(event.home_team?.id ?? "");
  const awayId = String(event.away_team?.id ?? "");
  const xiTeamIds: Set<string> = typeof sp.xiIds === "function" ? await sp.xiIds(event) : new Set();
  const base = baselineFor(market, leagueId);
  const candidates: any[] = [];
  for (const entity of squad) {
    const isHome = entity.team_id === homeId;
    const titularidade = xiTeamIds.size > 0
      ? (xiTeamIds.has(String(entity.id)) ? "confirmado" : "fora_do_xi")
      : "provavel";
    const ctx = {
      event, entity_team_id: entity.team_id ?? entity.id, is_home: isHome,
      opp_team_id: isHome ? awayId : homeId, league_avg_conceded: base,
      xi_team_ids: xiTeamIds, escopo_historico: scope, posicao: entity.posicao ?? "",
    };
    const rate = await sp.entityRate(entity.id, market, ctx);
    if (rate == null) continue;
    for (const li of lines) {
      candidates.push(buildCandidate({
        jogador: entity.name, linha: li.linha, odd_over: li.odd_over, odd_under: li.odd_under,
        prob_modelo: probOverLine(rate.mu, li.linha, market.nb_dispersion), mu: rate.mu,
        minutos_esperados: rate.minutos_esperados, xi_confirmado: rate.xi_confirmado,
        amostra_jogos: rate.amostra_jogos, concedido_adversario: rate.concedido_adversario,
        incerteza: rate.incerteza, market_type: market.key, player_id: entity.id,
        trace: rate.trace,
        posicao: entity.posicao ?? null,
        titularidade,
        concedido_posicao: rate.concedido_posicao ?? null,
        stats_detalhadas: rate.stats_detalhadas ?? null,
        posse_adversario: rate.posse_adversario ?? null,
      }));
    }
  }
  return candidates;
}
