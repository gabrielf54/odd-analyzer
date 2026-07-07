// Adapter SUPERBET — plataforma própria "Betler", odds servidas por CDN Fastly. Endpoint
// REST GET ÚNICO e PÚBLICO (deslogado, sem token/cookie): traz a oferta inteira do jogo.
// Confirmado na captura de 2026-06-15 (Suécia×Tunísia, eventId 12512182, BR). Sem
// Cloudflare/Turnstile/geoblock → fetch puro (needsBrowser:false). Difere das outras casas
// em três pontos que o parser resolve: (1) data[0].odds é array PLANO de seleções — cada
// item carrega o próprio marketId/marketName, não há objeto "market" pai (agrupa por
// marketId); (2) é ESCADA "Mais de X.5" (one-sided over, hasUnder=false); (3) a CHAVE de
// de-para é o marketId NUMÉRICO (code é null, não há rótulo EN; marketName em PT varia). A
// LINHA vem do campo numérico limpo specifiers.total; o JOGADOR de
// extra["replaced-spec-player_name"] (nome cheio) com fallback specifiers.player_name.
// Liquidação Sportradar/Betradar (betradarId + sr:player no feed), igual Betnacional.
// Ver docs/coleta-odds/casas/superbet.md.

import type { RawCollectedLine } from "../normalizer.js";
import type { HouseEvent } from "../matchEvent.js";

const SUPERBET_HOST = "https://production-superbet-offer-br.freetls.fastly.net";

/** URL do GET de odds de UM evento (todos os mercados, incl. props de jogador). `eventId` é
 * o id interno inteiro da Superbet (ex.: 12512182), NÃO o event_id da BSD → precisa de
 * crosswalk (superbetEventsByDateUrl + matchEventByName). Público, deslogado. */
export function superbetEventOddsUrl(eventId: string | number): string {
  return `${SUPERBET_HOST}/v2/pt-BR/events/${eventId}`;
}

function fmtDate(d: Date): string {
  // "YYYY-MM-DD HH:MM:SS" em UTC (formato do param startDate/endDate da casa).
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** URL da LISTA de jogos (base do crosswalk BSD→Superbet). Endpoint `events/by-date` (REST
 * JSON, não-SSE; o /structure é SSE e só dá resourceIds, inútil aqui). `startDate` é
 * OBRIGATÓRIO; `sportId=5`=futebol. Por padrão NÃO filtra por tournamentIds (o set completo
 * da Copa não foi cravado) — busca o futebol da janela e deixa o matchEventByName casar pelo
 * nome; passe `tournamentIds` p/ estreitar. Janela default = [agora−1d, agora+21d] (cobre os
 * próximos jogos). Datas explícitas tornam o builder determinístico (teste). */
export function superbetEventsByDateUrl(opts: {
  start?: Date; end?: Date; tournamentIds?: string; sportId?: number;
} = {}): string {
  const start = opts.start ?? new Date(Date.now() - 1 * 86400_000);
  const end = opts.end ?? new Date(Date.now() + 21 * 86400_000);
  const sportId = opts.sportId ?? 5;
  const qs = new URLSearchParams({
    currentStatus: "active", offerState: "prematch", sportId: String(sportId),
    startDate: fmtDate(start), endDate: fmtDate(end),
  });
  if (opts.tournamentIds) qs.set("tournamentIds", opts.tournamentIds);
  return `${SUPERBET_HOST}/v2/pt-BR/events/by-date?${qs.toString()}`;
}

interface SuperbetOutcome {
  marketId?: number; marketName?: string; price?: number; status?: string;
  name?: string; info?: string;
  specifiers?: { total?: string; player_id?: string; player_name?: string } | null;
  extra?: Record<string, unknown> | null;
}
interface SuperbetEvent { eventId?: number; matchName?: string; odds?: SuperbetOutcome[] }
interface SuperbetResponse { data?: SuperbetEvent[] }

/** Só seleções de JOGADOR entram (têm specifiers.player_name OU
 * extra["betradar-player-id"]). Mercados de time/partida (sem jogador) são pulados aqui —
 * o de-para nunca os vê. O resto da decisão (quais marketIds valem) é do SUPERBET_TABLE. */
function playerName(o: SuperbetOutcome): string | null {
  const full = o.extra?.["replaced-spec-player_name"];
  if (typeof full === "string" && full.trim()) return full.trim();
  const pn = o.specifiers?.player_name;
  if (typeof pn === "string" && pn.trim()) return pn.trim();
  return null;
}

/** data[0].odds (array PLANO de seleções) → linhas cruas. market_label = marketId (string),
 * a chave estável do de-para. Linha = specifiers.total (número). Jogador: escada over-only
 * (como sempre). PARTIDA (recon 2026-07-06, USA×Belgium 13865395): totais com name
 * "Mais/Menos de X.5" + specifiers.total → PAREIA os dois lados por (marketId, total);
 * 1X2 com name "1"/"X"/"2" → raw subtype "1x2". Qual marketId vale (200734 gols, 704
 * escanteios, 547 1X2 — asiático/halves/time ficam fora) é decisão do de-para. */
export function parseSuperbet(data: unknown, book: string): RawCollectedLine[] {
  const events = (data as SuperbetResponse)?.data;
  if (!Array.isArray(events)) return [];
  const out: RawCollectedLine[] = [];
  const totals = new Map<string, { marketId: number; linha: number; over?: number; under?: number }>();
  const wdw = new Map<number, { home?: number; draw?: number; away?: number }>();
  for (const ev of events) {
    if (!Array.isArray(ev?.odds)) continue;
    for (const o of ev.odds) {
      if (o.status != null && o.status !== "active") continue; // suspenso/fechado fora
      if (o.marketId == null) continue;
      const odd = typeof o.price === "number" ? o.price : parseFloat(String(o.price ?? ""));
      if (!Number.isFinite(odd)) continue;
      const player = playerName(o);
      if (!player) {
        // PARTIDA: 1X2 (name exatamente 1/X/2) ou total Mais/Menos com specifiers.total.
        const nm = String(o.name ?? "").trim();
        if (nm === "1" || nm === "X" || nm === "2") {
          const g = wdw.get(o.marketId) ?? {};
          if (nm === "1") g.home = odd; else if (nm === "X") g.draw = odd; else g.away = odd;
          wdw.set(o.marketId, g);
          continue;
        }
        const side = /^mais de /i.test(nm) ? "over" : /^menos de /i.test(nm) ? "under" : null;
        const total = o.specifiers?.total;
        const linha = total != null ? parseFloat(String(total)) : NaN;
        if (side == null || !Number.isFinite(linha)) continue;  // combos/faixas/etc → fora
        const k = `${o.marketId}|${linha}`;
        const g = totals.get(k) ?? { marketId: o.marketId, linha };
        g[side] = odd;
        totals.set(k, g);
        continue;
      }
      const total = o.specifiers?.total;
      const linha = total != null ? parseFloat(String(total)) : NaN;
      if (!Number.isFinite(linha)) continue;                   // sem linha numérica → fail-closed
      out.push({
        book, market_label: String(o.marketId), entidade: player,
        linha_raw: linha, odd_over: odd, odd_under: null, subtype: "over",
      });
    }
  }
  for (const t of totals.values()) {
    if (t.over == null) continue;
    out.push({
      book, market_label: String(t.marketId), entidade: "partida",
      linha_raw: t.linha, odd_over: t.over, odd_under: t.under ?? null, subtype: "over_under",
    });
  }
  for (const [marketId, g] of wdw) {
    if (g.home == null || g.draw == null || g.away == null) continue;
    out.push({
      book, market_label: String(marketId), entidade: "partida",
      linha_raw: 0, odd_over: g.home, odd_under: g.away, odd_draw: g.draw, subtype: "1x2",
    });
  }
  return out;
}

/** Lista de jogos da Superbet (events/by-date) → {id, home, away} p/ crosswalk. Cada item
 * de data[] traz eventId (inteiro) + matchName "A·B" em PT (separador U+00B7). canonicalTeam
 * resolve PT/EN/FR no matchEventByName. */
export function parseSuperbetEventList(data: unknown): HouseEvent[] {
  const items = (data as SuperbetResponse)?.data;
  if (!Array.isArray(items)) return [];
  const out: HouseEvent[] = [];
  for (const it of items) {
    const id = it?.eventId;
    const nm = it?.matchName;
    if (id == null || typeof nm !== "string") continue;
    const parts = nm.split("·");
    if (parts.length !== 2) continue;
    const home = parts[0]!.trim(), away = parts[1]!.trim();
    if (!home || !away) continue;
    out.push({ id: String(id), home, away });
  }
  return out;
}
