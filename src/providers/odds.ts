import type { MarketSpec } from "../model/markets.js";
import type { OddsLine, OddsProvider } from "./types.js";
import { ODDSAPI_MATCH_MARKET, findEvent, parseTotals, parseH2h, fetchEvents, fetchEventOdds } from "../odds/theOddsApi.js";

const BSD_MARKET_KEY: Record<string, string> = {
  escanteios: "corners_total",
  gols: "goals_total",
  vitoria: "match_winner",
};

/** Sem odds externas — modo modelo-only. */
export class NullOdds implements OddsProvider {
  lines(): OddsLine[] { return []; }
}

/** Odds fornecidas manualmente (colar da casa). */
export class ManualOdds implements OddsProvider {
  constructor(private _lines: OddsLine[]) {}
  lines(): OddsLine[] { return this._lines; }
}

/** Odds de PARTIDA via The Odds API (gols=totals, vitoria=h2h). fetch* injetáveis p/ teste. */
export class TheOddsApiMatchOdds implements OddsProvider {
  private fetchEvents: (sport: string) => Promise<any[]>;
  private fetchOdds: (sport: string, id: string, markets: string, regions: string) => Promise<any>;
  constructor(
    private sport = "soccer_fifa_world_cup",
    private regions = "us,uk,eu",
    opts: { fetchEventsFn?: (s: string) => Promise<any[]>; fetchEventOddsFn?: (s: string, id: string, m: string, r: string) => Promise<any> } = {},
  ) {
    this.fetchEvents = opts.fetchEventsFn ?? fetchEvents;
    this.fetchOdds = opts.fetchEventOddsFn ?? ((s, id, m, r) => fetchEventOdds(s, id, m, r));
  }

  async lines(event: any, market: MarketSpec): Promise<OddsLine[]> {
    const oddsapiMarket = ODDSAPI_MATCH_MARKET[market.key];
    if (oddsapiMarket == null) return [];
    const home = event?.home_team?.name ?? "";
    const away = event?.away_team?.name ?? "";
    try {
      const events = await this.fetchEvents(this.sport);
      const matched = findEvent(events, home, away);
      if (matched == null) return [];
      const evOdds = await this.fetchOdds(this.sport, matched.id, oddsapiMarket, this.regions);
      return oddsapiMarket === "totals" ? parseTotals(evOdds) : parseH2h(evOdds, home, away);
    } catch {
      return [];
    }
  }
}

/** Odds de partida via BSD /events/{id}/odds/. */
export class BSDMatchOdds implements OddsProvider {
  constructor(private client: any = null) {}
  async lines(event: any, market: MarketSpec): Promise<OddsLine[]> {
    const key = BSD_MARKET_KEY[market.key];
    if (key == null) return [];
    let data: any;
    try { data = await this.client.eventOdds(event.id); } catch { return []; }
    const grouped = new Map<string, any>();
    for (const bm of data?.bookmakers ?? []) {
      const book = bm.name ?? "";
      for (const mk of bm.markets ?? []) {
        if (mk.key !== key) continue;
        for (const o of mk.outcomes ?? []) {
          const name = String(o.name ?? "").toLowerCase();
          const point = o.point, price = o.price;
          if (point == null || price == null) continue;
          const gk = `${book}|${point}`;
          const e = grouped.get(gk) ?? { entidade: "partida", linha: point, odd_over: null, odd_under: null, book };
          if (name === "over") e.odd_over = price;
          else if (name === "under") e.odd_under = price;
          grouped.set(gk, e);
        }
      }
    }
    return [...grouped.values()].filter((l) => l.odd_over && l.odd_under);
  }
}
