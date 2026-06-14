// Adapter KTO — plataforma KAMBI (offering API: GET JSON puro, sem login). O PARSER
// (parseKambi) é puro e segue o shape documentado da Kambi (odds/line em milésimos). O
// FETCH (KtoCollector) recebe `get` injetado + o endpoint, que vem da FASE 0 (ver
// docs/features/coleta-odds-automatica/casas/kto.md). Gate do repo: sem ficha, o
// endpoint do collector é placeholder — o parser, não.

import type { RawCollectedLine } from "../normalizer.js";
import type { OddsCollector, CollectContext, CollectResult } from "../types.js";
import type { HouseEvent } from "../matchEvent.js";

/** Kambi manda odds e line em MILÉSIMOS inteiros (1780 = 1.78; 500 = 0.5). Decodifica
 * tolerando já-decimal (Fase 0 pode revelar variação). */
function decode(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Number.isInteger(n) && Math.abs(n) >= 100 ? n / 1000 : n;
}

interface KambiOutcome { type?: string; label?: string; line?: number; odds?: number; participant?: string; }
interface KambiBetOffer { criterion?: { englishLabel?: string; label?: string }; outcomes?: KambiOutcome[]; }

/** Limpa o englishLabel da Kambi pro de-para EXATO. A KTO BR sufixa todo prop com a regra
 * de liquidação — "(Settled using Opta data)" OU "(Decided using Opta data)" (VARIA por
 * mercado) — e usa apóstrofo ("Player's"). Nenhum dos dois carrega semântica de mercado;
 * tirá-los dá uma chave estável e robusta à variação Settled/Decided e apóstrofo reto/curvo.
 * Confirmado na captura de 2026-06-14 (evento Kambi 1025862126). NÃO é "match por
 * substring" (proibido no de-para) — é canonicalização determinística do rótulo. */
function cleanKambiLabel(label: string): string {
  return label
    .replace(/\s*\([^)]*opta[^)]*\)\s*$/i, "") // sufixo de liquidação Opta no fim
    .replace(/[‘’'`]/g, "")           // apóstrofo (reto/curvo/crase)
    .trim();
}

function isOver(o: KambiOutcome): boolean {
  return o.type === "OT_OVER" || /over|mais/i.test(o.label ?? "");
}
function isUnder(o: KambiOutcome): boolean {
  return o.type === "OT_UNDER" || /under|menos/i.test(o.label ?? "");
}

/** Kambi betOffer JSON → linhas cruas. Agrupa over/under por (participant, line) dentro
 * de cada betOffer. Mercado sem participant = partida. NÃO normaliza (o de-para fica no
 * OddsNormalizer + HouseMarketTable da KTO). */
export function parseKambi(data: unknown, book: string): RawCollectedLine[] {
  // Tolera as duas formas: resposta-padrão {betOffers:[...]} OU já o array de betOffers.
  const offers = Array.isArray(data)
    ? (data as KambiBetOffer[])
    : (data as { betOffers?: KambiBetOffer[] })?.betOffers;
  if (!Array.isArray(offers)) return [];
  const out: RawCollectedLine[] = [];
  for (const bo of offers) {
    const raw = bo.criterion?.englishLabel ?? bo.criterion?.label;
    if (!raw || !Array.isArray(bo.outcomes)) continue;
    const label = cleanKambiLabel(raw);
    // Agrupa por (participant, line) → casa over com under.
    const groups = new Map<string, { over?: KambiOutcome; under?: KambiOutcome; participant?: string; line?: number }>();
    for (const o of bo.outcomes) {
      const key = `${o.participant ?? ""}|${o.line ?? ""}`;
      const g = groups.get(key) ?? { participant: o.participant, line: o.line };
      if (isOver(o)) g.over = o;
      else if (isUnder(o)) g.under = o;
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      if (!g.over) continue; // sem over não há aposta no nosso modelo
      const odd_over = decode(g.over.odds);
      const linha = decode(g.over.line);
      if (odd_over == null || linha == null) continue;
      out.push({
        book, market_label: label, entidade: g.participant ?? "partida",
        linha_raw: linha, odd_over, odd_under: g.under ? decode(g.under.odds) : null,
        subtype: "over_under",
      });
    }
  }
  return out;
}

// Endpoint REAL confirmado na captura (2026-06-14): offering API da Kambi, GET JSON
// público (sem auth/cookie). operatorCode=ktobr, região=us. `range_size=800` puxa TODOS
// os ~776 betOffers do evento de uma vez (a chamada do site usa range_size=1 e pagina).
const KTO_HOST = "https://us.offering-api.kambicdn.com/offering/v2018/ktobr";
const KTO_QS = "lang=pt_BR&market=BR&client_id=200&channel_id=1&includeParticipants=true&range_start=0&range_size=800";

/** URL do betoffer de UM evento Kambi (todos os mercados, incl. props de jogador).
 * `kambiEventId` é o id da KAMBI (ex.: 1025862126), NÃO o event_id da BSD → precisa de
 * crosswalk (ver listView + casamento por nome/data; próximo passo do wiring). */
export function ktoBetofferUrl(kambiEventId: string | number): string {
  return `${KTO_HOST}/betoffer/event/${kambiEventId}.json?${KTO_QS}`;
}

/** URL do listView de um GRUPO (lista eventos c/ id Kambi + nomes + start) — base do
 * crosswalk BSD→Kambi. `termPath` = caminho de termos do grupo (do `path` do betoffer);
 * a Copa = `football/world_cup_2026` (confirmado 2026-06-14). `lang` default inglês p/ os
 * nomes casarem com os da BSD (canonicalTeam ainda resolve PT/FR). */
export function ktoListViewUrl(termPath = "football/world_cup_2026", lang = "en_GB"): string {
  return `${KTO_HOST}/listView/${termPath}.json?lang=${lang}&market=BR&client_id=200&channel_id=1&useCombined=true`;
}

/** listView Kambi → eventos genéricos {id, home, away} p/ o crosswalk. Defensivo: o item
 * pode vir como {event:{...}} ou direto; nomes em homeName/awayName ou no name "A - B".
 * Shape do listView NÃO foi capturado (só o betoffer) → best-effort; o caminho provado é
 * passar o id Kambi à mão (--kambi). */
export function parseKambiListView(data: unknown): HouseEvent[] {
  const items = (data as { events?: any[] })?.events;
  if (!Array.isArray(items)) return [];
  const out: HouseEvent[] = [];
  for (const it of items) {
    const ev = it?.event ?? it;
    if (ev?.id == null) continue;
    let home: string | undefined = ev.homeName;
    let away: string | undefined = ev.awayName;
    const nm = ev.englishName ?? ev.name;
    if ((!home || !away) && typeof nm === "string") {
      const parts = nm.split(/\s+-\s+|\s+vs\.?\s+/i);
      home = home ?? parts[0]?.trim();
      away = away ?? parts[1]?.trim();
    }
    if (!home || !away) continue;
    out.push({ id: String(ev.id), home, away });
  }
  return out;
}

/** Adapter de fetch da KTO (Kambi). `get` injetado (testável offline). `endpoint` é uma
 * função (ctx)→URL; em produção usa ktoBetofferUrl com o id Kambi resolvido pelo
 * crosswalk. "Pula e avisa": erro de rede/bloqueio → CollectResult.erro, nunca lança. */
export class KtoCollector implements OddsCollector {
  readonly book = "kto";
  constructor(
    private get: (url: string) => Promise<any>,
    private endpoint: (ctx: CollectContext) => string,
  ) {}
  async collect(ctx: CollectContext): Promise<CollectResult> {
    try {
      const data = await this.get(this.endpoint(ctx));
      return { book: this.book, raws: parseKambi(data, this.book) };
    } catch (e: any) {
      return { book: this.book, raws: [], erro: String(e?.message ?? e) };
    }
  }
}
