// Camada de serviço: contrato estável entre a UI (Next) e o motor. Funções puras de
// orquestração, sem framework; recebem client/repo injetados → testáveis com fakes.
import { MARKETS } from "./model/markets.js";
import { runAnalyze } from "./runner.js";
import { buildTeamMap, resolve } from "./crosswalk/bsdIds.js";
import { parseManualOdds } from "./manual/schema.js";
import { analyzeManual } from "./manual/analyze.js";
import { buildOddsPrompt } from "./manual/prompt.js";
import { normalize } from "./crosswalk/match.js";
import type { ReviewerFn } from "./ai/reviewer.js";

export async function listLeagues(client: any, limit = 200): Promise<any[]> {
  const data = await client.leagues({ limit });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const leagues = results
    .filter((lg) => lg.id != null)
    .map((lg) => ({ id: lg.id, nome: lg.name, pais: lg.country }));
  leagues.sort((a, b) => (a.nome ?? "").toLowerCase().localeCompare((b.nome ?? "").toLowerCase()));
  return leagues;
}

export async function listMatches(client: any, leagueId: unknown, status: string, limit = 50, now = new Date()): Promise<any[]> {
  const data = await client.events({ league_id: leagueId, status, limit });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const finished = status === "finished";
  let matches = results.slice(0, limit).map((ev) => {
    const hs = ev.home_score, as_ = ev.away_score;
    const placar = hs != null && as_ != null ? `${hs}×${as_}` : null;
    return {
      id: ev.id, mandante: ev.home_team, visitante: ev.away_team,
      data: ev.event_date, status: ev.status, placar, league_id: ev.league_id ?? leagueId,
    };
  });
  // Pré-jogo: a BSD às vezes deixa o status preso em "notstarted" mesmo após o
  // jogo ter começado. Descartamos os que já passaram do horário — jogo iniciado
  // não é mais candidato a valor pré-jogo.
  if (!finished) {
    const cutoff = now.getTime();
    matches = matches.filter((j) => {
      const t = j.data ? new Date(j.data).getTime() : NaN;
      return isNaN(t) || t >= cutoff;
    });
  }
  matches.sort((a, b) => {
    const av = String(a.data ?? ""), bv = String(b.data ?? "");
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return finished ? -cmp : cmp;
  });
  return matches;
}

function playersFromLineup(side: any): any[] {
  const teamId = String(side?.team_id ?? "");
  return (side?.players ?? []).map((p: any) => ({
    id: String(p.id), name: p.name, team_id: teamId, posicao: p.position ?? "",
  }));
}

async function playersFromRecentGames(client: any, teamId: string, nGames = 3): Promise<any[]> {
  if (!teamId) return [];
  const evs = await client.events({ team_id: teamId, status: "finished", limit: nGames });
  const results: any[] = Array.isArray(evs?.results) ? evs.results : [];
  const seen = new Map<string, any>();
  for (const ev of results.slice(0, nGames)) {
    const ps = await client.eventPlayerStats(ev.id);
    const rows: any[] = Array.isArray(ps?.player_stats) ? ps.player_stats : [];
    for (const r of rows) {
      const pid = r.player_id;
      if (pid == null) continue;
      if (r.minutes_played != null && r.minutes_played === 0) continue;
      const key = String(pid);
      if (!seen.has(key)) {
        seen.set(key, { id: key, name: r.name ?? r.player_name ?? key, team_id: String(teamId), posicao: r.position ?? "" });
      }
    }
  }
  return [...seen.values()];
}

async function resolveLineup(client: any, players: any[], teamId: string): Promise<any[]> {
  const withTeam = players.map((p) => ({ ...p, team_id: String(teamId) }));
  return resolve(withTeam, await buildTeamMap(client, teamId));
}

export async function probableLineup(client: any, eventId: unknown): Promise<any> {
  const raw = await client.getEvent(eventId);
  const homeName = raw.home_team ?? "?", awayName = raw.away_team ?? "?";
  const homeId = String(raw.home_team_id ?? ""), awayId = String(raw.away_team_id ?? "");

  const data = await client.lineups(eventId);
  const lineups = data?.lineups ?? {};
  let homePlayers = playersFromLineup(lineups.home ?? {});
  let awayPlayers = playersFromLineup(lineups.away ?? {});
  let origem: string;

  if (homePlayers.length || awayPlayers.length) {
    const confirmed = data?.lineup_status === "confirmed" ||
      Object.values(lineups).some((v: any) => v && typeof v === "object" && v.confirmed);
    origem = confirmed ? "confirmada" : "provavel";
    homePlayers = await resolveLineup(client, homePlayers, homeId);
    awayPlayers = await resolveLineup(client, awayPlayers, awayId);
  } else {
    origem = "ultimos3";
    homePlayers = await playersFromRecentGames(client, homeId);
    awayPlayers = await playersFromRecentGames(client, awayId);
  }
  return {
    origem,
    home: { team_name: homeName, team_id: homeId, jogadores: homePlayers },
    away: { team_name: awayName, team_id: awayId, jogadores: awayPlayers },
  };
}

export async function recentPlayerAverage(client: any, _eventId: unknown, marketKey: string, playerId: unknown): Promise<any> {
  if (!(marketKey in MARKETS)) throw new Error(`mercado desconhecido: ${marketKey}. Opções: ${Object.keys(MARKETS).join(", ")}`);
  const field = MARKETS[marketKey]!.stat_field;
  const raw = await client.playerStats(playerId);
  const results: any[] = Array.isArray(raw?.results) ? raw.results : [];
  const values = results.filter((r) => r[field] != null).map((r) => Number(r[field]));
  if (values.length === 0) return { media: 0.0, jogos: 0 };
  return { media: values.reduce((a, b) => a + b, 0) / values.length, jogos: values.length };
}

export interface AnalyzeServiceOpts {
  useAi?: boolean;
  repo?: any;
  historyScope?: string;
  leagueId?: unknown;
  playerRef?: string | null;
  oddsProvider?: any;
  diagnostics?: boolean;
}

export async function analyze(
  client: any, eventId: string, marketKey: string,
  linha: number, oddOver: number, oddUnder: number, opts: AnalyzeServiceOpts = {},
): Promise<any> {
  if (!(marketKey in MARKETS)) throw new Error(`mercado desconhecido: ${marketKey}. Opções: ${Object.keys(MARKETS).join(", ")}`);
  const market = MARKETS[marketKey]!;
  const inValidation = market.nivel === "partida";

  const raw = await client.getEvent(eventId);
  const jogo = `${raw.home_team ?? "?"} x ${raw.away_team ?? "?"}`;

  const out = await runAnalyze(client, eventId, marketKey, opts.playerRef ?? null, {
    linha, oddOver, oddUnder, useAi: opts.useAi ?? false, repo: opts.repo,
    historyScope: opts.historyScope ?? "todos", leagueId: opts.leagueId, oddsProvider: opts.oddsProvider,
    diagnostics: opts.diagnostics ?? false,
  });
  return {
    jogo, candidatos: out.candidatos ?? [], reprovados: out.reprovados ?? [],
    ia: out.ia ?? {}, em_validacao: inValidation,
  };
}

/** Gera o prompt de coleta de odds p/ um mercado (busca o lineup do jogo). */
export async function generateOddsPrompt(client: any, eventId: string, marketKey: string): Promise<string> {
  const raw = await client.getEvent(eventId);
  const event = {
    jogo: `${raw.home_team ?? "?"} x ${raw.away_team ?? "?"}`,
    home_team: raw.home_team, away_team: raw.away_team,
  };
  const lineup = await probableLineup(client, eventId);
  return buildOddsPrompt(event, marketKey, lineup);
}

export interface AnalyzeManualServiceOpts { repo?: any; reviewerFn?: ReviewerFn; diagnostics?: boolean; }

/** Valida o JSON colado e roda a análise geral de todos os mercados (com IA revisora). */
export async function analyzeManualService(client: any, body: unknown, opts: AnalyzeManualServiceOpts = {}): Promise<any> {
  const input = parseManualOdds(body); // lança em erro estrutural (→ 400 na API)
  return analyzeManual(client, input, {
    repo: opts.repo, reviewerFn: opts.reviewerFn, diagnostics: opts.diagnostics ?? false,
  });
}

/** Liga um nome da casa a um player_id (stats-id) e persiste no crosswalk. */
export async function confirmCrosswalk(repo: any, nomeCasa: string, playerId: string): Promise<void> {
  await repo.saveCrosswalk(Number(playerId), normalize(nomeCasa), { casa: nomeCasa }, 1.0, true);
}

export async function paperBet(repo: any, eventId: string, candidate: any, inValidation = false): Promise<void> {
  if (inValidation) throw new Error("mercado em validação — não registrar aposta-papel");
  await repo.saveLedger([{
    event_id: String(eventId), jogador: candidate.jogador, linha: candidate.linha,
    market_type: candidate.market_type, odd_flag: candidate.odd,
    prob_modelo: candidate.prob_modelo, prob_devig: candidate.prob_devig,
    edge: candidate.edge, ev: candidate.ev,
  }]);
}

export async function realPlayerResult(client: any, eventId: unknown, marketKey: string, linha: number): Promise<Record<string, any>> {
  const field = MARKETS[marketKey]!.stat_field;
  const data = await client.eventPlayerStats(eventId);
  const rows: any[] = Array.isArray(data?.player_stats) ? data.player_stats : [];
  const out: Record<string, any> = {};
  for (const row of rows) {
    const pid = row.player_id;
    if (pid == null) continue;
    const value = row[field] ?? 0;
    out[String(pid)] = { valor_real: value, bateu: value > linha };
  }
  return out;
}
