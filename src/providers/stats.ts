import type { MarketSpec } from "../model/markets.js";
import {
  windowedRate, assembleMu, filterGamesByScope, playerMuFromGames, expectedMinutes,
} from "../model/assemble.js";
import { shrinkRate } from "../model/shrinkage.js";
import { opponentMultiplier, homeAwayMultiplier } from "../model/adjustments.js";
import { buildTeamMap, resolve } from "../crosswalk/bsdIds.js";
import type { EntityRate } from "./types.js";
import { buildRateTrace } from "../model/trace.js";

// market.stat_field (de jogador) → campo no /events/{id}/stats/ (nível TIME).
const TEAM_STAT_FIELD: Record<string, string> = {
  corners: "corner_kicks",
  total_tackle: "total_tackles",
  shots_on_target: "shots_on_target",
  total_shots: "total_shots",
};

const uncertaintyFor = (n: number): string => (n < 5 ? "alta" : n < 12 ? "media" : "baixa");

/** Fonte primária: BSD/Bzzoiro. Métodos de I/O são async (client faz fetch). */
export class BSDStatsProvider {
  static HOME_FACTOR = 1.08;
  static AWAY_FACTOR = 0.92;
  static OPP_MULT_MIN = 0.7;
  static OPP_MULT_MAX = 1.4;

  constructor(private client: any) {
    if (client == null) throw new Error("BSDStatsProvider requer um BSDClient");
  }

  private oppTeamId(ctx: any): string | null {
    const explicit = ctx.opp_team_id;
    if (explicit) return String(explicit);
    const event = ctx.event ?? {};
    const isHome = ctx.is_home ?? false;
    const other = (isHome ? event.away_team : event.home_team) ?? {};
    return other.id ? String(other.id) : null;
  }

  private async teamConceded(oppTeamId: string | null, teamField: string, window = 10): Promise<number | null> {
    if (!oppTeamId) return null;
    const tid = String(oppTeamId);
    let events: any;
    try { events = await this.client.events({ team_id: tid, status: "finished", limit: window }); }
    catch { return null; }
    const results: any[] = Array.isArray(events?.results) ? events.results : [];
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

    const teamField = TEAM_STAT_FIELD[market.stat_field] ?? market.stat_field;
    const oppConceded = await this.teamConceded(this.oppTeamId(ctx), teamField);
    const oppMult = this.oppMult(oppConceded, leagueAvg);
    const haMult = homeAwayMultiplier(isHome, BSDStatsProvider.HOME_FACTOR, BSDStatsProvider.AWAY_FACTOR);
    const minutes = expectedMinutes(games) ?? 90.0;

    const calc = playerMuFromGames(
      games, market.stat_field, market.prior_rate, market.prior_strength, oppMult, haMult, minutes,
    );
    if (calc === null) return null;
    const xiConfirmed = xiTeamIds.size > 0 ? xiTeamIds.has(String(entityId)) : true;
    const n = calc.n;
    const trace = buildRateTrace({
      statField: market.stat_field,
      games,
      rawRate: calc.raw_rate,
      shrunk: calc.shrunk,
      priorRate: market.prior_rate,
      priorStrength: market.prior_strength,
      n,
      minutos: minutes,
      oppMult,
      haMult,
      oppConceded,
      isHome,
      mu: calc.mu,
    });
    return {
      mu: calc.mu, minutos_esperados: minutes,
      xi_confirmado: xiConfirmed, amostra_jogos: n,
      concedido_adversario: oppConceded != null ? oppConceded.toFixed(1) : "n/d (neutro)",
      incerteza: uncertaintyFor(n),
      trace,
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
