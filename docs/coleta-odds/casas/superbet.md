# Superbet — ✅ AO VIVO

| | |
|---|---|
| **Status** | ✅ Em produção (3ª casa). Provado ao vivo 2026-06-15. |
| **Plataforma** | **Betler** (plataforma própria da Superbet), motor de dados **Sportradar/Betradar**. |
| **Como busca** | **`fetch` puro** — endpoint público em CDN **Fastly**, sem login/token/cookie. |
| **Anti-bot** | **Nenhum.** Sem Cloudflare, sem Turnstile, sem captcha. `fetch` cru com `credentials:'omit'` → HTTP 200. |
| **Geoblock** | Rodando local no BR (geo detecta BR normalmente; odds em Fastly respondem sem cookie). |
| **Mercados** | SOT, finalizações, **desarmes**, faltas (cometidas). **Cobre desarmes** (ao contrário da Betnacional). |
| **Código** | `src/collect/adapters/superbet.ts` · de-para em `tables.ts::SUPERBET_TABLE` · `needsBrowser:false` no `houses.ts`. |

## Endpoints (públicos, deslogado)

```
# odds de UM jogo (GET REST único, traz a oferta inteira):
GET https://production-superbet-offer-br.freetls.fastly.net/v2/pt-BR/events/{eventId}

# lista de jogos (crosswalk) — events/by-date, REST JSON (NÃO o /structure, que é SSE inútil):
GET https://production-superbet-offer-br.freetls.fastly.net/v2/pt-BR/events/by-date
    ?currentStatus=active&offerState=prematch&sportId=5&startDate=YYYY-MM-DD%20HH:MM:SS&endDate=...
```

- `eventId` é **número interno inteiro** (ex.: `12512182`) — mesmo valor em `eventId`/`offerId`/URL.
  O payload também traz `betradarId` (Sportradar) e `uuid` para casar por ID se quiser.
- `events/by-date`: `startDate` é **obrigatório**, `sportId=5`=futebol. **Não filtramos por `tournamentIds`**
  (o set completo da Copa não foi cravado — 1431–1439 davam só 33 jogos) → buscamos o futebol da janela
  default `[agora−1d, agora+21d]` e deixamos o `matchEventByName` casar pelo nome. Passe `tournamentIds`
  pra estreitar se precisar.

## Shape e parsing

- Wrapper: `{error, dataIn, data:[ {...evento..., odds:[...]} ]}`. As seleções estão em **`data[0].odds`**,
  um **array PLANO** — cada item já carrega o próprio `marketId`/`marketName` (não há objeto "market" pai;
  o parser agrupa por `marketId`).
- **Linha:** campo numérico limpo **`specifiers.total`** (`"0.5"`, `"1.5"`, …) — não precisa parsear o nome.
  É **escada "Mais de X.5"** (one-sided over; `hasUnder=false`).
- **Jogador:** **`extra["replaced-spec-player_name"]`** (nome cheio, ex.: `"Ali, Taha Abdi"`), fallback
  `specifiers.player_name` (`"Ali, Taha"`). IDs estáveis: `extra["betradar-player-id"]` (`sr:player:…`).
- **Odd:** **`price`**, número decimal (`1.61`).
- Pula: `status != "active"` (suspenso), seleção sem jogador (mercado de time/partida), sem `marketId`,
  sem linha numérica — tudo fail-closed.

## De-para + armadilhas (chave = `marketId` NUMÉRICO)

A casa **não expõe rótulo EN** (`code` = null) e o `marketName` em PT varia → a chave do de-para é o
**`marketId`** (estável). O parser emite `market_label = String(marketId)`; `SUPERBET_TABLE` mapeia:

| `marketId` | `marketName` | → |
|---|---|---|
| `236220` | Jogador - Chutes no Gol | `sot` (on-target) |
| `236218` | Jogador - Finalizações | `finalizacoes` (total de chutes) |
| `236222` | Jogador - Total de Desarmes | `desarmes` (realizados = `won_tackle`) |
| `236216` | Jogador - Faltas Cometidas | `faltas` |
| `238449` | Jogador - Faltas Sofridas | **rejeitado** (sofridas ≠ cometidas) |
| outros de jogador | pé esq/dir, cabeceio, fora da área, "vezes desarmado", impedimentos | **rejeitado** (não mapeado → fail-closed) |

> **Liquidação (Sportradar/Betradar, igual Betnacional):** o `info` da seleção é explícito —
> desarmes = **"realizados"** (ganhos/com sucesso = nosso `won_tackle`), faltas = **"cometidas"**,
> SOT = **on-target** (distinto de Finalizações, que é o total). Não há doc de regras formal na UI;
> a semântica vem do `info` + dos ids `betradar`.

## Crosswalk

`events/by-date` → `data[]` com `eventId` (inteiro) + `matchName` em **PT** separado por `·`
("Suécia·Tunísia"). `parseSuperbetEventList` faz `split("·")` → `{id, home, away}`; `canonicalTeam` resolve
contra a BSD (EN/FR). Casou **Sweden×Tunisia → `12512182` com confiança 1.0** (2026-06-15).

## Validação ao vivo (2026-06-15)

Jogo Suécia×Tunísia (`12512182`), deslogado, BR: 1842 props de jogador → **795 linhas canônicas**
(sot 132 · finalizações 231 · desarmes 218 · faltas 214), 1047 rejeitadas (fail-closed). `fetch` puro,
sem qualquer header. Crosswalk pela lista resolveu o jogo sozinho (conf 1.0).
