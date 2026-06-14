# KTO — ✅ AO VIVO

| | |
|---|---|
| **Status** | ✅ Em produção (1ª casa). Provado ao vivo 2026-06-14. |
| **Plataforma** | **Kambi** (sportsbook + feed de odds; KTO é a casca/marca). |
| **Como busca** | `fetch` puro (CDN da Kambi é permissivo). **Não** precisa de navegador. |
| **Anti-bot** | Só rate-limit **Varnish** (HTTP 410 sob volume) → resolve com pausa/backoff. Sem Cloudflare/JS-challenge. **Deslogado, sem token/cookie.** |
| **Geoblock** | Mitigado rodando **local no BR**. |
| **Mercados** | SOT, finalizações, **desarmes**, faltas (cometidas). |
| **Código** | `src/collect/adapters/kto.ts` · de-para em `tables.ts::KTO_TABLE`. |

## Endpoints

```
# odds de UM jogo (todos os mercados, incl. props):
GET https://us.offering-api.kambicdn.com/offering/v2018/ktobr/betoffer/event/{kambiEventId}.json
    ?lang=pt_BR&market=BR&client_id=200&channel_id=1&includeParticipants=true&range_start=0&range_size=800

# lista de jogos da Copa (crosswalk; em inglês p/ casar com a BSD):
GET https://us.offering-api.kambicdn.com/offering/v2018/ktobr/listView/football/world_cup_2026.json
    ?lang=en_GB&market=BR&client_id=200&channel_id=1&useCombined=true
```

- operatorCode = `ktobr`, região = `us`. `range_size=800` puxa os ~770 mercados de uma vez (a página
  pagina com `range_size=1`).
- O caminho do grupo (`football/world_cup_2026`) sai do `events[0].path` do próprio betoffer — se mudar
  de torneio, é só trocar esse termo.

## Shape e parsing

- `criterion.englishLabel` = rótulo do mercado, **com sufixo de liquidação** `(Settled/Decided using
  Opta data)` (varia) + apóstrofo → o parser (`cleanKambiLabel`) limpa antes do de-para.
- `outcomes[].participant` = jogador; `type` `OT_OVER`/`OT_UNDER`; `odds` e `line` em **milésimos**
  (3700 = 3.70; 500 = 0.5).

## De-para + liquidação (confirmado na captura)

| Rótulo (englishLabel limpo) | Liquida (Opta) | → mercado |
|---|---|---|
| `players shots on target` | shots on target | `sot` |
| `players shots` | total shots | `finalizacoes` |
| `player tackles` ("Desarmes **completados**") | **tackles ganhos** (`won_tackle`) | `desarmes` |
| `players fouls committed` | faltas cometidas | `faltas` |
| `players fouls won` | faltas **sofridas** | **rejeitado** (não modelamos) |

> A KTO é a **única** das implementadas que cota **desarme** — e cota como **ganho** (`won_tackle`),
> exatamente o que o modelo prevê (decomposição tentativas × aproveitamento).

## Crosswalk

`listView/football/world_cup_2026` (em inglês) → 64 jogos com `homeName`/`awayName` → `matchEventByName`
(via `canonicalTeam`). Casou Germany×Curaçao → `1025862126` com confiança 1.0.

## Observações

- `desarmes`/`finalizações` podem ter menos cobertura que SOT em alguns jogos (mercado fecha perto do
  início). Normal.
