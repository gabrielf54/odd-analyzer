import { getRequired } from "../config.js";
import { cachedGet } from "../lib/cache.js";

const BASE = "https://api.the-odds-api.com/v4";
// market.key (nosso) → market key do The Odds API. Só mercados de PARTIDA.
export const ODDSAPI_MATCH_MARKET: Record<string, string> = { gols: "totals", vitoria: "h2h" };

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Normaliza nome de time p/ casar entre fontes: minúsculo, sem acento, só alfanum. */
export function normTeam(name: unknown): string {
  const s = String(name ?? "").normalize("NFKD").replace(DIACRITICS, "");
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Acha o evento do The Odds API que casa o par (home, away). Order-aware (mando importa). */
export function findEvent(events: any[], home: string, away: string): any | null {
  const h = normTeam(home), a = normTeam(away);
  for (const ev of events) {
    if (normTeam(ev.home_team) === h && normTeam(ev.away_team) === a) return ev;
  }
  return null;
}

/** Mercado 'totals' (gols O/U). Agrupa por (casa,linha); descarta linha sem os dois lados. */
export function parseTotals(event: any): { entidade: string; linha: number; odd_over: number; odd_under: number; book: string }[] {
  const grouped = new Map<string, any>();
  for (const bm of event?.bookmakers ?? []) {
    const book = bm.key;
    for (const mk of bm.markets ?? []) {
      if (mk.key !== "totals") continue;
      for (const o of mk.outcomes ?? []) {
        const point = o.point, name = String(o.name ?? "").toLowerCase(), price = o.price;
        if (point == null || price == null) continue;
        const k = `${book}|${point}`;
        const e = grouped.get(k) ?? { entidade: "partida", linha: point, book, odd_over: null, odd_under: null };
        if (name === "over") e.odd_over = price;
        else if (name === "under") e.odd_under = price;
        grouped.set(k, e);
      }
    }
  }
  return [...grouped.values()].filter((l) => l.odd_over && l.odd_under);
}

/** Mercado 'h2h' (1X2). odd_over=home, odd_under=away, odd_draw disponível. */
export function parseH2h(event: any, home: string, away: string): any[] {
  const h = normTeam(home), a = normTeam(away);
  const out: any[] = [];
  for (const bm of event?.bookmakers ?? []) {
    const book = bm.key;
    for (const mk of bm.markets ?? []) {
      if (mk.key !== "h2h") continue;
      const prices: Record<string, number | null> = { home: null, away: null, draw: null };
      for (const o of mk.outcomes ?? []) {
        const nm = normTeam(o.name), price = o.price;
        if (nm === h) prices.home = price;
        else if (nm === a) prices.away = price;
        else if (String(o.name ?? "").toLowerCase().includes("draw")) prices.draw = price;
      }
      if (prices.home && prices.away) {
        out.push({ entidade: "partida", linha: 0.0, book, odd_over: prices.home, odd_under: prices.away, odd_draw: prices.draw });
      }
    }
  }
  return out;
}

async function get(path: string, params: Record<string, string>, shouldCache: (d: any) => boolean = (d) => Boolean(d)): Promise<any> {
  const key = getRequired("THE_ODDS_API_KEY");
  const p = { ...params, apiKey: key };
  const keystr = `${path}?${Object.entries(p).filter(([k]) => k !== "apiKey").sort().map(([k, v]) => `${k}=${v}`).join("&")}`;
  return cachedGet(keystr, async () => {
    const qs = new URLSearchParams(p).toString();
    const r = await fetch(`${BASE}/${path}?${qs}`);
    if (!r.ok) throw new Error(`TheOddsAPI ${r.status}`);
    return r.json();
  }, { shouldCache });
}

export function fetchEvents(sportKey: string): Promise<any[]> {
  return get(`sports/${sportKey}/events`, {});
}

const temProps = (odds: any) => Boolean(odds?.bookmakers?.length);

export function fetchEventOdds(sportKey: string, eventId: string, markets = "player_shots_on_target", regions = "us"): Promise<any> {
  return get(`sports/${sportKey}/events/${eventId}/odds`, { markets, regions, oddsFormat: "decimal" }, temProps);
}
