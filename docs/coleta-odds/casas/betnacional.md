# Betnacional — ✅ AO VIVO

| | |
|---|---|
| **Status** | ✅ Em produção (2ª casa). Provado ao vivo 2026-06-14. |
| **Plataforma** | **NSX/Bet6** (adquirida pela Flutter), motor de dados **Sportradar**, provider interno **"ramp"**. |
| **Como busca** | **Navegador headless** (Playwright/Chromium) — o `fetch` puro é barrado. |
| **Anti-bot** | **Cloudflare** (challenge JS + fingerprint de TLS): `fetch` cru toma **403 "Attention Required"**. O headless passa (resolve o challenge e ganha o cookie `cf_clearance`). |
| **Geoblock** | Rodando local no BR. |
| **Mercados** | SOT, finalizações, faltas (cometidas). **Não cota desarmes** (neste torneio). |
| **Código** | `src/collect/adapters/bet6.ts` · de-para em `tables.ts::BETNACIONAL_TABLE` · headless em `src/cli/browserFetch.ts`. |

## Endpoints

```
# odds de UM jogo (GET REST único, ~2 MB, traz tudo):
GET https://prod-global-bff-events.bet6.com.br/api/event-odds/{rampEventId}/grouped
    ?languageId=1&marketIds=&outcomeIds=&statusId=0&provider=ramp

# lista de jogos da Copa (crosswalk):
GET https://prod-global-bff-events.bet6.com.br/api/odds/1/events-by-seasons
    ?sport_id=1&category_id=0&tournament_id=950049532&markets=1&filter_time_event=&provider=ramp
```

- **NÃO é GraphQL** (premissa inicial errada) — é REST. `tournament_id=950049532` = Copa do Mundo
  (descoberto gravando a rede da página `/apostas-copa-do-mundo-2026` com o headless).

## Shape e parsing

- Odds em `odds[]`. `outcome_name` = **jogador** (`player_name` vem **null**). `market_code` (inglês,
  estável, entre pipes) é a fonte autoritativa; `market_name` (PT) tem fraseado que varia.
- **É escada "N ou mais"** (só "Mais"/over): "1 ou mais" = over 0.5, "2 ou mais" = over 1.5, etc. — a
  **linha está embutida no nome** do mercado. O parser (`classify`) extrai (família, N) do `market_code`.
- `odd` é string ("1.333").

## De-para + armadilhas (classificação por `market_code` ANCORADO)

`classify` usa regex **ancorado** (`^...$`) no `market_code` — isso exclui sozinho as variantes que
**não** queremos:

| `market_code` | → |
|---|---|
| `Player To Have N Or More Shots On Target` | `sot` |
| `Player To Have N Or More Shots` | `finalizacoes` |
| `Player To Commit N Or More Fouls` | `faltas` (cometidas) |
| `Player To Win N Or More Fouls` | **rejeitado** (faltas sofridas) |
| `...In 1st/2nd Half`, `...In Each Half` | **rejeitado** (tempo parcial) |
| `Player To Have N Or More Foul Involvements` | **rejeitado** (envolvimentos ≠ cometidas) |
| `Team/Match/Each Team ...` | **rejeitado** (não é jogador) |

> **Armadilha real encontrada e resolvida:** `In Each Half` ("em cada tempo") vazava como SOT over 0.5
> duplicado — um zagueiro "dar chute no gol em cada tempo" tinha odd 31–61, poluindo o line shopping. A
> âncora `^...$` mata isso porque o texto extra quebra o casamento.

## Crosswalk

`events-by-seasons?tournament_id=950049532` → `{odds, outrights, scores}`; os 64 jogos estão em `odds[]`
(uma linha por mercado → `parseBet6EventList` deduplica por `event_id`). Nomes em **PT** ("Alemanha",
"Costa do Marfim") → `canonicalTeam` resolve contra a BSD (EN/FR). Casou Germany×Curaçao → `914873584`
com confiança 1.0.

## Observações

- A lista de jogos só veio em PT (não há `languageId=2`); por isso o `canonicalTeam` é essencial aqui.
- Se o Cloudflare endurecer: `HEADFUL=1` (abre janela real). O mesmo headless servirá Superbet/Betano.
