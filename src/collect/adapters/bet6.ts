// Adapter BETNACIONAL — plataforma NSX/Bet6, motor Sportradar via provider "ramp".
// Endpoint REST GET ÚNICO e público (deslogado): traz TODAS as odds do jogo. Confirmado
// na captura de 2026-06-14 (Holanda×Japão, evento ramp 914873610). Difere da KTO em dois
// pontos que o parser resolve: (1) é ESCADA "N ou mais" (one-sided over; "N ou mais" =
// ≥N = over(N−0.5)); (2) a LINHA está embutida no nome do mercado, não num campo. O parser
// extrai (família, N) do market_code (EN, estável) ou do market_name (PT, fraseado varia)
// e emite a família canônica + "N+" — o de-para EXATO (BETNACIONAL_TABLE) faz o resto.
// Ver docs/features/coleta-odds-automatica/casas/betnacional.md.

import type { RawCollectedLine } from "../normalizer.js";
import type { OddsCollector, CollectContext, CollectResult } from "../types.js";
import type { HouseEvent } from "../matchEvent.js";

const BET6_HOST = "https://prod-global-bff-events.bet6.com.br";

/** URL do GET de odds de UM evento (todos os mercados, incl. props de jogador).
 * `eventId` é o id interno do provider "ramp" (ex.: 914873610), NÃO o event_id da BSD →
 * precisa de crosswalk (bet6EventsBySeasonUrl + matchEventByName). */
export function bet6EventOddsUrl(eventId: string | number): string {
  return `${BET6_HOST}/api/event-odds/${eventId}/grouped?languageId=1&marketIds=&outcomeIds=&statusId=0&provider=ramp`;
}

// Torneio da Copa 2026 no Bet6 (confirmado 2026-06-14 pela página /apostas-copa-do-mundo-2026).
export const BET6_WC_TOURNAMENT = 950049532;

/** URL da LISTA de jogos de um torneio (base do crosswalk BSD→ramp). Retorna
 * `{odds, outrights, scores}`; os jogos estão em `odds[]` (uma linha por mercado/outcome,
 * com event_id+home+away em PT). Confirmado: tournament_id 950049532 = Copa → 64 jogos. */
export function bet6EventsBySeasonUrl(tournamentId: string | number = BET6_WC_TOURNAMENT, sportId = 1): string {
  return `${BET6_HOST}/api/odds/1/events-by-seasons?sport_id=${sportId}&category_id=0&tournament_id=${tournamentId}&markets=1&filter_time_event=&provider=ramp`;
}

interface Bet6Odd {
  event_id?: number; outcome_name?: string; player_name?: string | null;
  market_name?: string; market_code?: string; odd?: string | number; is_bet_builder?: number;
}

/** (market_code|market_name) → família canônica do de-para + "N+". AUTORITATIVO: o
 * market_code (EN, estável) com regex ANCORADO (`^...$`) — isso exclui de graça as
 * variantes que NÃO queremos (1º/2º tempo "In 1st/2nd Half", "In Each Half", "Foul
 * Involvements" = envolvimentos, mercados de Team/Match/Each Team) porque o texto extra
 * quebra a âncora. Confirmado nos 81 market_codes do evento 914873610 (2026-06-14). O
 * caminho PT (name) é só FALLBACK (code vazio), igualmente restrito (barra tempo/time/
 * envolvimento). Família desconhecida → null → o chamador emite o cru → de-para rejeita. */
function classify(code: string, name: string): { family: string; linha_raw: string } | null {
  const c = code.replace(/\|/g, "").trim().toLowerCase(); // pipes são inconsistentes na casa
  if (c) {
    let m: RegExpMatchArray | null;
    if ((m = c.match(/^player to have (\d+) or more shots on target$/))) return { family: "shots on target", linha_raw: `${+m[1]!}+` };
    if ((m = c.match(/^player to have (\d+) or more shots$/)))            return { family: "shots", linha_raw: `${+m[1]!}+` };
    if ((m = c.match(/^player to commit (\d+) or more fouls$/)))          return { family: "fouls committed", linha_raw: `${+m[1]!}+` };
    if ((m = c.match(/^player to win (\d+) or more fouls$/)))             return { family: "fouls won", linha_raw: `${+m[1]!}+` }; // sofridas → reject na tabela
    return null; // tempo/cada-tempo/envolvimentos/time/partida → fail-closed
  }
  // Fallback PT (code ausente): estrito — barra tempo, time/equipe, envolvimentos, partida.
  const nm = name.trim().toLowerCase();
  if (/tempo|cada time|envolvimento|na partida|do time|equipe|time (com|tem)/.test(nm)) return null;
  const mn = nm.match(/(\d+)\s*ou mais/);
  if (!mn) return null;
  const linha_raw = `${+mn[1]!}+`;
  if (/chutes? no (gol|alvo)/.test(nm) && /jogador/.test(nm)) return { family: "shots on target", linha_raw };
  if (/recebe.*falta/.test(nm)) return { family: "fouls won", linha_raw };
  if (/comete.*falta/.test(nm)) return { family: "fouls committed", linha_raw };
  if (/chutes?/.test(nm) && /jogador/.test(nm)) return { family: "shots", linha_raw };
  return null;
}

/** Mercados de PARTIDA suportados (recon 2026-07-06, USA×Belgium 916044119): o payload é
 * FLAT (1 row por outcome) → o parser PAREIA Mais/Menos por linha e monta o 1X2 pelos
 * NOMES dos times (events[0].home/away vem no próprio payload de odds — não depende de
 * ordem). Códigos 90min apenas: prorrogação (TOTAL_EXTRA_TIME...) e promos (2 UP) têm
 * códigos próprios que não batem aqui → fora de graça. Famílias canônicas emitidas:
 * "match total goals" / "match total corners" / "match 1x2" (o de-para decide o resto). */
function matchTotalSide(code: string, outcome: string): { family: string; linha: number; side: "over" | "under" } | null {
  const nm = outcome.trim().toLowerCase();
  if (code === "Total") {
    const m = nm.match(/^(mais|menos) de (\d+(?:[.,]\d+)?) gols$/);
    if (!m) return null;
    return { family: "match total goals", linha: parseFloat(m[2]!.replace(",", ".")), side: m[1] === "mais" ? "over" : "under" };
  }
  const mc = code.match(/^Total Corners (\d+(?:\.\d+)?)$/);
  if (mc) {
    const m = nm.match(/^(mais|menos) de /);
    if (!m) return null;
    return { family: "match total corners", linha: parseFloat(mc[1]!), side: m[1] === "mais" ? "over" : "under" };
  }
  return null;
}

/** odds[] do GET da Betnacional → linhas cruas. Jogador = outcome_name (player_name é
 * null). Pula bet builder (SGM). Mercados de PARTIDA (Total/Total Corners/Win-Draw-Win)
 * são pareados aqui. NÃO normaliza (de-para fica no OddsNormalizer). */
export function parseBet6(data: unknown, book: string): RawCollectedLine[] {
  const root = data as { odds?: Bet6Odd[]; events?: { home?: string; away?: string }[] };
  const odds = root?.odds;
  if (!Array.isArray(odds)) return [];
  const home = root.events?.[0]?.home ?? null;
  const away = root.events?.[0]?.away ?? null;
  const out: RawCollectedLine[] = [];
  const totals = new Map<string, { family: string; linha: number; over?: number; under?: number }>();
  const wdw: { home?: number; draw?: number; away?: number } = {};
  for (const o of odds) {
    if (o.is_bet_builder === 1) continue; // bet builder / SGM fora
    const player = o.outcome_name ?? o.player_name ?? "";
    if (!player) continue;
    const odd = typeof o.odd === "number" ? o.odd : parseFloat(String(o.odd ?? "").replace(",", "."));
    if (!Number.isFinite(odd)) continue;
    const code = String(o.market_code ?? "").replace(/\|/g, "").trim();
    // PARTIDA: totais (gols/escanteios) — acumula os dois lados por linha.
    const tot = matchTotalSide(code, String(o.outcome_name ?? ""));
    if (tot) {
      const k = `${tot.family}|${tot.linha}`;
      const g = totals.get(k) ?? { family: tot.family, linha: tot.linha };
      g[tot.side === "over" ? "over" : "under"] = odd;
      totals.set(k, g);
      continue;
    }
    // PARTIDA: 1X2 — lado pelo NOME exato do time (payload traz home/away).
    if (code === "Win-Draw-Win") {
      const nome = String(o.outcome_name ?? "").trim();
      if (nome === "Empate") wdw.draw = odd;
      else if (home != null && nome === home) wdw.home = odd;
      else if (away != null && nome === away) wdw.away = odd;
      continue;
    }
    const cls = classify(code, String(o.market_name ?? ""));
    out.push({
      book,
      market_label: cls?.family ?? String(o.market_name ?? "desconhecido"),
      entidade: player,
      linha_raw: cls?.linha_raw ?? String(o.market_name ?? ""),
      odd_over: odd, odd_under: null, subtype: "over",
    });
  }
  for (const t of totals.values()) {
    if (t.over == null) continue; // sem over não há aposta no nosso modelo
    out.push({
      book, market_label: t.family, entidade: "partida",
      linha_raw: t.linha, odd_over: t.over, odd_under: t.under ?? null, subtype: "over_under",
    });
  }
  if (wdw.home != null && wdw.draw != null && wdw.away != null) {
    out.push({
      book, market_label: "match 1x2", entidade: "partida",
      linha_raw: 0, odd_over: wdw.home, odd_under: wdw.away, odd_draw: wdw.draw, subtype: "1x2",
    });
  }
  return out;
}

/** Lista de jogos da Betnacional (events-by-seasons) → {id, home, away} p/ crosswalk.
 * Os jogos vêm em `odds[]` (uma linha por mercado/outcome) → DEDUP por event_id. Nomes
 * em PT (canonicalTeam resolve no matchEventByName). Confirmado no torneio da Copa. */
export function parseBet6EventList(data: unknown): HouseEvent[] {
  const odds = (data as { odds?: any[] })?.odds;
  if (!Array.isArray(odds)) return [];
  const byId = new Map<string, HouseEvent>();
  for (const o of odds) {
    const id = o?.event_id;
    if (id == null || byId.has(String(id))) continue;
    if (!o.home || !o.away) continue;
    byId.set(String(id), { id: String(id), home: String(o.home), away: String(o.away) });
  }
  return [...byId.values()];
}

/** Adapter de fetch da Betnacional. `get` injetado (testável offline). "Pula e avisa":
 * erro de rede/bloqueio → CollectResult.erro, nunca lança. */
export class Bet6Collector implements OddsCollector {
  readonly book = "betnacional";
  constructor(
    private get: (url: string) => Promise<any>,
    private endpoint: (ctx: CollectContext) => string,
  ) {}
  async collect(ctx: CollectContext): Promise<CollectResult> {
    try {
      const data = await this.get(this.endpoint(ctx));
      return { book: this.book, raws: parseBet6(data, this.book) };
    } catch (e: any) {
      return { book: this.book, raws: [], erro: String(e?.message ?? e) };
    }
  }
}
