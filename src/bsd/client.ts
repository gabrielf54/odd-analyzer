import { cachedGet } from "../lib/cache.js";

const BASE = "https://sports.bzzoiro.com/api/v2";

const TTL_ODDS = 300;
const TTL_LINEUP = 300;
const TTL_STATS = 3600;
const TTL_ETERNAL = null;

export type Getter = (url: string, params?: Record<string, unknown>) => Promise<any>;

/** Cliente HTTP fino para a API BSD/Bzzoiro. Em testes, injete `get`. */
export class BSDClient {
  private get: Getter;

  constructor(private apiKey: string, opts: { get?: Getter } = {}) {
    if (!apiKey) throw new Error("api_key não pode ser vazio");
    this.get = opts.get ?? this.makeFetchGet();
  }

  private makeFetchGet(): Getter {
    return async (url, params) => {
      const qs = params
        ? "?" + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
          ).toString()
        : "";
      const r = await fetch(url + qs, { headers: { Authorization: `Token ${this.apiKey}` } });
      if (!r.ok) throw new Error(`BSD ${r.status} ${url}`);
      return r.json();
    };
  }

  private call(path: string, params?: Record<string, unknown>, ttl: number | null = TTL_ETERNAL) {
    const url = `${BASE}${path}`;
    const entries = Object.entries(params ?? {}).map(([k, v]) => [k, String(v)] as [string, string]);
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const qs = new URLSearchParams(entries).toString();
    return cachedGet(`${url}?${qs}`, () => this.get(url, params), { ttlSeconds: ttl });
  }

  events(filtros: Record<string, unknown> = {}) { return this.call("/events/", filtros, TTL_ODDS); }
  getEvent(id: unknown) { return this.call(`/events/${id}/`, undefined, TTL_ETERNAL); }
  eventPlayerStats(id: unknown) { return this.call(`/events/${id}/player-stats/`, undefined, TTL_ETERNAL); }
  playerStats(id: unknown, filtros: Record<string, unknown> = {}) { return this.call(`/players/${id}/stats/`, filtros, TTL_STATS); }
  player(id: unknown) { return this.call(`/players/${id}/`, undefined, TTL_ETERNAL); }
  lineups(id: unknown) { return this.call(`/events/${id}/lineups/`, undefined, TTL_LINEUP); }
  teamStats(id: unknown) { return this.call(`/events/${id}/team-stats/`, undefined, TTL_STATS); }
  eventStats(id: unknown) { return this.call(`/events/${id}/stats/`, undefined, TTL_STATS); }
  eventOdds(id: unknown) { return this.call(`/events/${id}/odds/`, undefined, TTL_ODDS); }
  oddsByBook(id: unknown, market: string, book: string) { return this.call(`/events/${id}/odds/`, { market, book }, TTL_ODDS); }
  nationalPool(teamId: unknown) { return this.call("/players/", { national_team_id: teamId }, TTL_STATS); }
  squad(teamId: unknown) { return this.call(`/teams/${teamId}/squad/`, undefined, TTL_STATS); }
  leagues(filtros: Record<string, unknown> = {}) { return this.call("/leagues/", filtros, TTL_ETERNAL); }
}
