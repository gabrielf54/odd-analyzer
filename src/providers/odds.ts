import type { MarketSpec } from "../model/markets.js";
import type { OddsLine, OddsProvider } from "./types.js";
import { ODDSAPI_MATCH_MARKET, findEvent, parseTotals, parseH2h, fetchEvents, fetchEventOdds } from "../odds/theOddsApi.js";
import { parseBsdMatchOdds } from "../odds/bsdMatchOdds.js";

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

/** Odds de PARTIDA via BSD /events/{id}/odds/ (formato PLANO real — spike 2026-06-15;
 * ver src/odds/bsdMatchOdds.ts). gols=totais over/under; vitória=mandante (3-vias). */
export class BSDMatchOdds implements OddsProvider {
  constructor(private client: any = null) {}
  async lines(event: any, market: MarketSpec): Promise<OddsLine[]> {
    let raw: any;
    try { raw = await this.client.eventOdds(event.id); } catch { return []; }
    const p = parseBsdMatchOdds(raw);
    if (market.kind === "partida_totais") {
      const out: OddsLine[] = [];
      for (const [k, t] of Object.entries(p.totals)) {
        if (t.over != null && t.under != null) {
          out.push({ entidade: "partida", linha: Number(k), odd_over: t.over, odd_under: t.under, book: "bsd" });
        }
      }
      return out;
    }
    if (market.kind === "partida_1x2") {
      if (p.home_win == null) return [];
      // 1X2 é 3-vias; o de-vig correto (mandante/empate/visitante) vive em
      // bsdMatchOdds.matchFairProb (o forward usa ele). Aqui devolvemos só o mandante
      // com odd_under=null → buildCandidate cai no de-vig CONSERVADOR (implícita crua),
      // que nunca infla valor-fantasma. (Ligar 1X2 no fluxo manual com de-vig 3-vias
      // pediria suporte no runMatch — fora do escopo do forward/CLV.)
      return [{ entidade: "partida", linha: 0.5, odd_over: p.home_win, odd_under: null, odd_draw: p.draw, book: "bsd" }];
    }
    return [];
  }
}
