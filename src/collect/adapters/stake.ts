// Adapter STAKE — plataforma PRÓPRIA (sbweb.stake.bet.br), NÃO é Kambi (a pesquisa de mesa
// errou; a captura no navegador provou motor proprietário). Primeira casa com motor de preço
// independente das já cobertas (KTO=Kambi, Superbet/Betnacional=Sportradar) → diversidade real
// no line shopping. Endpoint REST GET. ⚠ ACESSO VIA HEADLESS (needsBrowser:true em houses.ts):
// o navegador vê 200 deslogado (credentials:'omit'), mas o `fetch` puro do Node toma 403 — o
// edge da Stake barra por fingerprint de browser/TLS, não por cookie; o headless (Playwright,
// já aberto p/ Betnacional) passa. Confirmado na captura de 2026-06-15 (BR): Espanha×Cabo Verde
// 1025862165 e Bélgica×Egito 1025862146.
//
// Três fatos do feed que o parser resolve: (1) /odds = {odds:[...], prePacks:[]} — array PLANO
// de seleções, cada uma com seu marketId; (2) é ESCADA "Mais de X.5" (over-only: oddTypeName
// "Mais"; "Menos" existe no payload global mas não nos props de jogador → filtrado); (3) a CHAVE
// de de-para é o marketId NUMÉRICO (id de TIPO de mercado, GLOBAL — o mesmo em qualquer jogo,
// confirmado em 2 eventos). O /markets traz o marketId com sufixo de linha (_15/_55/_125); o
// /odds traz a BASE → casa pela base. Linha em addValue (string), jogador em name, odd em
// oddValue; frozen:true = sem preço (pula). Liquidação Opta (igual KTO): desarmes "completados"
// = won_tackle, faltas "concedidas" = cometidas. Ver docs/coleta-odds/casas/stake.md.

import type { RawCollectedLine } from "../normalizer.js";
import type { HouseEvent } from "../matchEvent.js";

const STAKE_HOST = "https://sbweb.stake.bet.br";
// Copa do Mundo 2026 (tournamentId capturado). Há também GET /api/v1/br/pt-br/sport/FOOTBALL/
// tournaments p/ listar torneios+ids se mudar de arena.
const WORLD_CUP_2026 = "2010133908";

/** URL do GET de odds de UM jogo (todos os mercados, incl. props). `eventId` é o id interno do
 * Stake (string, ex.: "1025862165") = o mesmo da URL do site e da lista → crosswalk pela lista.
 * Público, deslogado. */
export function stakeEventOddsUrl(eventId: string | number): string {
  return `${STAKE_HOST}/api/v1/br/pt-br/events/${eventId}/odds`;
}

/** URL da LISTA de jogos de um torneio (base do crosswalk BSD→Stake). Default = Copa 2026. */
export function stakeTournamentUrl(tournamentId: string = WORLD_CUP_2026): string {
  return `${STAKE_HOST}/api/v1/br/pt-br/tournament/${tournamentId}/live-upcoming`;
}

interface StakeOutcome {
  name?: string; addValue?: string; oddValue?: number; marketId?: string;
  oddTypeName?: string; frozen?: boolean;
}
interface StakeOddsResponse { odds?: StakeOutcome[] }
interface StakeEvent { id?: string | number; teams?: { home?: string; away?: string } }
interface StakeListResponse { events?: StakeEvent[] }

/** data.odds (array PLANO de seleções) → linhas cruas. market_label = marketId BASE (string), a
 * chave estável do de-para (sem o sufixo _NN de linha do /markets). Pula: frozen (sem preço),
 * oddTypeName != "Mais" (over-only; "Menos" é o lado Under), sem name/marketId/linha/odd. NÃO
 * normaliza (de-para fica no OddsNormalizer + STAKE_TABLE). */
export function parseStake(data: unknown, book: string): RawCollectedLine[] {
  const odds = (data as StakeOddsResponse)?.odds;
  if (!Array.isArray(odds)) return [];
  const out: RawCollectedLine[] = [];
  for (const o of odds) {
    if (o?.frozen === true) continue;                          // sem preço (suspenso) → fora
    if (o?.oddTypeName !== "Mais") continue;                   // só Over (escada) → "Menos" fora
    const player = typeof o.name === "string" ? o.name.trim() : "";
    if (!player) continue;
    if (o.marketId == null) continue;
    const marketBase = String(o.marketId).split("_")[0]!;      // /markets traz _NN; /odds traz base
    const linha = o.addValue != null ? parseFloat(String(o.addValue)) : NaN;
    if (!Number.isFinite(linha)) continue;                     // sem linha numérica → fail-closed
    const odd = typeof o.oddValue === "number" ? o.oddValue : parseFloat(String(o.oddValue ?? ""));
    if (!Number.isFinite(odd)) continue;
    out.push({
      book, market_label: marketBase, entidade: player,
      linha_raw: linha, odd_over: odd, odd_under: null, subtype: "over",
    });
  }
  return out;
}

/** Lista de jogos do Stake (/tournament/{id}/live-upcoming → {events:[...]}) → {id, home, away}
 * p/ crosswalk. id = events[].id (string), times em events[].teams.home/away em PT
 * ("Espanha","Cabo Verde") → canonicalTeam resolve PT/EN/FR no matchEventByName. */
export function parseStakeEventList(data: unknown): HouseEvent[] {
  const events = (data as StakeListResponse)?.events;
  if (!Array.isArray(events)) return [];
  const out: HouseEvent[] = [];
  for (const e of events) {
    const id = e?.id;
    const home = e?.teams?.home;
    const away = e?.teams?.away;
    if (id == null || typeof home !== "string" || typeof away !== "string") continue;
    const h = home.trim(), a = away.trim();
    if (!h || !a) continue;
    out.push({ id: String(id), home: h, away: a });
  }
  return out;
}
