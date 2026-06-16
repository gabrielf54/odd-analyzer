import { buildCandidate } from "./candidates/builder.js";
import { evaluateCandidates } from "./candidates/filter.js";
import { probOverLine } from "./model/sotModel.js";
import { scoreMatrix, probs1x2, probTotalOver } from "./model/matchModel.js";
import { computeRatings, lambdaFromRatings, ratingsEligible, homeAdvFor, ratingsShrinkFor } from "./model/ratings.js";
import { baselineFor, populacaoFor, ratingsPoolLeagues, type MarketSpec } from "./model/markets.js";
import { analyze as defaultAnalyst } from "./ai/analyst.js";
import { buildMatch1x2Trace, type RateTrace } from "./model/trace.js";
import { logWarn } from "./lib/log.js";

const DRAW_TOKENS = new Set(["empate", "draw", "x", "tie", "drawn", "nulo"]);

/** Normaliza p/ casar nome de time: tira acento/pontuação, baixa caixa, colapsa espaços. */
function norm1x2(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Casa a entidade de uma linha 1X2 ao desfecho (mandante/empate/visitante). Empate
 * por palavra-chave; time por igualdade normalizada e, em último caso, por
 * sobreposição de tokens (cobre "Bosnia & Herzegovina" vs "Bosnia and Herzegovina").
 * Retorna null quando não reconhece — o chamador decide o fallback. */
function outcome1x2(entidade: unknown, homeName: unknown, awayName: unknown): "home" | "draw" | "away" | null {
  const e = norm1x2(entidade);
  if (!e) return null;
  if (DRAW_TOKENS.has(e)) return "draw";
  const h = norm1x2(homeName), a = norm1x2(awayName);
  if (e === h) return "home";
  if (e === a) return "away";
  const et = new Set(e.split(" ").filter(Boolean));
  const overlap = (x: string) => x.split(" ").filter((t) => t && et.has(t)).length;
  const oh = overlap(h), oa = overlap(a);
  if (oh > oa) return "home";
  if (oa > oh) return "away";
  return null;
}

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
    book: li.book ?? null, casas_comparadas: li.casas_comparadas ?? null,
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
      const pop = populacaoFor(leagueId);
      const homeAdv = homeAdvFor(pop);
      const shrinkK = ratingsShrinkFor(pop);
      // Pool population-aware: seleção = forma recente cross-competição (a liga da Copa
      // é rasa/velha demais); clube = a própria liga. Une os jogos das ligas-fonte.
      const pools = await Promise.all(ratingsPoolLeagues(leagueId).map((lg: number) => sp.leaguePool(lg)));
      const ratings = computeRatings(pools.flat(), { mu0: league, homeAdv });
      // Floor 1 (só presença) + encolhimento (shrinkK): time de pouco histórico usa o
      // rating ENCOLHIDO pro neutro, em vez de cair na média-crua cega que invertia o
      // mismatch (bug `Iran×NZ`, 2026-06-15). Fallback só p/ time AUSENTE do pool.
      if (ratingsEligible(ratings, String(home.id), String(away.id), 1)) {
        const lam = lambdaFromRatings(ratings, String(home.id), String(away.id), { mu0: league, homeAdv, shrinkK });
        if (lam) { lambdaHome = lam.lambdaHome; lambdaAway = lam.lambdaAway; fonte = "ratings_forca"; }
      }
    } catch (e) {
      // Antes engolia em silêncio — o operador não via que os ratings falharam.
      logWarn("runMatch:ratings", "ratings falharam; caindo p/ média-crua", { event_id: event.id, err: e instanceof Error ? e.message : String(e) });
    }
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
  const p1x2 = isTotals ? null : probs1x2(matrix);
  const SUFIXO = { home: "(1)", draw: "(X)", away: "(2)" } as const;
  return lines.map((li: any) => {
    let prob: number, jogador: string, trace: RateTrace | undefined;
    if (isTotals) {
      prob = probTotalOver(matrix, li.linha); jogador = label;
      trace = matchRateTrace(market.stat_field, muTotal, fonteLambda);
    } else {
      // 1X2: CADA linha é um resultado distinto (mandante/empate/visitante). Casa a
      // entidade colada ao desfecho e usa a prob daquele lado. Sem isso, TODAS as
      // linhas viravam "vitória do mandante" — número errado E, como `jogador`/`linha`
      // ficavam idênticos, o upsert do paper_ledger colidia na chave
      // (event_id,jogador,linha,market_type) → "ON CONFLICT ... cannot affect row a
      // second time" (bug 2026-06-12). `entidade="partida"` (placeholder da rota legada
      // /analisar, linha única) cai no mandante sem ruído; qualquer outro nome não
      // reconhecido vira mandante MAS é logado (suspeita de nome torto da casa).
      const lado = outcome1x2(li.entidade, home.name, away.name);
      if (lado == null && norm1x2(li.entidade) !== "partida") {
        logWarn("runMatch:1x2", "entidade de vitória não reconhecida — assumindo mandante", {
          event_id: event.id, entidade: li.entidade, home: home.name, away: away.name,
        });
      }
      const ladoFinal = lado ?? "home";
      prob = p1x2![ladoFinal]; jogador = `${label} ${SUFIXO[ladoFinal]}`;
      // 1x2: trace PRÓPRIO (gols esperados de cada time → P do desfecho), não o de
      // "over de gols" — esse contaria uma história falsa pra uma prob de resultado.
      trace = buildMatch1x2Trace({
        homeName: home.name ?? "mandante", awayName: away.name ?? "visitante",
        lambdaHome: lambdaHome!, lambdaAway: lambdaAway!,
        pHome: p1x2!.home, pDraw: p1x2!.draw, pAway: p1x2!.away,
        outcome: ladoFinal, fonte: fonteLambda,
      });
    }
    return buildCandidate({
      jogador, linha: li.linha, odd_over: li.odd_over, odd_under: li.odd_under,
      prob_modelo: prob, mu: muTotal, minutos_esperados: 90.0,
      xi_confirmado: true, amostra_jogos: 10, concedido_adversario: "n/d", incerteza: "media", market_type: market.key,
      trace, book: li.book ?? null, casas_comparadas: li.casas_comparadas ?? null,
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
