# Ficha — KTO (`kto.bet.br`)

> **Status:** 🟢 **GO — 1ª casa do v1. FASE 0 + WIRING CONCLUÍDOS (2026-06-14).** Endpoint de
> prop, shape e regra de liquidação CONFIRMADOS por captura deslogada no BR (Alemanha–Curaçao,
> evento Kambi `1025862126`). Parser + de-para + pipeline + crosswalk + **CLI** (`collectOdds.ts`)
> no código (368 testes). Resta só a **corrida ao vivo** (o dono roda local no BR — ver fim).

## ✅ Fase 0 — o que a captura revelou (CONFIRMADO)

- **Endpoint (GET JSON público, SEM auth/cookie — funciona deslogado):**
  ```
  https://us.offering-api.kambicdn.com/offering/v2018/ktobr/betoffer/event/{kambiEventId}.json
    ?lang=pt_BR&market=BR&client_id=200&channel_id=1&includeParticipants=true&range_start=0&range_size=800
  ```
  Host real = `us.offering-api.kambicdn.com` (NÃO o `kambicdn.org` antigo). operatorCode = `ktobr`,
  região = `us`, `client_id=200`. As abas de prop ("Chutes a gol", "Desarmes") são filtros
  client-side — **uma** chamada traz tudo. `range_size=1` na chamada do site (pagina); usar
  `range_size=800` puxa os ~776 betOffers de uma vez. Builders no código: `ktoBetofferUrl()` /
  `ktoListViewUrl()` em `src/collect/adapters/kto.ts`.
- **Shape:** `criterion.englishLabel` (com sufixo de liquidação `(Settled/Decided using Opta data)`
  — VARIA), `outcomes[].participant` (jogador), `type` `OT_OVER`/`OT_UNDER`, `odds`/`line` em
  **milésimos** (3700=3.70; 500=0.5), `betOfferType.name="Player Occurrence Line"`.
- **De-para + LIQUIDAÇÃO confirmada** (`src/collect/tables.ts::KTO_TABLE`):
  | Rótulo KTO (PT) | englishLabel | Liquida (Opta) | → market_type |
  |---|---|---|---|
  | Chutes a gol pelo jogador | Player's shots on target | shots on target | `sot` ✅ |
  | Chutes pelo jogador | Player's shots | total shots | `finalizacoes` ✅ |
  | **Desarmes completados** pelo Jogador | Player tackles | **tackles WON** (won_tackle) | `desarmes` ✅ (bate o settle do modelo) |
  | Faltas **concedidas** pelo jogador | Player's fouls committed | fouls committed | `faltas` ✅ |
  | Faltas **ganhas** pelo jogador | Player's fouls won | fouls won/drawn | **reject** (sofridas, não modelamos) |
  > Achado crítico: a KTO cota desarme como **GANHO** ("completados" = won_tackle), exatamente o que
  > o modelo liquida (decomposição tentativas×aproveitamento). Sem ambiguidade tentativa-vs-ganho.
- O parser `cleanKambiLabel` tira o sufixo Opta + apóstrofo antes do de-para EXATO (robusto à
  variação Settled/Decided). Testado no shape real em `test/collect/ktoParser.test.ts`.

## ✅ Wiring (FEITO — `src/collect/` + `src/cli/collectOdds.ts`, 368 testes verdes)
- **Pipeline `collectOdds`** (`src/collect/pipeline.ts`): `collectAll` → `normalizeByBook` (de-para de
  cada casa) → `flagDivergences` → `pickBestPrice`. Devolve `linhas_por_casa` (o que se GRAVA, PK
  inclui book → a análise re-faz o shopping/divergência) + `linhas` (vencedoras, p/ exibir).
- **Crosswalk de jogo** `matchEventByName` (`src/collect/matchEvent.ts`): casa (home,away) da BSD ao
  evento da casa por Dice (testa ordem normal + invertida), **fail-closed** < threshold.
- **CLI** `npx tsx src/cli/collectOdds.ts <event_id_BSD> --kambi <id_kambi> [--dry]` — fetch público
  deslogado (backoff no Varnish 410/429), grava no `odds`. `--league <country/league>` faz o crosswalk
  automático via listView; `--dry` só imprime.

## ✅ Crosswalk auto (FEITO) — listView confirmado
- O `betoffer` traz `events[0].path` = grupo do jogo → Copa = termos `football/world_cup_2026`.
- `ktoListViewUrl("football/world_cup_2026", "en_GB")` → 64 jogos com `homeName`/`awayName` em inglês
  (`parseKambiListView`). `matchEventByName` (com `canonicalTeam`) casa com a BSD.
- **CLI:** `npx tsx src/cli/collectOdds.ts <event_id_BSD>` resolve KTO sozinho (sem `--kambi`).

## ⏳ Resta (a CORRIDA ao vivo — só o dono roda, local no BR)
- Rodar o CLI **sem `--dry`** p/ gravar de verdade (precisa do OK explícito do dono — o classificador
  barra escrita em produção). Provado em `--dry`: 8295 → KTO 1025862126 (conf 1.0).

## Plataforma
**Kambi Group** (sportsbook turnkey + feed de odds). Confirmado: press release oficial Kambi/KTO de
set-2024 (deal multi-anual para o mercado regulado `kto.bet.br`). KTO trocou o provider anterior pela
Kambi. A casca/UX é "KTO Platform" própria, mas **as odds e o sportsbook (inclui player props e Bet
Builder) são Kambi.**

## Endpoint — pré-captura (HISTÓRICO; substituído pelos dados CONFIRMADOS acima)
> O que se supunha antes da captura: host `{regiao}-offering.kambicdn.org`, `client_id=2`. A captura
> de 2026-06-14 corrigiu para **`us.offering-api.kambicdn.com`** e **`client_id=200`** (ver topo).
> Mantido só como registro do que mudou.

- Anti-bot: **só um rate-limiter Varnish** (HTTP 410 "Guru Meditation" sob volume) → resolve com
  throttle. **Sem** Cloudflare/DataDome/Akamai/PerimeterX. **Sem** WebSocket cifrado no pré-jogo.
  Captura confirmou: **nenhum** token/cookie no handshake (deslogado retorna 200).

## Risco residual
- Geoblock **provável** no offering regulado → **mitiga rodando local no BR** (STATUS §2).
- Crosswalk BSD→Kambi (id de jogo) ainda por construir — risco baixo (casamento por nome/data).

## Evidências
- Kambi×KTO deal: https://www.kambi.com/press_release/kambi-group-plc-signs-multi-year-online-sportsbook-partnership-with-fast-growing-brazilian-operator-kto-group/ · https://sbcnews.co.uk/sportsbook/2024/09/12/kto-kambi-brazil/
- Padrão de scraping Kambi (GET JSON, sem auth): https://github.com/HaraldNordgren/betting-crawler · https://github.com/S1M0N38/soccerapi (issue #34 documenta o Varnish 410) · https://github.com/pdmuinck/kambi-sports-book (rota `/events/{id}/betoffers`, ~27 operadores) · https://www.blog.bowtiedbettor.com/p/scraping-time-selenium-too-slow (raspa Kambi SEM Selenium)
- Props no catálogo Kambi: https://www.kambi.com/kambi-what-we-do-b2b-sports-betting-platform/bet-builder/ · `.../odds-feed-plus/`
