// REGISTRY agnóstico de casas — a fonte ÚNICA do "quais casas existem e como buscar cada
// uma". CLI (src/cli/collectOdds.ts) e endpoint HTTP (coletaService) consomem isto.
// Adicionar uma casa nova = adicionar UMA entrada em HOUSES (+ o adapter + o de-para).
//
// O registry é PURO (só URL builders + parsers + a flag needsBrowser). Quem BUSCA na
// internet (fetch puro ou navegador headless) é injetado por `fetchers` — assim collect/
// não importa fetch nem Playwright (Ports & Adapters).

import { parseKambi, ktoBetofferUrl, ktoListViewUrl, parseKambiListView } from "./adapters/kto.js";
import { parseBet6, bet6EventOddsUrl, bet6EventsBySeasonUrl, parseBet6EventList } from "./adapters/bet6.js";
import { parseSuperbet, superbetEventOddsUrl, superbetEventsByDateUrl, parseSuperbetEventList } from "./adapters/superbet.js";
import { parseStake, stakeEventOddsUrl, stakeTournamentUrl, parseStakeEventList } from "./adapters/stake.js";
import { parseBetano, betanoEventOddsUrl, betanoUpcomingUrl, parseBetanoEventList } from "./adapters/betano.js";
import { matchEventByName, type HouseEvent } from "./matchEvent.js";
import type { RawCollectedLine } from "./normalizer.js";
import type { OddsCollector, CollectContext } from "./types.js";

export interface HouseDef {
  book: string;
  /** true = endpoint atrás de Cloudflare → precisa do navegador headless (fetchers.browser). */
  needsBrowser: boolean;
  /** URL das odds de UM jogo (id da casa). */
  oddsUrl: (houseEventId: string) => string;
  /** JSON cru da casa → linhas cruas (o de-para fica no normalizer/HouseMarketTable). */
  parseOdds: (data: unknown, book: string) => RawCollectedLine[];
  /** URL da LISTA de jogos do torneio (crosswalk BSD→casa). */
  listUrl: () => string;
  /** JSON da lista → eventos {id, home, away} p/ o matchEventByName. */
  parseList: (data: unknown) => HouseEvent[];
}

// As casas implementadas. KTO = fetch puro (CDN Kambi). Betnacional = headless (Cloudflare).
// Defaults dos listUrl apontam pra Copa 2026 (ver os adapters).
export const HOUSES: HouseDef[] = [
  {
    book: "kto", needsBrowser: false,
    oddsUrl: ktoBetofferUrl, parseOdds: parseKambi,
    listUrl: () => ktoListViewUrl(), parseList: parseKambiListView,
  },
  {
    book: "betnacional", needsBrowser: true,
    oddsUrl: bet6EventOddsUrl, parseOdds: parseBet6,
    listUrl: () => bet6EventsBySeasonUrl(), parseList: parseBet6EventList,
  },
  {
    // Superbet (Betler/Fastly): fetch puro, sem anti-bot/geoblock (captura 2026-06-15).
    book: "superbet", needsBrowser: false,
    oddsUrl: superbetEventOddsUrl, parseOdds: parseSuperbet,
    listUrl: () => superbetEventsByDateUrl(), parseList: parseSuperbetEventList,
  },
  {
    // Stake (motor PRÓPRIO, sbweb.stake.bet.br): 1ª casa com motor de preço independente →
    // diversidade real no line shopping. needsBrowser:true — o `fetch` puro do Node toma 403 no
    // edge da Stake (checa fingerprint de browser/TLS, não cookie), então o "200 deslogado" que o
    // navegador vê NÃO transfere pro Node; o headless (já aberto p/ Betnacional) passa. Captura BR
    // 2026-06-15 (Belgium×Egypt 1025862146 / Spain×Cape Verde 1025862165).
    book: "stake", needsBrowser: true,
    oddsUrl: stakeEventOddsUrl, parseOdds: parseStake,
    listUrl: () => stakeTournamentUrl(), parseList: parseStakeEventList,
  },
  {
    // Betano (plataforma PRÓPRIA, www.betano.bet.br): motor de preço próprio (Kaizen) → diversidade
    // real no line shopping. needsBrowser:false — a captura BR 2026-06-15 (França×Senegal 77353568)
    // provou feed de 1ª parte por fetch puro, 200 deslogado, sem Turnstile interativo nem geoblock.
    // ⚠ Se o `fetch` do Node tomar 403 no edge (Cloudflare por fingerprint, como na Stake), flipar
    // needsBrowser:true — o "200 no navegador" nem sempre transfere pro Node.
    book: "betano", needsBrowser: false,
    oddsUrl: betanoEventOddsUrl, parseOdds: parseBetano,
    listUrl: () => betanoUpcomingUrl(), parseList: parseBetanoEventList,
  },
];

export function houseByBook(book: string): HouseDef | undefined {
  return HOUSES.find((h) => h.book === book);
}

/** get por mecanismo: `plain` (fetch puro) e `browser` (headless; ausente = sem casas Cloudflare). */
export interface Fetchers { plain: (url: string) => Promise<any>; browser?: (url: string) => Promise<any>; }

export interface BuildCollectorsOpts {
  houses?: HouseDef[];
  /** book → id da casa explícito (pula o crosswalk daquela casa). */
  overrides?: Record<string, string>;
  log?: (msg: string) => void;
}

/** Resolve o id de cada casa (crosswalk por nome) e monta os collectors. "Pula e avisa":
 * casa sem fetcher (headless ausente), sem id resolvido OU com lista que falha é PULADA
 * (logada), nunca derruba as outras. O collect de cada casa também é à prova de erro. */
export async function buildCollectors(
  ctx: CollectContext,
  fetchers: Fetchers,
  opts: BuildCollectorsOpts = {},
): Promise<OddsCollector[]> {
  const houses = opts.houses ?? HOUSES;
  const overrides = opts.overrides ?? {};
  const log = opts.log ?? (() => {});
  const collectors: OddsCollector[] = [];

  for (const h of houses) {
    const get = h.needsBrowser ? fetchers.browser : fetchers.plain;
    if (!get) { log(`${h.book}: precisa de navegador headless e ele não está disponível — pulando`); continue; }

    let id: string | undefined = overrides[h.book];
    if (!id) {
      const listUrl = h.listUrl();
      try {
        log(`${h.book}: buscando lista ${listUrl}`);
        const list = h.parseList(await get(listUrl));
        log(`${h.book}: lista deu ${list.length} jogos`);
        const m = matchEventByName(list, ctx.home, ctx.away);
        if (m) { id = m.id; log(`${h.book}: "${ctx.home} x ${ctx.away}" → ${id} (conf ${m.confianca})`); }
        else {
          const amostra = list.slice(0, 5).map((e) => `${e.home} x ${e.away}`).join(" | ");
          log(`${h.book}: jogo não achado na lista (${list.length} jogos) — pulando. amostra: [${amostra}]`);
        }
      } catch (e: any) {
        log(`${h.book}: lista falhou (${String(e?.message ?? e)}) — pulando`);
      }
    }
    if (!id) continue;

    const houseId = id;
    collectors.push({
      book: h.book,
      async collect(c: CollectContext) {
        void c;
        try { return { book: h.book, raws: h.parseOdds(await get(h.oddsUrl(houseId)), h.book) }; }
        catch (e: any) { return { book: h.book, raws: [], erro: String(e?.message ?? e) }; }
      },
    });
  }
  return collectors;
}
