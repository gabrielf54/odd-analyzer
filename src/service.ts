// Camada de serviço: contrato estável entre a UI (Next) e o motor. Funções puras de
// orquestração, sem framework; recebem client/repo injetados → testáveis com fakes.
import { MARKETS } from "./model/markets.js";
import { runAnalise } from "./runner.js";
import { construirMapaTime, resolver } from "./crosswalk/bsdIds.js";

export async function listarLigas(client: any, limit = 200): Promise<any[]> {
  const data = await client.leagues({ limit });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const ligas = results
    .filter((lg) => lg.id != null)
    .map((lg) => ({ id: lg.id, nome: lg.name, pais: lg.country }));
  ligas.sort((a, b) => (a.nome ?? "").toLowerCase().localeCompare((b.nome ?? "").toLowerCase()));
  return ligas;
}

export async function listarJogos(client: any, leagueId: unknown, status: string, limit = 50, agora = new Date()): Promise<any[]> {
  const data = await client.events({ league_id: leagueId, status, limit });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const finished = status === "finished";
  let jogos = results.slice(0, limit).map((ev) => {
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
    const cutoff = agora.getTime();
    jogos = jogos.filter((j) => {
      const t = j.data ? new Date(j.data).getTime() : NaN;
      return isNaN(t) || t >= cutoff;
    });
  }
  jogos.sort((a, b) => {
    const av = String(a.data ?? ""), bv = String(b.data ?? "");
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return finished ? -cmp : cmp;
  });
  return jogos;
}

function playersFromLineup(side: any): any[] {
  const teamId = String(side?.team_id ?? "");
  return (side?.players ?? []).map((p: any) => ({
    id: String(p.id), name: p.name, team_id: teamId, posicao: p.position ?? "",
  }));
}

async function playersUltimos3(client: any, teamId: string, nJogos = 3): Promise<any[]> {
  if (!teamId) return [];
  const evs = await client.events({ team_id: teamId, status: "finished", limit: nJogos });
  const results: any[] = Array.isArray(evs?.results) ? evs.results : [];
  const vistos = new Map<string, any>();
  for (const ev of results.slice(0, nJogos)) {
    const ps = await client.eventPlayerStats(ev.id);
    const rows: any[] = Array.isArray(ps?.player_stats) ? ps.player_stats : [];
    for (const r of rows) {
      const pid = r.player_id;
      if (pid == null) continue;
      if (r.minutes_played != null && r.minutes_played === 0) continue;
      const key = String(pid);
      if (!vistos.has(key)) {
        vistos.set(key, { id: key, name: r.name ?? r.player_name ?? key, team_id: String(teamId), posicao: r.position ?? "" });
      }
    }
  }
  return [...vistos.values()];
}

async function resolverLineup(client: any, jogadores: any[], teamId: string): Promise<any[]> {
  const comTime = jogadores.map((p) => ({ ...p, team_id: String(teamId) }));
  return resolver(comTime, await construirMapaTime(client, teamId));
}

export async function escalacaoProvavel(client: any, eventId: unknown): Promise<any> {
  const raw = await client.getEvent(eventId);
  const homeName = raw.home_team ?? "?", awayName = raw.away_team ?? "?";
  const homeId = String(raw.home_team_id ?? ""), awayId = String(raw.away_team_id ?? "");

  const data = await client.lineups(eventId);
  const lineups = data?.lineups ?? {};
  let homePlayers = playersFromLineup(lineups.home ?? {});
  let awayPlayers = playersFromLineup(lineups.away ?? {});
  let origem: string;

  if (homePlayers.length || awayPlayers.length) {
    const confirmado = data?.lineup_status === "confirmed" ||
      Object.values(lineups).some((v: any) => v && typeof v === "object" && v.confirmed);
    origem = confirmado ? "confirmada" : "provavel";
    homePlayers = await resolverLineup(client, homePlayers, homeId);
    awayPlayers = await resolverLineup(client, awayPlayers, awayId);
  } else {
    origem = "ultimos3";
    homePlayers = await playersUltimos3(client, homeId);
    awayPlayers = await playersUltimos3(client, awayId);
  }
  return {
    origem,
    home: { team_name: homeName, team_id: homeId, jogadores: homePlayers },
    away: { team_name: awayName, team_id: awayId, jogadores: awayPlayers },
  };
}

export async function mediaRecenteJogador(client: any, _eventId: unknown, marketKey: string, playerId: unknown): Promise<any> {
  if (!(marketKey in MARKETS)) throw new Error(`mercado desconhecido: ${marketKey}. Opções: ${Object.keys(MARKETS).join(", ")}`);
  const field = MARKETS[marketKey]!.stat_field;
  const raw = await client.playerStats(playerId);
  const results: any[] = Array.isArray(raw?.results) ? raw.results : [];
  const valores = results.filter((r) => r[field] != null).map((r) => Number(r[field]));
  if (valores.length === 0) return { media: 0.0, jogos: 0 };
  return { media: valores.reduce((a, b) => a + b, 0) / valores.length, jogos: valores.length };
}

export interface AnalisarServiceOpts {
  usarIa?: boolean;
  repo?: any;
  escopoHistorico?: string;
  leagueId?: unknown;
  playerRef?: string | null;
  oddsProvider?: any;
}

export async function analisar(
  client: any, eventId: string, marketKey: string,
  linha: number, oddOver: number, oddUnder: number, opts: AnalisarServiceOpts = {},
): Promise<any> {
  if (!(marketKey in MARKETS)) throw new Error(`mercado desconhecido: ${marketKey}. Opções: ${Object.keys(MARKETS).join(", ")}`);
  const market = MARKETS[marketKey]!;
  const emValidacao = market.nivel === "partida";

  const raw = await client.getEvent(eventId);
  const jogo = `${raw.home_team ?? "?"} x ${raw.away_team ?? "?"}`;

  const out = await runAnalise(client, eventId, marketKey, opts.playerRef ?? null, {
    linha, oddOver, oddUnder, usarIa: opts.usarIa ?? false, repo: opts.repo,
    escopoHistorico: opts.escopoHistorico ?? "todos", leagueId: opts.leagueId, oddsProvider: opts.oddsProvider,
  });
  return { jogo, candidatos: out.candidatos ?? [], ia: out.ia ?? {}, em_validacao: emValidacao };
}

export async function apostarPaper(repo: any, eventId: string, candidato: any, emValidacao = false): Promise<void> {
  if (emValidacao) throw new Error("mercado em validação — não registrar aposta-papel");
  await repo.saveLedger([{
    event_id: String(eventId), jogador: candidato.jogador, linha: candidato.linha,
    market_type: candidato.market_type, odd_flag: candidato.odd,
    prob_modelo: candidato.prob_modelo, prob_devig: candidato.prob_devig,
    edge: candidato.edge, ev: candidato.ev,
  }]);
}

export async function resultadoRealJogador(client: any, eventId: unknown, marketKey: string, linha: number): Promise<Record<string, any>> {
  const field = MARKETS[marketKey]!.stat_field;
  const data = await client.eventPlayerStats(eventId);
  const rows: any[] = Array.isArray(data?.player_stats) ? data.player_stats : [];
  const out: Record<string, any> = {};
  for (const row of rows) {
    const pid = row.player_id;
    if (pid == null) continue;
    const valor = row[field] ?? 0;
    out[String(pid)] = { valor_real: valor, bateu: valor > linha };
  }
  return out;
}
