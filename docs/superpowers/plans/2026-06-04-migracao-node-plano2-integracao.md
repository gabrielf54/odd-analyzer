# Plano 2 — Integração backend (providers, store, pipeline, service, API) Implementation Plan

> **For agentic workers:** executar com superpowers:executing-plans. Steps em checkbox. Fonte-de-verdade da tradução = os arquivos Python citados em cada tarefa; cada módulo TS espelha o comportamento e ganha teste Vitest com fakes injetados (sem rede/banco real).

**Goal:** Portar a camada de adapters + orquestração: clientes HTTP (BSD, The Odds API, OpenRouter), crosswalk, store (InMemory + Supabase), pipeline, runner, service e a API Express+Zod — fechando o backend Node consumível pelo front.

**Architecture:** Ports & Adapters. Domínio (Plano 1) intacto. Adapters recebem suas dependências de I/O por injeção (igual ao Python: `_get`/`_post`/`_chat`/`client`), então todo teste roda offline com fakes. A API é fina: Zod valida, chama `service/`, middleware traduz erro.

**Tech Stack:** Node LTS, TS strict, Express, Zod, @supabase/supabase-js, dotenv, Vitest. `fetch` global do Node (sem axios).

**Convenção:** funções camelCase; chaves de dados snake_case PT idênticas ao legado.

---

## File Structure (este plano, sob `ts/`)

```
src/
  config.ts                 ← getRequired + dotenv
  lib/cache.ts              ← cachedGet (TTL in-memory; simplifica o file-cache do Python)
  oddsMath.ts               ← americanToDecimal
  bsd/client.ts             ← BSDClient (get injetável)
  crosswalk/match.ts        ← normalize, matchPlayer (difflib→similaridade própria)
  crosswalk/bsdIds.ts       ← construirMapaTime, resolver
  providers/types.ts        ← StatsProvider, OddsProvider (interfaces)
  odds/theOddsApi.ts        ← normTeam, findEvent, parseTotals, parseH2h, ODDSAPI_MATCH_MARKET
  providers/odds.ts         ← NullOdds, ManualOdds, TheOddsApiMatchOdds, BSDMatchOdds
  providers/stats.ts        ← BSDStatsProvider, CrosswalkStatsProvider, OnlyPlayer
  ai/schema.ts              ← validateIaOutput
  ai/openrouter.ts          ← chat (post injetável)
  ai/analista.ts            ← analisar, fakeAnalista
  store/repo.ts             ← Repo, InMemoryRepo, SupabaseRepo, clv
  pipeline.ts               ← analisarJogo + _runContagem/_runPartida
  runner.ts                 ← runAnalise, normalizeEvent
  service.ts                ← listarLigas, listarJogos, escalacaoProvavel, mediaRecenteJogador, analisar, apostarPaper, resultadoRealJogador
  api/errors.ts             ← AppError
  api/app.ts                ← Express app (rotas + Zod + middleware de erro)
  api/server.ts             ← bootstrap (lê env, monta deps reais, listen)
test/
  (espelha cada módulo: crosswalkMatch.test.ts, theOddsApi.test.ts, providersStats.test.ts, repo.test.ts, pipeline.test.ts, service.test.ts, api.test.ts, ...)
```

---

## Task 1: deps + config + cache + oddsMath

**Files:** Modify `ts/package.json`; Create `ts/src/config.ts`, `ts/src/lib/cache.ts`, `ts/src/oddsMath.ts`, `ts/test/oddsMath.test.ts`.

- [ ] **Step 1:** adicionar deps em `package.json`: `express`, `zod`, `@supabase/supabase-js`, `dotenv`; devDeps `@types/express`, `supertest`, `@types/supertest`. Rodar `cd ts && npm install`.
- [ ] **Step 2 (test-first `oddsMath`):** `ts/test/oddsMath.test.ts` — `americanToDecimal('-120')≈1.8333`, `'+150'≈2.5`, `'1.83'===1.83`, `'100'===2.0`. Rodar → falha.
- [ ] **Step 3:** implementar (espelha `src/odd_analyzer/odds_math.py`):
```typescript
// ts/src/oddsMath.ts
export function americanToDecimal(value: string | number): number {
  const s = String(value).trim();
  if (s.includes(".") && !s.startsWith("+") && !s.startsWith("-")) return parseFloat(s);
  const a = parseFloat(s);
  if (a > 0) return Math.round((1 + a / 100) * 1e4) / 1e4;
  return Math.round((1 + 100 / Math.abs(a)) * 1e4) / 1e4;
}
```
- [ ] **Step 4:** `config.ts`:
```typescript
// ts/src/config.ts
import "dotenv/config";
export function getRequired(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}
```
- [ ] **Step 5:** `lib/cache.ts` (TTL in-memory; simplifica o file-cache do Python — comportamento: memoiza por chave com TTL e só cacheia se `shouldCache(d)`):
```typescript
// ts/src/lib/cache.ts
interface Entry { value: unknown; exp: number; }
const store = new Map<string, Entry>();
export async function cachedGet<T>(
  key: string, fetcher: () => Promise<T>,
  opts: { ttlSeconds?: number | null; shouldCache?: (d: T) => boolean } = {},
): Promise<T> {
  const { ttlSeconds = null, shouldCache = (d: T) => Boolean(d) } = opts;
  const hit = store.get(key);
  if (hit && (hit.exp === 0 || hit.exp > Date.now())) return hit.value as T;
  const value = await fetcher();
  if (shouldCache(value)) {
    const exp = ttlSeconds == null ? 0 : Date.now() + ttlSeconds * 1000;
    store.set(key, { value, exp });
  }
  return value;
}
export function clearCache(): void { store.clear(); }
```
- [ ] **Step 6:** rodar `npx vitest run test/oddsMath.test.ts` → PASS; `npx tsc --noEmit` → 0. Commit `feat(ts): config, cache, oddsMath`.

---

## Task 2: bsd/client.ts

**Files:** Create `ts/src/bsd/client.ts`, `ts/test/bsdClient.test.ts`. **Origem:** `src/odd_analyzer/bsd/client.py`.

- [ ] **Step 1 (test-first):** com `get` injetado (fake que devolve fixture), `client.events({league_id:9})` chama `/events/` e devolve o dict; `getEvent(id)` chama `/events/{id}/`. Verifica que monta URL base certa e repassa params. Rodar → falha.
- [ ] **Step 2:** implementar `BSDClient` — métodos: `events`, `getEvent`, `eventPlayerStats`, `playerStats`, `player`, `lineups`, `teamStats`, `eventStats`, `eventOdds`, `oddsByBook`, `nationalPool`, `squad`, `leagues`. Base `https://sports.bzzoiro.com/api/v2`. Construtor `(apiKey, { get } = {})`; `get` default usa `fetch` com header `Authorization: Token <key>`. Cada método chama `this._call(path, params, ttl)` → `cachedGet`. TTLs idênticos ao Python (odds 300, lineup 300, stats 3600, eternal null).
```typescript
// trecho-chave de ts/src/bsd/client.ts
const BASE = "https://sports.bzzoiro.com/api/v2";
type Getter = (url: string, params?: Record<string, unknown>) => Promise<any>;
export class BSDClient {
  private get: Getter;
  constructor(private apiKey: string, opts: { get?: Getter } = {}) {
    if (!apiKey) throw new Error("api_key não pode ser vazio");
    this.get = opts.get ?? this.makeFetchGet();
  }
  private makeFetchGet(): Getter {
    return async (url, params) => {
      const qs = params ? "?" + new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : "";
      const r = await fetch(url + qs, { headers: { Authorization: `Token ${this.apiKey}` } });
      if (!r.ok) throw new Error(`BSD ${r.status} ${url}`);
      return r.json();
    };
  }
  private call(path: string, params?: Record<string, unknown>, ttl: number | null = null) {
    const url = `${BASE}${path}`;
    const qs = new URLSearchParams(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]));
    qs.sort();
    return cachedGet(`${url}?${qs}`, () => this.get(url, params), { ttlSeconds: ttl });
  }
  events(filtros: Record<string, unknown> = {}) { return this.call("/events/", filtros, 300); }
  getEvent(id: unknown) { return this.call(`/events/${id}/`, undefined, null); }
  eventPlayerStats(id: unknown) { return this.call(`/events/${id}/player-stats/`, undefined, null); }
  playerStats(id: unknown, filtros: Record<string, unknown> = {}) { return this.call(`/players/${id}/stats/`, filtros, 3600); }
  player(id: unknown) { return this.call(`/players/${id}/`, undefined, null); }
  lineups(id: unknown) { return this.call(`/events/${id}/lineups/`, undefined, 300); }
  teamStats(id: unknown) { return this.call(`/events/${id}/team-stats/`, undefined, 3600); }
  eventStats(id: unknown) { return this.call(`/events/${id}/stats/`, undefined, 3600); }
  eventOdds(id: unknown) { return this.call(`/events/${id}/odds/`, undefined, 300); }
  leagues(filtros: Record<string, unknown> = {}) { return this.call("/leagues/", filtros, null); }
  nationalPool(teamId: unknown) { return this.call("/players/", { national_team_id: teamId }, 3600); }
  squad(teamId: unknown) { return this.call(`/teams/${teamId}/squad/`, undefined, 3600); }
}
```
- [ ] **Step 3:** rodar teste → PASS; tsc → 0. Commit `feat(ts): bsd/client (HTTP fino, get injetável)`.

---

## Task 3: crosswalk (match + bsdIds)

**Files:** Create `ts/src/crosswalk/match.ts`, `ts/src/crosswalk/bsdIds.ts`, `ts/test/crosswalk.test.ts`. **Origem:** `crosswalk/match.py`, `crosswalk/bsd_ids.py`.

- [ ] **Step 1 (test-first):** `normalize("Côte d'Ivoire")` remove acento/caixa; `matchPlayer("Kaiki", [{id:"7",name:"Kaiki Fernandes"}], 0.5)` casa; threshold alto → `null` (fail-closed). `resolver` troca id pelo stats-id casado; sem match → descarta. Rodar → falha.
- [ ] **Step 2:** implementar. `normalize` = NFKD + remove diacríticos + lower + colapsa espaços. Substituir `difflib.SequenceMatcher.ratio()` por uma similaridade equivalente — usar **Dice coefficient sobre bigramas** (determinístico, sem dep). `matchPlayer(nome, elenco, overrides?, threshold=0.9)`: normaliza, checa overrides, pega melhor score, retorna `{id,name,confianca}` ou `null` se `< threshold`.
  > **Nota de paridade:** difflib e Dice não dão score idêntico; o threshold pode precisar de ajuste fino. Como o crosswalk é fail-closed (descarta na dúvida), divergência = no máximo perder um jogador, nunca id errado. Documentar no CLAUDE.md.
- [ ] **Step 3:** `bsdIds.ts`: `construirMapaTime(client, teamId, n=5)` (async — usa `events`, `eventPlayerStats`, `player`) e `resolver(jogadores, mapa, threshold=0.85)`. Espelha a lógica Python (dedup por id, nome via `player()`).
- [ ] **Step 4:** rodar → PASS; tsc → 0. Commit `feat(ts): crosswalk (match Dice + bsdIds)`.

---

## Task 4: odds/theOddsApi + providers/odds + providers/types

**Files:** Create `ts/src/providers/types.ts`, `ts/src/odds/theOddsApi.ts`, `ts/src/providers/odds.ts`, `ts/test/theOddsApi.test.ts`, `ts/test/providersOdds.test.ts`. **Origem:** `odds/the_odds_api.py`, `providers/odds.py`.

- [ ] **Step 1:** `providers/types.ts` — interfaces:
```typescript
import type { MarketSpec } from "../model/markets.js";
export interface OddsLine { entidade: string; linha: number; odd_over: number; odd_under: number; book: string; odd_draw?: number | null; }
export interface OddsProvider { linhas(event: any, market: MarketSpec): OddsLine[] | Promise<OddsLine[]>; }
export interface EntityTaxa { mu: number; minutos_esperados: number; xi_confirmado: boolean; amostra_jogos: number; concedido_adversario: string; incerteza: string; }
export interface StatsProvider {
  elenco(event: any): any[] | Promise<any[]>;
  entity_taxa(id: unknown, market: MarketSpec, ctx: any): EntityTaxa | null | Promise<EntityTaxa | null>;
  team_rates(teamId: unknown, ctx: any): any | Promise<any>;
}
```
- [ ] **Step 2 (test-first theOddsApi):** `normTeam("Bosnia & Herzegovina")==="bosniaherzegovina"`; `findEvent` casa por par normalizado (order-aware); `parseTotals`/`parseH2h` agrupam outcomes (descartam linha sem os dois lados). Fixtures inline. Rodar → falha.
- [ ] **Step 3:** implementar `theOddsApi.ts` — `ODDSAPI_MATCH_MARKET={gols:"totals",vitoria:"h2h"}`, `normTeam`, `findEvent`, `parseTotals`, `parseH2h`. As funções `fetchEvents`/`fetchEventOdds` (rede) ficam com `fetch` injetável e cache; NÃO testadas com rede.
- [ ] **Step 4 (test-first providersOdds):** `ManualOdds(linhas).linhas()` devolve as linhas; `NullOdds` devolve `[]`; `TheOddsApiMatchOdds` com `fetchEvents`/`fetchEventOdds` fakes injetados devolve `parseTotals`/`parseH2h`; mercado sem mapping → `[]`. Rodar → falha.
- [ ] **Step 5:** implementar `providers/odds.ts` — `NullOdds`, `ManualOdds`, `TheOddsApiMatchOdds` (deps `fetchEventsFn`/`fetchEventOddsFn` injetáveis, default = módulo real), `BSDMatchOdds` (client injetável). Espelha o Python (try/catch → `[]`).
- [ ] **Step 6:** rodar os 2 testes → PASS; tsc → 0. Commit `feat(ts): odds/theOddsApi + providers/odds + types`.

---

## Task 5: providers/stats.ts (BSDStatsProvider + CrosswalkStatsProvider + OnlyPlayer)

**Files:** Create `ts/src/providers/stats.ts`, `ts/test/providersStats.test.ts`. **Origem:** `providers/stats.py` (+ `OnlyPlayer` de `runner.py`).

- [ ] **Step 1 (test-first):** com um `client` fake (fixtures de `events`/`playerStats`/`eventStats`/`lineups`):
  - `elenco(event)` extrai titulares (`players`) dos dois lados, normalizados `{id,name,team_id,posicao}`.
  - `entity_taxa(id, MARKETS.sot, ctx)` devolve `{mu,minutos_esperados,xi_confirmado,amostra_jogos,concedido_adversario,incerteza}`; mu>0 com histórico; `null` se sem histórico/erro.
  - clamp do opp_mult em [0.7,1.4]; `incerteza` por faixa de n (`<5 alta`, `<12 media`, senão baixa).
  - `team_taxa(teamId, MARKETS.escanteios, ctx)` agrega `corner_kicks` via `eventStats`.
  - `team_rates(teamId, ctx)` devolve `{lambda_for, lambda_against}`.
  - `OnlyPlayer(provider,"Kaiki").elenco(event)` filtra ao alvo; ref inexistente → lança erro com lista de disponíveis.
  Rodar → falha.
- [ ] **Step 2:** implementar espelhando `stats.py`:
  - constantes `HOME_FACTOR=1.08`, `AWAY_FACTOR=0.92`, `OPP_MULT_MIN=0.7`, `OPP_MULT_MAX=1.4`, `TEAM_STAT_FIELD` map.
  - métodos privados `_oppTeamId`, `_teamConceded` (async), `_oppMult`.
  - `elenco`, `entity_taxa` (async — reverte `results`, `filterGamesByScope`, `playerMuFromGames`), `xi_ids`, `team_taxa`, `team_rates`.
  - `CrosswalkStatsProvider` (envolve inner+client; `elenco`/`xi_ids` resolvem por crosswalk; `entity_taxa`/`team_taxa`/`team_rates` delegam).
  - `OnlyPlayer` (restringe `elenco` a um ref por id exato ou substring de nome; delega o resto).
  > Métodos que no Python eram síncronos viram `async` no TS porque o `client` faz `fetch` async. O `pipeline` (Task 7) usa `await`.
- [ ] **Step 3:** rodar → PASS; tsc → 0. Commit `feat(ts): providers/stats (BSD + Crosswalk + OnlyPlayer)`.

---

## Task 6: ai (schema + openrouter + analista) + store/repo

**Files:** Create `ts/src/ai/schema.ts`, `ts/src/ai/openrouter.ts`, `ts/src/ai/analista.ts`, `ts/src/store/repo.ts`, `ts/test/aiSchema.test.ts`, `ts/test/analista.test.ts`, `ts/test/repo.test.ts`. **Origem:** `ai/schema.py`, `ai/openrouter.py`, `ai/analista.py`, `store/repo.py`.

- [ ] **Step 1 (test-first aiSchema):** `validateIaOutput` aceita estrutura válida com jogador/linha ∈ candidatos; rejeita aposta inventada, veredito inválido, faltando chaves. Rodar → falha.
- [ ] **Step 2:** implementar `schema.ts` (`VEREDITOS`, `CONFIANCAS`, `apostaValida`, `validateIaOutput`).
- [ ] **Step 3 (test-first analista):** `analisar(cands, ctx, fakeChat)` com `fakeChat` devolvendo JSON válido → retorna o obj; JSON inválido 2x → fail-closed `{melhor_aposta:null,...}`; `fakeChat` que lança → fail-closed. `fakeAnalista` devolve alerta de IA-desligada. Rodar → falha.
- [ ] **Step 4:** implementar `openrouter.ts` (`chat(messages, {model,temperature,post})` — `post` injetável, default `fetch`; lê `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`) e `analista.ts` (`PROMPT_SISTEMA`, `analisar` com 1 retry + validate, `fakeAnalista`).
- [ ] **Step 5 (test-first repo):** `clv(2.0,1.8)≈0.111`; `InMemoryRepo` salva/lê análise, ledger, crosswalk; `updateFechamento` calcula clv e resultado; `snapshotFechamento` idem sem resultado. Rodar → falha.
- [ ] **Step 6:** implementar `repo.ts`: `clv`, interface `Repo`, `InMemoryRepo` (espelha Python), `SupabaseRepo` (usa `@supabase/supabase-js` `createClient`; métodos `upsert/insert/select/update` equivalentes; default lê `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`). `SupabaseRepo` NÃO testado com banco real (coberto por InMemory).
- [ ] **Step 7:** rodar os 3 testes → PASS; tsc → 0. Commit `feat(ts): ai (schema/openrouter/analista) + store/repo`.

---

## Task 7: pipeline.ts + runner.ts

**Files:** Create `ts/src/pipeline.ts`, `ts/src/runner.ts`, `ts/test/pipeline.test.ts`, `ts/test/runner.test.ts`. **Origem:** `pipeline.py`, `runner.py`.

- [ ] **Step 1 (test-first pipeline):** `analisarJogo(event, MARKETS.sot, fakeStats, ManualOdds([...]), InMemoryRepo, {analistaFn:fakeAnalista})` → `{candidatos, ia}`; candidatos passam pelo `filterCandidates`; salva análise no repo; mercado contagem nível jogador gera 1 candidato/jogador/linha; `partida` usa `team_taxa`. Rodar → falha.
- [ ] **Step 2:** implementar `pipeline.ts` (`analisarJogo` async, `_runContagem`/`_contagemPartida`/`_runPartida`/`_contagemJogador`) — espelha `pipeline.py`, com `await` nos métodos de provider. `INCERTEZA_ORDEM` igual. Grava ledger quando `ia.melhor_aposta.veredito==="APOSTAR"`.
- [ ] **Step 3 (test-first runner):** `normalizeEvent(rawFlat)` → forma aninhada; `runAnalise(client, eventId, "sot", "Kaiki", ...)` monta provider correto por `market.nivel`/`player_ref` e chama `analisarJogo`. Usar client/odds fakes. Rodar → falha.
- [ ] **Step 4:** implementar `runner.ts` (`normalizeEvent`, `runAnalise` async, `fakeAnalista` reexport). Dispatch: partida→base; player_ref→OnlyPlayer(Crosswalk(base)); senão→Crosswalk(base). `odds_provider` injetável (default ManualOdds).
- [ ] **Step 5:** rodar → PASS; tsc → 0. Commit `feat(ts): pipeline + runner (orquestração) espelhados`.

---

## Task 8: service.ts

**Files:** Create `ts/src/service.ts`, `ts/test/service.test.ts`. **Origem:** `service.py`.

- [ ] **Step 1 (test-first):** com client fake — `listarLigas` ordena por nome; `listarJogos` mapeia/ordena (pré asc, pós desc) e monta `placar`; `escalacaoProvavel` devolve `{origem, home, away}` com jogadores resolvidos (lineup→stats-id) ou fallback `ultimos3`; `mediaRecenteJogador` calcula média do stat; `analisar` devolve `{jogo,candidatos,ia,em_validacao}` (em_validacao=true p/ nivel partida); `apostarPaper` bloqueia em_validacao; `resultadoRealJogador` mapeia actuals por player_id. Rodar → falha.
- [ ] **Step 2:** implementar `service.ts` espelhando `service.py` (todas async). Helpers `_playersFromLineup`, `_playersUltimos3`, `_resolverLineup`.
- [ ] **Step 3:** rodar → PASS; tsc → 0. Commit `feat(ts): service (contrato estável p/ a API)`.

---

## Task 9: API Express + Zod

**Files:** Create `ts/src/api/errors.ts`, `ts/src/api/app.ts`, `ts/src/api/server.ts`, `ts/test/api.test.ts`. **Contrato:** ver spec.

- [ ] **Step 1 (test-first, supertest):** montar `app` com um `deps` fake (`{ client, repo }`) injetado; testar:
  - `GET /ligas` → 200, lista.
  - `GET /ligas/9/jogos?status=finished` → 200.
  - `POST /analisar` com body válido → 200 `{jogo,candidatos,ia,em_validacao}`; body inválido (faltando `market_key`) → 400 `{erro,codigo}`.
  - mercado desconhecido → 400.
  Rodar → falha.
- [ ] **Step 2:** implementar `errors.ts` (`class AppError extends Error { constructor(status, codigo, message) }`).
- [ ] **Step 3:** implementar `app.ts`: `createApp(deps)` retorna Express app. Rotas (ver tabela do spec) com schemas Zod (`safeParse` → 400 em erro). Cada handler chama `service.*(deps.client, ...)`. Middleware de erro final: `AppError`→status/codigo; `ValueError`-like (Error de domínio)→400; senão 500. JSON `{erro, codigo}`.
- [ ] **Step 4:** implementar `server.ts`: lê env, cria `BSDClient(getRequired("BZZOIRO_API_KEY"))` e `SupabaseRepo()`, `createApp({client,repo}).listen(PORT)`. Adicionar script `"dev": "node --import tsx src/api/server.ts"` e devDep `tsx` (ou `tsc && node dist`). **Não** roda no teste.
- [ ] **Step 5:** rodar `npx vitest run test/api.test.ts` → PASS; `npx vitest run` (suíte inteira, incl. gate de paridade) → PASS; tsc → 0. Commit `feat(ts): API Express + Zod + error middleware`.

---

## Task 10: CLAUDE.md — nota de adapters + .env

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1:** acrescentar à seção "Backend — Node/TypeScript": variáveis de ambiente (`BZZOIRO_API_KEY`, `THE_ODDS_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`); nota de que `@supabase/supabase-js` aceita a key nova (não precisa do JWT legado); nota do crosswalk usar Dice (fail-closed) em vez de difflib. Como rodar a API: `cd ts && npm run dev`.
- [ ] **Step 2:** Commit `docs: CLAUDE.md nota de env/adapters do backend Node`.

---

## Self-Review

- Cobertura do spec: providers (Task 4,5), crosswalk (3), store (6), IA (6), pipeline/runner (7), service (8), API+Zod+erros (9). ✓
- HTTP/banco sempre injetáveis → testes offline com fakes (igual ao Python). ✓
- Assíncrono: métodos de provider/service/pipeline viram `async` (fetch). Documentado. ✓
- Risco de paridade do crosswalk (Dice vs difflib): mitigado por fail-closed; threshold ajustável. Documentado. ✓
- Suíte do Plano 1 (motor + gate) continua rodando junto e verde. ✓
