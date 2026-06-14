# Ficha — Betnacional (`betnacional.bet.br`)

> **Status:** 🟢 **GO — 2ª casa do v1. FETCH RESOLVIDO via headless (2026-06-14).** Endpoint de prop,
> shape, de-para e regra de liquidação CONFIRMADOS por captura deslogada no BR (Holanda×Japão, evento
> ramp `914873610`); adapter (`parseBet6` + `BETNACIONAL_TABLE`) + CLI (`--bet6`) prontos/testados; o
> Cloudflare é passado por **Chromium headless local** (Playwright, `src/cli/browserFetch.ts`).
> **Provado ao vivo:** 3187 mercados → 597 linhas de jogador limpas (odds realistas, 0 duplicata).
> Resta só a **corrida real** (gravar; o dono dá o OK) e o crosswalk auto (id "ramp" da lista).

## ✅ Fase 0 — o que a captura revelou (CONFIRMADO; corrige a premissa de GraphQL)
- **NÃO é GraphQL.** As odds saem de **um GET REST único e público** (deslogado), ~2 MB, todas as
  odds do jogo de uma vez:
  ```
  GET https://prod-global-bff-events.bet6.com.br/api/event-odds/{rampEventId}/grouped?languageId=1&marketIds=&outcomeIds=&statusId=0&provider=ramp
  ```
- **Shape:** `{ events, odds, scores, cards, tabs }`. Cada `odds[]`: `outcome_name` = **jogador**
  (`player_name` é null!), `market_code` (EN, estável, entre pipes, ex.: `|Player To Have 1 Or More
  Shots On Target|`), `market_name` (PT, fraseado VARIA), `odd` (string), `is_bet_builder`.
- **É ESCADA "N ou mais"** (one-sided over): "1 ou mais"=over 0.5, "2 ou mais"=over 1.5, "3 ou
  mais"=over 2.5 → **encaixa nas linhas canônicas**; a linha está NO NOME do mercado (sem campo). O
  parser (`parseBet6 → classify`) extrai (família, N) do code/name.
- **De-para** (`BETNACIONAL_TABLE`): `shots on target`→`sot`; `shots`→`finalizacoes`; `fouls
  committed`→`faltas`; `fouls won` (recebidas/sofridas)→**reject**. **Sem mercado de desarmes** neste
  evento (só KTO cobre desarme). 1º tempo / gol / cartão → não mapeado (fail-closed).
- **id do jogo = "ramp"** (914873610, NÃO `sr:match:`); times por `home_id`/`away_id`. Crosswalk
  BSD→ramp por id explícito (`--bet6`) até capturar o endpoint de LISTA de eventos.

## ✅ Cloudflare — passado por Chromium headless (Playwright)
- O `fetch` cru do Node toma **403 "Attention Required"** (challenge JS + TLS JA3 de não-navegador);
  cabeçalhos de browser NÃO bastam. Solução escolhida e PROVADA: **Chromium headless local**
  (`src/cli/browserFetch.ts`, `makeBrowserGet`) — navega até a URL da API (Cloudflare resolve o
  challenge e seta `cf_clearance`), depois refaz via `fetch` no contexto da página → JSON limpo.
  Roda na máquina do dono (BR), deslogado, sem captura manual. `HEADFUL=1` se o Cloudflare endurecer.
  Serve também as futuras casas Cloudflare (Superbet/Betano).
- **Armadilha de classificação resolvida:** o `market_code` (EN) é a fonte autoritativa, com regex
  ANCORADO (`^player to have (\d+) or more shots on target$` etc.) — exclui de graça "In 1st/2nd
  Half", "In Each Half" (que vazava SOT 0.5 duplicado — defensor "chute no gol em cada tempo" @31-61),
  "Foul Involvements" (envolvimentos) e mercados de Team/Match/Each Team. `Player To Win N Fouls` =
  sofridas → reject. Validado nos 81 market_codes do evento.

## ✅ Crosswalk auto (FEITO) — não precisa mais colar id
- **Lista de jogos:** `GET /api/odds/1/events-by-seasons?sport_id=1&category_id=0&tournament_id=950049532&markets=1&provider=ramp`
  (tournament_id 950049532 = Copa; descoberto gravando a rede da página `/apostas-copa-do-mundo-2026`).
  Retorna `{odds,outrights,scores}`; os 64 jogos estão em `odds[]` (1 linha por mercado → `parseBet6EventList`
  DEDUP por `event_id`; nomes em PT). Fetch pelo mesmo headless.
- **Casamento PT×EN/FR:** `canonicalTeam` (`src/collect/teamNames.ts`) reduz Alemanha/Germany,
  Holanda/Netherlands, Costa do Marfim/Côte d'Ivoire/Ivory Coast à mesma chave → `matchEventByName`.
- **CLI:** `npx tsx src/cli/collectOdds.ts <event_id_BSD>` resolve KTO + Betnacional sozinho.

## Risco residual
- Cloudflare pode endurecer; `HEADFUL=1` é o plano B. Mapa de nomes é de SELEÇÃO (Copa); clube depois.

## Evidências
- LIVE: `prod-global-bff-events.bet6.com.br/api/sports` → 200 (incl. Copa 2026); `/api/markets` → 200 (catálogo Sportradar); `graphql.bet6.com.br/graphql` → POST vivo (introspection disabled).
- Bundle JS expõe o mapa de microserviços + `bet-client-stg.nsx.services` (confirma vendor NSX) + erro `Expected a numeric SportRadar ID`.
- Plataforma: gamesbras.com (NSX exclusive) + flutter.com (aquisição NSX/Betnacional 2024).
- Nenhum scraper público dedicado existe no GitHub (raspagem caseira de endpoint interno).
- Agregadores pagos (OpticOdds, Betstamp) revendem odds da Betnacional → feed estável/raspável.
