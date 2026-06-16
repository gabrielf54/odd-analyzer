// Camada de serviço: contrato estável entre a UI (Next) e o motor. Funções puras de
// orquestração, sem framework; recebem client/repo injetados → testáveis com fakes.
import { MARKETS, settleField } from "./model/markets.js";
import { runAnalyze, normalizeEvent } from "./runner.js";
import { buildTeamMap, resolve } from "./crosswalk/bsdIds.js";
import { parseManualOdds } from "./manual/schema.js";
import { analyzeManual } from "./manual/analyze.js";
import { buildOddsPrompt } from "./manual/prompt.js";
import { normalize } from "./crosswalk/match.js";
import { InMemoryRepo, type OddsRow, type UnifiedOddsRow } from "./store/repo.js";
import { runCollection, type RunCollectionOpts, type RunCollectionResult } from "./collect/run.js";
import { buildUnifiedOdds } from "./collect/unify.js";
import type { Fetchers } from "./collect/houses.js";
import type { ManualOddsInput } from "./manual/schema.js";
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

// A BSD não ordena /events por data — devolve por id DESC e respeita o `limit`.
// Em ligas grandes (ex.: Copa, liga 27) os ids altos são jogos de chave/knockout
// (data tarde, times placeholder), então pedir só `limit` deixa o opener e a fase
// de grupos (ids baixos) fora da janela. Puxamos largo e ordenamos/cortamos aqui.
const WIDE_FETCH = 200;

// Janela de graça pós-horário: jogo "notstarted" cujo kickoff passou há menos de
// 3h ainda aparece na lista (cobre os ~2h de partida + folga). Depois disso, cai.
const KICKOFF_GRACE_MS = 3 * 60 * 60 * 1000;

// Jogo de chave ainda sem time definido vem com nome placeholder ("W101", "L101",
// "1K", "H1", "3D/3E/3I"). Sem time real não há stats → não é candidato a análise.
function isPlaceholderTeam(name: unknown): boolean {
  const s = String(name ?? "").trim();
  if (!s) return true;
  if (s.includes("/")) return true; // combinações de grupo: "3D/3E/3I"
  return /^([WL]\d+|\d[A-Za-z]|[A-Za-z]\d)$/.test(s); // W101, L101, 1K, 2J, H1, G1
}

export async function listMatches(client: any, leagueId: unknown, status: string, limit = 50, now = new Date()): Promise<any[]> {
  const finished = status === "finished";
  // Pré-jogo: NÃO filtramos por status na API. Jogo ao vivo tem status próprio na
  // BSD (`1st_half`, `2nd_half`, ...) — não é `notstarted` — e `status=notstarted`
  // some com ele. Puxamos sem filtro (devolve notstarted + ao vivo + finished) e
  // decidimos no código: descarta finalizado e aplica a janela de graça abaixo.
  // Lista de finalizados continua filtrando por `status=finished` direto na API.
  const params: Record<string, unknown> = { league_id: leagueId, limit: Math.max(limit, WIDE_FETCH) };
  if (finished) params.status = "finished";
  const data = await client.events(params);
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  let matches = results.map((ev) => {
    const hs = ev.home_score, as_ = ev.away_score;
    const placar = hs != null && as_ != null ? `${hs}×${as_}` : null;
    return {
      id: ev.id, mandante: ev.home_team, visitante: ev.away_team,
      data: ev.event_date, status: ev.status, placar, league_id: ev.league_id ?? leagueId,
    };
  });
  // Jogos de chave sem time definido (placeholder) não têm stats → fora.
  matches = matches.filter((j) => !isPlaceholderTeam(j.mandante) && !isPlaceholderTeam(j.visitante));
  // Lista de pré-jogo/ao vivo: descarta o que já terminou (vai pra lista de
  // finalizados) e mantém janela de graça de 3h após o kickoff — jogo recém-
  // iniciado ou ainda rolando aparece (cobre os ~2h de partida + folga); só o
  // que passou dessa janela (inclusive `notstarted` preso pós-horário) cai fora.
  if (!finished) {
    const cutoff = now.getTime() - KICKOFF_GRACE_MS;
    matches = matches.filter((j) => {
      if (j.status === "finished") return false;
      const t = j.data ? new Date(j.data).getTime() : NaN;
      return isNaN(t) || t >= cutoff;
    });
  }
  matches.sort((a, b) => {
    const av = String(a.data ?? ""), bv = String(b.data ?? "");
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return finished ? -cmp : cmp;
  });
  return matches.slice(0, limit); // corta só depois de ordenar por data
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
  // settleField (não stat_field): o usuário vê a média DO QUE APOSTA. Em mercados de
  // decomposição (sot→shots_on_target, desarme→won_tackle) o stat_field é a BASE do
  // modelo (total_shots/total_tackle), não o que a casa liquida.
  const field = settleField(marketKey) ?? MARKETS[marketKey]!.stat_field;
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

/** Re-gera o ESPELHO `odds_unificadas` a partir do cru. Chamado APÓS toda escrita em
 * `odds` (coletar/colar/apagar) → a tabela nunca envelhece. Retorna as linhas + as
 * divergências. PURO de regra (a unificação vem de buildUnifiedOdds). */
export async function reprojectUnifiedOdds(
  repo: any, eventId: string,
): Promise<{ linhas: UnifiedOddsRow[]; divergencias: any[]; nCru: number }> {
  const raw: OddsRow[] = await repo.getOdds(eventId);
  const lines = raw.map((r) => ({
    market_type: r.market_type, entidade: r.entidade, linha: Number(r.linha),
    odd_over: Number(r.odd_over), odd_under: r.odd_under == null ? null : Number(r.odd_under), book: r.book,
  }));
  const { linhas, divergencias } = buildUnifiedOdds(lines, eventId);
  await repo.saveOddsUnificadas(eventId, linhas);
  return { linhas, divergencias, nCru: raw.length };
}

/** Botão "Unificar odds": re-gera o espelho e devolve o resumo p/ a tela de conferência. */
export async function unificarOddsService(
  repo: any, eventId: string,
): Promise<{ n_cru: number; n_unificado: number; divergencias: any[]; linhas: UnifiedOddsRow[] }> {
  const { linhas, divergencias, nCru } = await reprojectUnifiedOdds(repo, eventId);
  return { n_cru: nCru, n_unificado: linhas.length, divergencias, linhas };
}

/** Lê o espelho canônico (o que a ANÁLISE considera). */
export async function getOddsUnificadasService(repo: any, eventId: string): Promise<UnifiedOddsRow[]> {
  return repo.getOddsUnificadas(eventId);
}

/** Salva odds coladas na tabela (upsert por PK). Valida via parseManualOdds. Re-espelha. */
export async function saveOddsService(repo: any, body: unknown): Promise<{ salvas: number; linhas_rejeitadas: any[] }> {
  const input = parseManualOdds(body);
  const rows: OddsRow[] = input.odds.map((o) => ({
    event_id: input.event_id, entidade: o.entidade, market_type: o.market_type,
    linha: o.linha, odd_over: o.odd_over, odd_under: o.odd_under, book: o.book,
    coletado_em: input.coletado_em,
  }));
  await repo.saveOdds(input.event_id, rows);
  await reprojectUnifiedOdds(repo, input.event_id); // espelho automático
  return { salvas: rows.length, linhas_rejeitadas: input.linhas_rejeitadas };
}

export async function getOddsService(repo: any, eventId: string): Promise<OddsRow[]> {
  return repo.getOdds(eventId);
}

/** "Obter odds": coleta as odds do jogo nas casas (registry) e grava no `odds`. É o backend
 * do botão "obter odds → analisar". `fetchers` injetado (fetch puro + headless; o endpoint
 * monta via import dinâmico p/ não carregar Playwright no boot). Resolve home/away pela BSD. */
export async function coletarOddsService(
  client: any, repo: any, eventId: string, fetchers: Fetchers, opts: RunCollectionOpts = {},
): Promise<RunCollectionResult> {
  const ev = normalizeEvent(await client.getEvent(eventId));
  const home = ev.home_team?.name ?? "", away = ev.away_team?.name ?? "";
  opts.log?.(`jogo BSD ${ev.id}: "${home}" x "${away}" — resolvendo nas casas...`);
  const res = await runCollection(
    { id: String(ev.id), jogo: ev.jogo, home, away },
    repo, fetchers, opts,
  );
  // Espelho automático: re-gera odds_unificadas do cru recém-gravado (dry não grava).
  if (!opts.dry) await reprojectUnifiedOdds(repo, String(ev.id));
  return res;
}

/** Resultado completo da última análise manual (ou null). Fonte de verdade pro
 *  front recuperar na hidratação, independente do localStorage. */
export async function getManualAnalysisService(repo: any, eventId: string): Promise<{ result: any; analisado_em: string } | null> {
  return repo.getManualResult(eventId);
}

export async function deleteOddsService(repo: any, eventId: string, filter?: Partial<OddsRow>): Promise<{ ok: true }> {
  const fullClear = !filter || Object.keys(filter).length === 0;
  await repo.deleteOdds(eventId, filter);
  await reprojectUnifiedOdds(repo, eventId); // espelho automático (apagar tudo → unificada vazia)
  // Clear TOTAL: a análise salva derivava dessas odds → fica órfã/enganosa. Apaga junto.
  // Apagar UMA odd (filtro) NÃO mexe na análise (edição pontual, não recomeço).
  if (fullClear) await repo.deleteAnalysis(eventId);
  return { ok: true };
}

/** Apaga SÓ a análise salva do jogo (sem tocar nas odds). Usado pelo botão "Excluir
 * análise" do aviso de análise desatualizada (editou odd → escolhe re-analisar ou excluir). */
export async function deleteAnalysisService(repo: any, eventId: string): Promise<{ ok: true }> {
  await repo.deleteAnalysis(eventId);
  return { ok: true };
}

/** Persiste odds do corpo (se houver) e SEMPRE analisa as odds do repo por event_id.
 * `odds[]` no corpo é opcional: retrocompatível (corpo antigo persiste e re-lê) e
 * fonte-de-verdade (front novo manda só event_id; a tabela alimenta a análise). */
export async function analyzeManualService(client: any, body: unknown, opts: AnalyzeManualServiceOpts = {}): Promise<any> {
  const repo = opts.repo ?? new InMemoryRepo();
  const b: any = body ?? {};
  let linhas_rejeitadas: any[] = [];

  if (Array.isArray(b.odds)) {
    const parsed = parseManualOdds(b); // lança em erro estrutural (→ 400); separa rejeitadas por-linha
    linhas_rejeitadas = parsed.linhas_rejeitadas;
    const rows: OddsRow[] = parsed.odds.map((o) => ({
      event_id: parsed.event_id, entidade: o.entidade, market_type: o.market_type,
      linha: o.linha, odd_over: o.odd_over, odd_under: o.odd_under, book: o.book,
      coletado_em: parsed.coletado_em,
    }));
    await repo.saveOdds(parsed.event_id, rows);
  }

  const eventId = String(b.event_id ?? "");
  // Espelho canônico: re-gera a odds_unificadas do cru e ANALISA EM CIMA DELA. Assim a
  // análise consome exatamente o que a tela única mostra (mesma projeção, sem divergir).
  const { linhas: unificadas, divergencias } = await reprojectUnifiedOdds(repo, eventId);
  const input: ManualOddsInput = {
    event_id: eventId,
    coletado_em: String(b.coletado_em ?? ""),
    odds: unificadas.map((u) => ({
      market_type: u.market_type, entidade: u.entidade, linha: Number(u.linha),
      odd_over: Number(u.odd_over), odd_under: u.odd_under == null ? null : Number(u.odd_under), book: u.book,
      // casas_comparadas viaja anexado (o candidato/UI usa); analyzeManual já está unificado.
      casas_comparadas: u.casas_comparadas,
    })) as any,
    linhas_rejeitadas,
    escopo_historico: String(b.escopo_historico ?? "todos"),
  };
  return analyzeManual(client, input, {
    repo, reviewerFn: opts.reviewerFn, diagnostics: opts.diagnostics ?? false,
    alreadyUnified: true, divergencias,
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
  // settleField: o resultado real é o que a casa LIQUIDA (sot→shots_on_target,
  // desarme→won_tackle), não a base do modelo (stat_field).
  const field = settleField(marketKey) ?? MARKETS[marketKey]!.stat_field;
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
