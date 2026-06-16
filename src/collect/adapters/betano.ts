// Adapter BETANO — plataforma PRÓPRIA (1ª parte, www.betano.bet.br); a pesquisa de mesa dizia
// "Kaizen/GameplAI difícil", mas a captura no navegador (deslogado/BR, 2026-06-15, França×Senegal
// eventId 77353568) provou: feed de odds em endpoint de 1ª parte, fetch puro, 200 com
// credentials:'omit', SEM Turnstile interativo e SEM geoblock → needsBrowser:false. (Kameleoon é
// só A/B testing; Sportradar entra só como provedor de STAT, não de odds.)
//
// Quatro fatos do feed que o parser resolve:
// (1) /api/odds = { data: { event: { markets:[...] } } } — markets ANINHADO: cada market carrega
//     selections[] (diferente de Stake/Superbet, que são arrays planos de seleção);
// (2) a CHAVE de de-para é market.typeId NUMÉRICO (id de TIPO de mercado, global — 596/595/599/...);
// (3) o JOGADOR vem embutido em market.name = "{Jogador} {Mercado em PT}" → extrai removendo o
//     sufixo PT do mercado (sufixos conhecidos por typeId em BETANO_MARKET_SUFFIX);
// (4) a LINHA over vem de selection.name = "N+" ("1+"=≥1=over0.5) — NÃO de selection.handicap, que
//     é 0 nos mercados de faltas (usar handicap quebraria faltas). Mercado SUSPENSO simplesmente
//     não aparece em markets[] (não há flag isSuspended). Liquidação Opta: "Total de Desarmes" =
//     won_tackle (Opta conta tackle GANHO, não tentado), "Faltas cometidas" = fouls committed.
// Ver docs/coleta-odds/casas/betano.md.

import type { RawCollectedLine } from "../normalizer.js";
import type { HouseEvent } from "../matchEvent.js";

const BETANO_HOST = "https://www.betano.bet.br";
// Copa do Mundo 2026 — leagueId capturado no recon (event.leagueId = "201663").
const WORLD_CUP_2026_LEAGUE = "201663";

// typeId → rótulo PT do mercado (sufixo a remover de market.name p/ obter o nome do jogador).
// Só os typeIds que o parser precisa limpar (os 4 mapeados); typeId fora daqui usa o nome cheio
// como fallback (será rejeitado pelo de-para de qualquer modo → fail-closed).
const BETANO_MARKET_SUFFIX: Record<number, string> = {
  596: "Chutes no gol",       // SOT (on-target)
  595: "Total de chutes",     // finalizações (total shots)
  599: "Total de Desarmes",   // desarmes ganhos (won_tackle)
  1000679: "Faltas cometidas", // faltas cometidas (fouls committed)
};

/** URL do GET de odds de UM jogo, com os props de jogador ligados. `houseEventId` é o
 * "slug/eventId" (ex.: "franca-senegal/77353568") que o crosswalk extrai do campo `url` da lista
 * — o endpoint precisa do slug no path. Público, deslogado (credentials:'omit' → 200). */
export function betanoEventOddsUrl(houseEventId: string): string {
  return `${BETANO_HOST}/api/odds/${houseEventId}/?bt=3&isPlayersToggle=true&req=s,stnf,c,mb,mbl`;
}

/** URL da LISTA de jogos (base do crosswalk BSD→Betano). Endpoint `league/hot/upcoming`. Default
 * = Copa 2026 (leagueId 201663). Nomes dos times vêm em PT; canonicalTeam resolve PT/EN/FR. */
export function betanoUpcomingUrl(leagueId: string = WORLD_CUP_2026_LEAGUE): string {
  return `${BETANO_HOST}/api/league/hot/upcoming?leagueId=${leagueId}`;
}

interface BetanoSelection { name?: string; price?: number; handicap?: number }
interface BetanoMarket {
  typeId?: number; name?: string; playerId?: string; selections?: BetanoSelection[];
}
interface BetanoOddsResponse { data?: { event?: { markets?: BetanoMarket[] } } }

/** market.name = "{Jogador} {Mercado PT}" → nome do jogador (remove o sufixo PT conhecido pelo
 * typeId). Sufixo desconhecido (typeId não-mapeado) → devolve o nome cheio (rejeitado adiante). */
function betanoPlayer(marketName: string, typeId: number): string {
  const suffix = BETANO_MARKET_SUFFIX[typeId];
  if (suffix) {
    const sfx = suffix.toLowerCase();
    if (marketName.toLowerCase().endsWith(sfx)) {
      return marketName.slice(0, marketName.length - suffix.length).trim();
    }
  }
  return marketName.trim();
}

/** data.event.markets (aninhado) → linhas cruas. market_label = typeId (string), a chave estável
 * do de-para. Linha = selection.name ("N+"); jogador = prefixo de market.name. Pula: market sem
 * playerId (time/partida) / sem typeId / sem name; selection sem name ou sem odd finita. NÃO
 * normaliza (de-para fica no OddsNormalizer + BETANO_TABLE). */
export function parseBetano(data: unknown, book: string): RawCollectedLine[] {
  const markets = (data as BetanoOddsResponse)?.data?.event?.markets;
  if (!Array.isArray(markets)) return [];
  const out: RawCollectedLine[] = [];
  for (const m of markets) {
    if (m?.typeId == null) continue;
    if (m.playerId == null) continue;                          // mercado de time/partida → fora
    if (typeof m.name !== "string" || !m.name.trim()) continue;
    if (!Array.isArray(m.selections)) continue;
    const player = betanoPlayer(m.name, m.typeId);
    if (!player) continue;
    for (const s of m.selections) {
      const linhaRaw = typeof s?.name === "string" ? s.name.trim() : "";
      if (!linhaRaw) continue;                                 // sem "N+" → fail-closed
      const odd = typeof s.price === "number" ? s.price : parseFloat(String(s.price ?? ""));
      if (!Number.isFinite(odd)) continue;                     // sem preço → suspenso/pula
      out.push({
        book, market_label: String(m.typeId), entidade: player,
        linha_raw: linhaRaw, odd_over: odd, odd_under: null, subtype: "over",
      });
    }
  }
  return out;
}

interface BetanoListEvent { id?: string | number; name?: string; url?: string }
interface BetanoListResponse { data?: { events?: BetanoListEvent[] } }

/** Lista de jogos (league/hot/upcoming → { data: { events:[...] } }) → {id, home, away} p/
 * crosswalk. id = "slug/eventId" extraído do campo `url` ("/odds/franca-senegal/77353568/") — o
 * endpoint de odds precisa do slug. Times em `name` "A - B" (PT) → split " - "; canonicalTeam
 * resolve PT/EN/FR no matchEventByName. */
export function parseBetanoEventList(data: unknown): HouseEvent[] {
  const events = (data as BetanoListResponse)?.data?.events;
  if (!Array.isArray(events)) return [];
  const out: HouseEvent[] = [];
  for (const e of events) {
    const nm = e?.name;
    if (typeof nm !== "string") continue;
    const parts = nm.split(" - ");
    if (parts.length !== 2) continue;
    const home = parts[0]!.trim(), away = parts[1]!.trim();
    if (!home || !away) continue;
    // id = slug/eventId do campo url; sem url legível, cai pro id cru (sem slug).
    let id: string | null = null;
    const um = typeof e.url === "string" ? e.url.match(/\/odds\/([^/]+)\/(\d+)\/?/) : null;
    if (um) id = `${um[1]}/${um[2]}`;
    else if (e.id != null) id = String(e.id);
    if (!id) continue;
    out.push({ id, home, away });
  }
  return out;
}
