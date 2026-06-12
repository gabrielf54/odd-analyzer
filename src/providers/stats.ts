import type { MarketSpec } from "../model/markets.js";
import {
  windowedRate, assembleMu, filterGamesByScope, playerMuFromGames, expectedMinutes,
} from "../model/assemble.js";
import { shrinkRate } from "../model/shrinkage.js";
import { opponentMultiplier, homeAwayMultiplier, positionalTilt } from "../model/adjustments.js";
import { POSITIONAL_SHARE_NACIONAL, POSITIONAL_TILT_ENABLED, POSITIONAL_MIN_GAMES } from "../model/params.js";
import { buildTeamMap, resolve } from "../crosswalk/bsdIds.js";
import type { EntityRate } from "./types.js";
import { buildRateTrace } from "../model/trace.js";
import { detailedStats } from "../model/detailedStats.js";

// market.stat_field (de jogador) → campo no /events/{id}/stats/ (nível TIME).
const TEAM_STAT_FIELD: Record<string, string> = {
  corners: "corner_kicks",
  total_tackle: "total_tackles",
  shots_on_target: "shots_on_target",
  total_shots: "total_shots",
};

const uncertaintyFor = (n: number): string => (n < 5 ? "alta" : n < 12 ? "media" : "baixa");

const POS_LABEL: Record<string, string> = { D: "defensores", M: "meio-campistas", F: "atacantes" };

/** Fonte primária: BSD/Bzzoiro. Métodos de I/O são async (client faz fetch). */
export class BSDStatsProvider {
  static HOME_FACTOR = 1.08;
  static AWAY_FACTOR = 0.92;
  static OPP_MULT_MIN = 0.7;
  static OPP_MULT_MAX = 1.4;

  private positionalTiltOn: boolean;
  private posCache = new Map<string, string>();

  constructor(private client: any, opts: { positionalTilt?: boolean } = {}) {
    if (client == null) throw new Error("BSDStatsProvider requer um BSDClient");
    this.positionalTiltOn = opts.positionalTilt ?? POSITIONAL_TILT_ENABLED;
  }

  private oppTeamId(ctx: any): string | null {
    const explicit = ctx.opp_team_id;
    if (explicit) return String(explicit);
    const event = ctx.event ?? {};
    const isHome = ctx.is_home ?? false;
    const other = (isHome ? event.away_team : event.home_team) ?? {};
    return other.id ? String(other.id) : null;
  }

  private async teamConceded(
    oppTeamId: string | null, teamField: string, window = 10,
    opts: { byPlayer?: boolean } = {},
  ): Promise<number | null> {
    if (!oppTeamId) return null;
    const tid = String(oppTeamId);
    let events: any;
    try { events = await this.client.events({ team_id: tid, status: "finished", limit: window }); }
    catch { return null; }
    const results: any[] = Array.isArray(events?.results) ? events.results : [];
    // Campos sem contagem de TIME (ex.: won_tackle — o /stats/ traz % não-contagem)
    // são agregados somando o stat dos JOGADORES adversários por jogo.
    if (opts.byPlayer) {
      let total = 0, games = 0;
      for (const ev of results.slice(0, window)) {
        let rows: any[];
        try { rows = (await this.client.eventPlayerStats(ev.id))?.player_stats ?? []; }
        catch { continue; }
        const against = rows.filter((r) => r.player_id != null && String(r.team_id) !== tid);
        if (against.length === 0) continue;
        games++;
        for (const r of against) total += Number(r[teamField] ?? 0);
      }
      return games === 0 ? null : total / games;
    }
    const values: number[] = [];
    for (const ev of results.slice(0, window)) {
      const concededSide = String(ev.home_team_id) === tid ? "away" : "home";
      let value: any = null;
      try {
        const stats = (await this.client.eventStats(ev.id))?.stats ?? {};
        value = stats[concededSide]?.[teamField];
      } catch { value = null; }
      if (value != null) values.push(Number(value));
    }
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /** Posse média (%) do time `teamId` nos últimos `window` jogos finalizados.
   * DESCRITIVO (I5): contexto de confronto pra IA — NÃO entra no μ/edge. Reusa
   * o mesmo /events/ + /stats/ que a concessão já busca (cache do client). */
  private async teamPossession(teamId: string | null, window = 10): Promise<number | null> {
    if (!teamId) return null;
    const tid = String(teamId);
    let events: any;
    try { events = await this.client.events({ team_id: tid, status: "finished", limit: window }); }
    catch { return null; }
    const results: any[] = Array.isArray(events?.results) ? events.results : [];
    const vals: number[] = [];
    for (const ev of results.slice(0, window)) {
      const side = String(ev.home_team_id) === tid ? "home" : "away"; // lado do PRÓPRIO time
      try {
        const stats = (await this.client.eventStats(ev.id))?.stats ?? {};
        const v = stats[side]?.ball_possession;
        if (v != null) vals.push(Number(v));
      } catch { /* pula jogo sem stats */ }
    }
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  /** event_id → home_team_id pros jogos do histórico do jogador. 1 chamada
   * /events/ por time distinto (cacheada no client). Falha → mapa parcial:
   * o split casa/fora degrada pra null, nunca estima mando. */
  private async homeAwayMap(games: any[], window = 10): Promise<Map<string, string>> {
    const teamIds = [...new Set(games.slice(-window).map((g) => String(g?.team_id ?? "")))]
      .filter((t) => t && t !== "undefined" && t !== "null");
    const map = new Map<string, string>();
    for (const tid of teamIds) {
      let events: any;
      try { events = await this.client.events({ team_id: tid, status: "finished", limit: 30 }); }
      catch { continue; }
      for (const ev of (Array.isArray(events?.results) ? events.results : [])) {
        if (ev?.id != null && ev?.home_team_id != null) map.set(String(ev.id), String(ev.home_team_id));
      }
    }
    return map;
  }

  private async playerPosition(pid: unknown): Promise<string> {
    const key = String(pid);
    const hit = this.posCache.get(key);
    if (hit) return hit;
    let pos = "?";
    try { pos = String((await this.client.player(pid))?.position ?? "?"); } catch { /* neutro */ }
    this.posCache.set(key, pos);
    return pos;
  }

  /** Concessão do adversário POR POSIÇÃO (D/M/F) no statField de jogador, nos
   * últimos `window` jogos. null se sem dado — quem chama cai pro neutro. */
  private async teamConcededByPosition(
    oppTeamId: string | null, statField: string, window = 10,
  ): Promise<{ byPos: Record<string, number>; total: number; games: number } | null> {
    if (!oppTeamId) return null;
    const tid = String(oppTeamId);
    let events: any;
    try { events = await this.client.events({ team_id: tid, status: "finished", limit: window }); }
    catch { return null; }
    const results: any[] = Array.isArray(events?.results) ? events.results : [];
    const byPos: Record<string, number> = { D: 0, M: 0, F: 0 };
    let total = 0, games = 0;
    for (const ev of results.slice(0, window)) {
      let rows: any[];
      try { rows = (await this.client.eventPlayerStats(ev.id))?.player_stats ?? []; }
      catch { continue; }
      const against = rows.filter((r) => r.player_id != null && String(r.team_id) !== tid);
      if (against.length === 0) continue;
      games++;
      for (const r of against) {
        const v = Number(r[statField] ?? 0);
        if (!(v > 0)) continue;
        const pos = await this.playerPosition(r.player_id);
        if (pos in byPos) { byPos[pos] = byPos[pos]! + v; total += v; }
      }
    }
    if (games === 0 || total <= 0) return null;
    return { byPos, total, games };
  }

  private oppMult(oppConceded: number | null, leagueAvg: number): number {
    if (oppConceded == null) return 1.0;
    const mult = opponentMultiplier(oppConceded, leagueAvg);
    return Math.max(BSDStatsProvider.OPP_MULT_MIN, Math.min(BSDStatsProvider.OPP_MULT_MAX, mult));
  }

  async squad(event: any): Promise<any[]> {
    const data = await this.client.lineups(event.id);
    const lineups = data?.lineups ?? {};
    const players: any[] = [];
    for (const side of ["home", "away"] as const) {
      const sideData = lineups[side] ?? {};
      const teamId = String(sideData.team_id ?? "");
      for (const p of sideData.players ?? []) {
        players.push({ id: String(p.id), name: p.name, team_id: teamId, posicao: p.position ?? "" });
      }
    }
    return players;
  }

  async entityRate(entityId: unknown, market: MarketSpec, ctx: any): Promise<EntityRate | null> {
    if (market.kind !== "contagem") return null;
    const isHome: boolean = ctx.is_home ?? false;
    const leagueAvg: number = ctx.league_avg_conceded ?? 1.0;
    const xiTeamIds: Set<string> = ctx.xi_team_ids ?? new Set();
    const entityTeamId = String(ctx.entity_team_id ?? entityId);

    let raw: any;
    try { raw = await this.client.playerStats(entityId); } catch { return null; }
    const results: any[] = Array.isArray(raw?.results) ? raw.results : [];
    if (results.length === 0) return null;
    // BSD entrega recente-primeiro; a conta espera crescente (recente no fim).
    let games = [...results].reverse();
    const scope = ctx.escopo_historico ?? "todos";
    games = filterGamesByScope(games, scope, entityTeamId);
    if (games.length === 0) return null;

    // opp_mode "none" (passes): NÃO consulta a concessão do adversário — o eixo teria
    // sinal invertido (somaria a posse do rival), então oppMult é neutro (1.0) e
    // concedido_adversario fica null (não há confronto, vs "n/d (neutro)" = sem dado).
    let oppConceded: number | null = null;
    let oppMult = 1.0;
    if ((market.opp_mode ?? "concession") !== "none") {
      const concedeField = market.concede_field ?? market.stat_field;
      const teamField = TEAM_STAT_FIELD[concedeField] ?? concedeField;
      // Sem campo de TIME (ex.: won_tackle, was_fouled) → agregar dos jogadores adversários.
      const byPlayer = !(concedeField in TEAM_STAT_FIELD);
      oppConceded = await this.teamConceded(this.oppTeamId(ctx), teamField, 10, { byPlayer });
      oppMult = this.oppMult(oppConceded, leagueAvg);
    }

    let tilt = 1.0;
    let positionalNote: string | null = null;
    const pos = String(ctx.posicao ?? "");
    const shareBase = POSITIONAL_SHARE_NACIONAL[market.stat_field]?.[pos] ?? null;
    if (this.positionalTiltOn && shareBase != null && shareBase > 0) {
      const byPos = await this.teamConcededByPosition(this.oppTeamId(ctx), market.stat_field);
      if (byPos != null && byPos.games >= POSITIONAL_MIN_GAMES) {
        const shareAdv = (byPos.byPos[pos] ?? 0) / byPos.total;
        tilt = positionalTilt(shareAdv, shareBase);
        const perGame = (byPos.byPos[pos] ?? 0) / byPos.games;
        positionalNote = `${perGame.toFixed(1)}/jogo a ${POS_LABEL[pos] ?? pos} (${tilt.toFixed(2)}× o típico)`;
      }
    }
    const oppMultFinal = Math.max(
      BSDStatsProvider.OPP_MULT_MIN,
      Math.min(BSDStatsProvider.OPP_MULT_MAX, oppMult * tilt),
    );

    const haMult = homeAwayMultiplier(isHome, BSDStatsProvider.HOME_FACTOR, BSDStatsProvider.AWAY_FACTOR);
    const minutes = expectedMinutes(games) ?? 90.0;

    const calc = playerMuFromGames(
      games, market.stat_field, market.prior_rate, market.prior_strength, oppMultFinal, haMult, minutes,
    );
    if (calc === null) return null;
    const xiConfirmed = xiTeamIds.size > 0 ? xiTeamIds.has(String(entityId)) : true;
    const n = calc.n;

    // Decomposição (desarme ganho): μ_ganhos = μ_tentativas × aproveitamento.
    // O aproveitamento (won/total no histórico) é encolhido p/ a média da liga
    // (wr_prior) com peso wr_shrink — robusto p/ quem tem poucas tentativas.
    let mu = calc.mu;
    let decompTrace: { winRate: number; attemptsMu: number; baseLabel: string; won_label: string } | undefined;
    if (market.mu_decomp) {
      const d = market.mu_decomp;
      let sumNum = 0, sumBase = 0;
      for (const g of games) {
        sumNum += Number((g as any)[d.num_field] ?? 0);
        sumBase += Number((g as any)[market.stat_field] ?? 0);
      }
      const winRate = (sumNum + d.wr_shrink * d.wr_prior) / (sumBase + d.wr_shrink);
      mu = calc.mu * winRate;
      decompTrace = { winRate, attemptsMu: calc.mu, baseLabel: d.base_label, won_label: d.won_label };
    }

    const trace = buildRateTrace({
      statField: market.stat_field,
      games,
      rawRate: calc.raw_rate,
      shrunk: calc.shrunk,
      priorRate: market.prior_rate,
      priorStrength: market.prior_strength,
      n,
      minutos: minutes,
      oppMult: oppMultFinal,
      haMult,
      oppConceded,
      isHome,
      mu,
      decomp: decompTrace
        ? { winRate: decompTrace.winRate, attemptsMu: decompTrace.attemptsMu, baseLabel: decompTrace.baseLabel, wonLabel: decompTrace.won_label }
        : undefined,
    });
    const statsDetalhadas = detailedStats(games, market.stat_field, await this.homeAwayMap(games));
    const posseAdversario = await this.teamPossession(this.oppTeamId(ctx));
    return {
      mu, minutos_esperados: minutes,
      xi_confirmado: xiConfirmed, amostra_jogos: n,
      concedido_adversario: (market.opp_mode ?? "concession") === "none"
        ? null // sem eixo de confronto (passes): null, não "n/d (neutro)" (que = sem dado)
        : oppConceded != null ? oppConceded.toFixed(1) : "n/d (neutro)",
      incerteza: uncertaintyFor(n),
      trace,
      concedido_posicao: positionalNote,
      stats_detalhadas: statsDetalhadas,
      posse_adversario: posseAdversario,
    };
  }

  async xiIds(event: any): Promise<Set<string>> {
    let data: any;
    try { data = await this.client.lineups(event.id); } catch { return new Set(); }
    const lineups = data?.lineups ?? {};
    const status = data?.lineup_status;
    const confirmedFlag = Object.values(lineups).some((v: any) => v && typeof v === "object" && v.confirmed);
    if (status !== "confirmed" && !confirmedFlag) return new Set();
    const ids = new Set<string>();
    for (const side of ["home", "away"] as const) {
      for (const p of lineups[side]?.players ?? []) ids.add(String(p.id));
    }
    return ids;
  }

  async teamRate(teamId: unknown, market: MarketSpec, ctx: any, window = 10): Promise<EntityRate | null> {
    if (market.kind !== "contagem") return null;
    const tid = String(teamId);
    const teamField = TEAM_STAT_FIELD[market.stat_field] ?? market.stat_field;
    const events = await this.client.events({ team_id: tid, status: "finished", limit: window });
    const results: any[] = Array.isArray(events?.results) ? events.results : [];
    let games: any[] = [];
    for (const ev of results.slice(0, window)) {
      const side = String(ev.home_team_id) === tid ? "home" : "away";
      let value: any = null;
      try {
        const stats = (await this.client.eventStats(ev.id))?.stats ?? {};
        value = stats[side]?.[teamField];
      } catch { value = null; }
      if (value != null) games.push({ [teamField]: value });
    }
    if (games.length === 0) return null;
    games = games.reverse();
    const rates = windowedRate(games, teamField);
    const w5 = rates["w5"], w3 = rates["w3"], w10 = rates["w10"];
    const rawRate = w5 != null ? w5 : w3 != null ? w3 : w10;
    if (rawRate == null) return null;
    const shrunk = shrinkRate(rawRate, games.length, market.prior_rate, market.prior_strength);
    const isHome: boolean = ctx.is_home ?? false;
    const haMult = homeAwayMultiplier(isHome, BSDStatsProvider.HOME_FACTOR, BSDStatsProvider.AWAY_FACTOR);
    const leagueAvg = ctx.league_avg_conceded ?? market.concede_baseline;
    const oppConceded = await this.teamConceded(this.oppTeamId(ctx), teamField, window);
    const oppMult = this.oppMult(oppConceded, leagueAvg);
    const mu = assembleMu(shrunk, 90.0, oppMult, haMult);
    const n = games.length;
    return {
      mu, minutos_esperados: 90.0, xi_confirmado: true, amostra_jogos: n,
      concedido_adversario: oppConceded != null ? oppConceded.toFixed(1) : "n/d (neutro)",
      incerteza: uncertaintyFor(n),
    };
  }

  async teamRates(teamId: unknown, _ctx: any, window = 10): Promise<{ lambda_for: number; lambda_against: number } | null> {
    const tid = String(teamId);
    let evs: any;
    try { evs = await this.client.events({ team_id: tid, status: "finished", limit: window }); }
    catch { return null; }
    const results: any[] = Array.isArray(evs?.results) ? evs.results : [];
    const goalsFor: number[] = [], goalsAgainst: number[] = [];
    for (const ev of results.slice(0, window)) {
      let g: any, c: any;
      if (String(ev.home_team_id) === tid) { g = ev.home_score; c = ev.away_score; }
      else { g = ev.away_score; c = ev.home_score; }
      if (g != null) goalsFor.push(Number(g));
      if (c != null) goalsAgainst.push(Number(c));
    }
    if (goalsFor.length === 0) return null;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      lambda_for: avg(goalsFor),
      lambda_against: goalsAgainst.length > 0 ? avg(goalsAgainst) : avg(goalsFor),
    };
  }
}

/** Envolve um StatsProvider (BSD) e resolve player_ids da escalação (lineup-namespace,
 * que dá 404) p/ stats-ids reais, casando por NOME. */
export class CrosswalkStatsProvider {
  constructor(private inner: any, private client: any, private n = 5, private threshold = 0.85) {
    if (inner == null || client == null) throw new Error("CrosswalkStatsProvider requer inner e client não-nulos");
  }

  async squad(event: any): Promise<any[]> {
    const raw: any[] = await this.inner.squad(event);
    const out: any[] = [];
    const teamIds = [...new Set(raw.map((p) => p.team_id ?? ""))];
    for (const teamId of teamIds) {
      const group = raw.filter((p) => (p.team_id ?? "") === teamId);
      const map = await buildTeamMap(this.client, teamId, this.n);
      out.push(...resolve(group, map, this.threshold));
    }
    return out;
  }

  async xiIds(event: any): Promise<Set<string>> {
    const innerXi = typeof this.inner.xiIds === "function" ? await this.inner.xiIds(event) : new Set();
    if (!innerXi || innerXi.size === 0) return new Set();
    return new Set((await this.squad(event)).map((p) => p.id));
  }

  entityRate(id: unknown, market: MarketSpec, ctx: any) { return this.inner.entityRate(id, market, ctx); }
  teamRate(...args: any[]) { return this.inner.teamRate(...args); }
  teamRates(...args: any[]) { return this.inner.teamRates(...args); }
}

/** Restringe elenco() a UM jogador (id exato ou substring de nome). Delega o resto. */
export class OnlyPlayer {
  private ref: string;
  constructor(private p: any, playerRef: string) { this.ref = String(playerRef); }

  async squad(event: any): Promise<any[]> {
    const all: any[] = await this.p.squad(event);
    const ref = this.ref.toLowerCase();
    const filtered = all.filter((p) => String(p.id) === this.ref || p.name.toLowerCase().includes(ref));
    if (filtered.length === 0) {
      const available = all.map((p) => `${p.name} (id=${p.id})`).join(", ");
      throw new Error(`jogador '${this.ref}' não encontrado no elenco. Disponíveis: ${available}`);
    }
    return filtered;
  }

  entityRate(id: unknown, market: MarketSpec, ctx: any) { return this.p.entityRate(id, market, ctx); }
  teamRate(...args: any[]) { return this.p.teamRate(...args); }
  teamRates(...args: any[]) { return this.p.teamRates(...args); }
  xiIds(event: any) { return typeof this.p.xiIds === "function" ? this.p.xiIds(event) : new Set<string>(); }
}
