import { buildCandidate } from "./candidates/builder.js";
import { filterCandidates } from "./candidates/filtro.js";
import { probOverLine } from "./model/sotModel.js";
import { scoreMatrix, probs1x2, probTotalOver } from "./model/matchModel.js";
import { baselineFor, type MarketSpec } from "./model/markets.js";
import { analisar as defaultAnalista } from "./ai/analista.js";

const INCERTEZA_ORDEM: Record<string, number> = { baixa: 0, media: 1, alta: 2 };

export interface AnalisarOpts {
  analistaFn?: (cands: any[], ctx: any) => any | Promise<any>;
  escopoHistorico?: string;
  leagueId?: unknown;
}

/** Analisa 1 jogo para 1 mercado. Retorna {candidatos, ia}. */
export async function analisarJogo(
  event: any, market: MarketSpec, statsProvider: any, oddsProvider: any, repo: any,
  opts: AnalisarOpts = {},
): Promise<{ candidatos: any[]; ia: any }> {
  const analistaFn = opts.analistaFn ?? defaultAnalista;
  const escopoHistorico = opts.escopoHistorico ?? "todos";
  const leagueId = opts.leagueId ?? null;

  let candidatos: any[];
  if (market.kind === "contagem") {
    candidatos = await runContagem(event, market, statsProvider, oddsProvider, escopoHistorico, leagueId);
  } else if (market.kind === "partida_totais" || market.kind === "partida_1x2") {
    candidatos = await runPartida(event, market, statsProvider, oddsProvider);
  } else {
    candidatos = [];
  }

  const selecionados = filterCandidates(candidatos);
  const ia = await analistaFn(selecionados, { jogo: event.jogo ?? event.id });

  await repo.saveAnalise(event.id, {
    jogo: event.jogo, market_type: market.key, candidatos: selecionados, llm_resultado: ia,
  });

  const aposta = ia?.melhor_aposta;
  if (aposta && aposta.veredito === "APOSTAR") {
    const c = selecionados.find((x) => x.jogador === aposta.jogador && x.linha === aposta.linha);
    if (c) {
      await repo.saveLedger([{
        event_id: event.id, jogador: c.jogador, linha: c.linha, market_type: c.market_type,
        odd_flag: c.odd, prob_modelo: c.prob_modelo, prob_devig: c.prob_devig, edge: c.edge, ev: c.ev,
      }]);
    }
  }
  return { candidatos: selecionados, ia };
}

async function runContagem(event: any, market: MarketSpec, sp: any, op: any, escopo: string, leagueId: unknown): Promise<any[]> {
  const linhas = await op.linhas(event, market);
  if (!linhas || linhas.length === 0) return [];
  if (market.nivel === "partida") return contagemPartida(event, market, sp, linhas);
  return contagemJogador(event, market, sp, linhas, escopo, leagueId);
}

async function contagemPartida(event: any, market: MarketSpec, sp: any, linhas: any[]): Promise<any[]> {
  const home = event.home_team ?? {}, away = event.away_team ?? {};
  const th = await sp.team_taxa(home.id, market, { event, is_home: true, opp_team_id: away.id, league_avg_conceded: market.concede_baseline });
  const ta = await sp.team_taxa(away.id, market, { event, is_home: false, opp_team_id: home.id, league_avg_conceded: market.concede_baseline });
  if (th == null || ta == null) return [];
  const muTotal = th.mu + ta.mu;
  const amostra = Math.min(th.amostra_jogos, ta.amostra_jogos);
  const incerteza = [th.incerteza, ta.incerteza].sort((a, b) => (INCERTEZA_ORDEM[b] ?? 2) - (INCERTEZA_ORDEM[a] ?? 2))[0];
  const label = event.jogo || `${home.name ?? ""} x ${away.name ?? ""}`.trim() || "partida";
  return linhas.map((li) => buildCandidate({
    jogador: label, linha: li.linha, odd_over: li.odd_over, odd_under: li.odd_under,
    prob_modelo: probOverLine(muTotal, li.linha, market.nb_dispersion), mu: muTotal, minutos_esperados: 90.0,
    xi_confirmado: true, amostra_jogos: amostra, concedido_adversario: "n/d", incerteza: incerteza ?? "media",
    market_type: market.key,
  }));
}

async function runPartida(event: any, market: MarketSpec, sp: any, op: any): Promise<any[]> {
  const linhas = await op.linhas(event, market);
  if (!linhas || linhas.length === 0) return [];
  const home = event.home_team ?? {}, away = event.away_team ?? {};
  const rh = await sp.team_rates(home.id, { event, is_home: true });
  const ra = await sp.team_rates(away.id, { event, is_home: false });
  if (rh == null || ra == null) return [];
  const liga = market.concede_baseline || 1.3;
  const lambdaHome = rh.lambda_for * ((ra.lambda_against ?? liga) / liga);
  const lambdaAway = ra.lambda_for * ((rh.lambda_against ?? liga) / liga);
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const label = event.jogo || `${home.name ?? ""} x ${away.name ?? ""}`.trim();
  return linhas.map((li: any) => {
    let prob: number, jogador: string;
    if (market.kind === "partida_totais") { prob = probTotalOver(matrix, li.linha); jogador = label; }
    else { prob = probs1x2(matrix).home; jogador = `${label} (1)`; }
    return buildCandidate({
      jogador, linha: li.linha, odd_over: li.odd_over, odd_under: li.odd_under,
      prob_modelo: prob, mu: lambdaHome + lambdaAway, minutos_esperados: 90.0,
      xi_confirmado: true, amostra_jogos: 10, concedido_adversario: "n/d", incerteza: "media", market_type: market.key,
    });
  });
}

async function contagemJogador(event: any, market: MarketSpec, sp: any, linhas: any[], escopo: string, leagueId: unknown): Promise<any[]> {
  const elenco: any[] = await sp.elenco(event);
  const homeId = String(event.home_team?.id ?? "");
  const awayId = String(event.away_team?.id ?? "");
  const xiTeamIds: Set<string> = typeof sp.xi_ids === "function" ? await sp.xi_ids(event) : new Set();
  const base = baselineFor(market, leagueId);
  const candidatos: any[] = [];
  for (const entidade of elenco) {
    const isHome = entidade.team_id === homeId;
    const ctx = {
      event, entity_team_id: entidade.team_id ?? entidade.id, is_home: isHome,
      opp_team_id: isHome ? awayId : homeId, league_avg_conceded: base,
      xi_team_ids: xiTeamIds, escopo_historico: escopo,
    };
    const taxa = await sp.entity_taxa(entidade.id, market, ctx);
    if (taxa == null) continue;
    for (const li of linhas) {
      candidatos.push(buildCandidate({
        jogador: entidade.name, linha: li.linha, odd_over: li.odd_over, odd_under: li.odd_under,
        prob_modelo: probOverLine(taxa.mu, li.linha, market.nb_dispersion), mu: taxa.mu,
        minutos_esperados: taxa.minutos_esperados, xi_confirmado: taxa.xi_confirmado,
        amostra_jogos: taxa.amostra_jogos, concedido_adversario: taxa.concedido_adversario,
        incerteza: taxa.incerteza, market_type: market.key, player_id: entidade.id,
      }));
    }
  }
  return candidatos;
}
