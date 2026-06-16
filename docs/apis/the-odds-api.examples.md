# The Odds API v4 — Data Reference

> Documento de referência para a próxima sessão Claude. Foco: shape real dos retornos (capturado **ao vivo em 2026-06-02**) e a estrutura dos mercados de player props de futebol (`player_shots_on_target` / `player_shots`), que são o core do produto.

- **API:** The Odds API v4
- **Docs oficiais:** https://the-odds-api.com/liveapi/guides/v4/#overview · Mercados: https://the-odds-api.com/sports-odds-data/betting-markets.html
- **Base URL:** `https://api.the-odds-api.com/v4`
- **Auth:** **query param** `apiKey` (NÃO é header). Ex.: `?apiKey=$THE_ODDS_API_KEY`. A chave fica em `.env` na var `THE_ODDS_API_KEY`.
- **Formato:** JSON. `oddsFormat=decimal` (default) ou `american`. `dateFormat=iso` (default) ou `unix`.

> ⚠️ **Achado crítico (2026-06-02):** NENHUM evento de futebol — nem a Copa do Mundo — expõe player props (`player_shots_on_target`, `player_shots`, `player_goal_scorer_anytime`, `player_assists`) neste momento. Todas essas chamadas retornam `bookmakers: []`. Só mercados de partida (`h2h`, `totals`) estão populados. Ver **Anomalias**.

---

## Endpoints

| Method | Path | Purpose | Cost/quota |
|--------|------|---------|------------|
| GET | `/v4/sports/?apiKey=...` | Lista todos os sports/ligas (achar `soccer_*`). | **0 créditos** |
| GET | `/v4/sports/{sport}/events?apiKey=...` | Lista eventos (id, times, horário). **Não traz odds/bookmakers.** | **0 créditos** |
| GET | `/v4/sports/{sport}/events/{eventId}/odds?apiKey=...&regions=..&markets=..` | Odds de UM evento, incluindo player props. | **markets × regions** créditos (cobra só se retornar dados — ver nota) |
| GET | `/v4/sports/{sport}/odds/?apiKey=...&regions=..&markets=..` | Odds de TODOS os eventos do sport de uma vez (só mercados "featured": `h2h`,`spreads`,`totals`,`outrights`). | **markets × regions** créditos |
| GET | `/v4/sports/{sport}/events/{eventId}/markets?apiKey=...&regions=..` | Lista quais market keys existem para o evento. | 1 crédito |
| GET | `/v4/sports/{sport}/participants?apiKey=...` | Times/jogadores do sport. | 1 crédito |
| GET | `/v4/sports/{sport}/scores/?apiKey=...` | Placares (resultados). | 1 cr (2 com `daysFrom`) |
| GET | `/v4/historical/sports/{sport}/events/{eventId}/odds?...&date=ISO` | Snapshot histórico de odds. | **10 × markets × regions** |

**Regions:** `us`, `us2`, `uk`, `eu`, `au`. Player props de futebol, quando existem, costumam aparecer em `uk`/`eu`. Cada região é cobrada separadamente.

**Nota de cobrança (observada ao vivo):** o header `x-requests-last` retornou **0** em toda chamada de player props que veio vazia (`bookmakers: []`). A API **só cobra créditos quando retorna dados de bookmaker**. Ou seja: tentar player props num evento que não os tem é **grátis**. A chamada `h2h,totals` no `eu` (13 books) cobrou `last=2`; a `h2h` da Copa em `us,uk,eu` cobrou `last=3`.

---

## Exemplos de retorno (reais, capturados ao vivo)

### `GET /v4/sports/` — lista de sports (0 cr) — 45 entradas, 13 são `soccer_*`
```json
[
  {
    "key": "soccer_brazil_serie_b",
    "group": "Soccer",
    "title": "Brazil Série B",
    "description": "Campeonato Brasileiro Série B",
    "active": true,
    "has_outrights": false
  },
  {
    "key": "soccer_fifa_world_cup",
    "group": "Soccer",
    "title": "FIFA World Cup",
    "description": "FIFA World Cup",
    "active": true,
    "has_outrights": false
  }
  // ... soccer keys ATIVAS em 2026-06: soccer_brazil_serie_b, soccer_chile_campeonato,
  // soccer_china_superleague, soccer_conmebol_copa_libertadores, soccer_conmebol_copa_sudamericana,
  // soccer_fifa_world_cup, soccer_fifa_world_cup_winner (has_outrights=true),
  // soccer_japan_j_league, soccer_norway_eliteserien, soccer_spain_segunda_division,
  // soccer_sweden_allsvenskan, soccer_sweden_superettan, soccer_chile_campeonato
  // (NÃO ativos agora: soccer_usa_mls, soccer_brazil_campeonato/Série A, soccer_epl, soccer_spain_la_liga — fora de temporada)
]
```

### `GET /v4/sports/soccer_fifa_world_cup/events` — eventos (0 cr) — 72 eventos
```json
[
  {
    "id": "80d82d1113934bfbea4ce8daf37a2433",
    "sport_key": "soccer_fifa_world_cup",
    "sport_title": "FIFA World Cup",
    "commence_time": "2026-06-11T19:00:00Z",
    "home_team": "Mexico",
    "away_team": "South Africa"
  }
  // ... +71. O endpoint /events NUNCA traz bookmakers; é só o calendário.
]
```

### `GET .../soccer_brazil_serie_b/events/{id}/odds?regions=eu&markets=h2h,totals` — mercados de partida (cobrou 2 cr) — 13 bookmakers
```json
{
  "id": "5f53708f98ace903914ecddca6a9fcc3",
  "sport_key": "soccer_brazil_serie_b",
  "sport_title": "Brazil Série B",
  "commence_time": "2026-06-05T23:00:00Z",
  "home_team": "Operario PR",
  "away_team": "Juventude",
  "bookmakers": [
    {
      "key": "leovegas_se",
      "title": "LeoVegas (SE)",
      "markets": [
        {
          "key": "h2h",
          "last_update": "2026-06-02T22:25:00Z",
          "outcomes": [
            { "name": "Juventude",   "price": 3.85 },
            { "name": "Operario PR", "price": 2.08 },
            { "name": "Draw",        "price": 2.85 }
          ]
        }
      ]
    },
    {
      "key": "unibet_nl",
      "title": "Unibet",
      "markets": [
        {
          "key": "totals",
          "last_update": "2026-06-02T22:24:59Z",
          "outcomes": [
            { "name": "Over",  "price": 2.33, "point": 2.5 },
            { "name": "Under", "price": 1.55, "point": 2.5 }
          ]
        }
      ]
      // ... 13 bookmakers no total; cada um repete h2h e/ou totals
    }
  ]
}
```
> **h2h de futebol tem 3 outcomes:** os dois times + `"Draw"` (empate). `totals` usa `name` = `"Over"`/`"Under"` + `point` = a linha (gols). `price` = odd decimal.

### `GET .../soccer_fifa_world_cup/events/{id}/odds?regions=us,uk,eu&markets=h2h` — Copa h2h (cobrou 3 cr) — 41 bookmakers
```json
{
  "id": "80d82d1113934bfbea4ce8daf37a2433",
  "sport_key": "soccer_fifa_world_cup",
  "sport_title": "FIFA World Cup",
  "commence_time": "2026-06-11T19:00:00Z",
  "home_team": "Mexico",
  "away_team": "South Africa",
  "bookmakers": [
    {
      "key": "betmgm",
      "title": "BetMGM",
      "markets": [
        {
          "key": "h2h",
          "last_update": "2026-06-02T22:24:16Z",
          "outcomes": [
            { "name": "Mexico",       "price": 1.45 },
            { "name": "South Africa", "price": 7.5 },
            { "name": "Draw",         "price": 4.2 }
          ]
        }
      ]
    }
    // ... 41 bookmakers (betmgm, fanduel, paddypower, skybet, marathonbet, pinnacle, grosvenor, betfair_ex_uk, ...)
  ]
}
```
> Os **mercados de partida da Copa JÁ estão populados** (41 books, 9 dias antes do kickoff). O bloqueio antigo de "bookmakers vazios na Copa" NÃO se aplica mais a h2h/totals em 2026-06-02.

### `GET .../{id}/odds?markets=player_shots_on_target,player_shots` — player props (cobrou **0 cr**, VAZIO em TODA liga testada)
```json
{
  "id": "80d82d1113934bfbea4ce8daf37a2433",
  "sport_key": "soccer_fifa_world_cup",
  "sport_title": "FIFA World Cup",
  "commence_time": "2026-06-11T19:00:00Z",
  "home_team": "Mexico",
  "away_team": "South Africa",
  "bookmakers": []
}
```
> Resultado IDÊNTICO (`bookmakers: []`, `x-requests-last: 0`) testando: Copa do Mundo (us,uk,eu), J League (us; uk,eu), Brazil Série B (us,uk,eu) — e também para `player_goal_scorer_anytime` e `player_assists`. **Nenhum player prop de futebol está disponível ao vivo neste momento.**

### Shape ESPERADO de `player_shots_on_target` / `player_shots` (segundo docs oficiais — NÃO capturado ao vivo)
Quando um book oferecer o mercado, o objeto `market` terá esta forma (Over/Under por jogador). O nome do jogador vem em **`description`**, a linha em **`point`**, a odd em **`price`**, e `name` é `"Over"`/`"Under"`:
```json
{
  "key": "player_shots_on_target",
  "last_update": "2026-06-11T17:00:00Z",
  "outcomes": [
    { "name": "Over",  "description": "Hirving Lozano", "point": 0.5, "price": 1.90 },
    { "name": "Under", "description": "Hirving Lozano", "point": 0.5, "price": 1.80 },
    { "name": "Over",  "description": "Hirving Lozano", "point": 1.5, "price": 3.40 },
    { "name": "Under", "description": "Hirving Lozano", "point": 1.5, "price": 1.28 }
    // ... um par Over/Under por (jogador × linha). `player_shots` tem a MESMA estrutura.
  ]
}
```
> **Para o modelo:** chave de identificação do jogador = `outcomes[].description` (string, nome do jogador — NÃO há player_id numérico). A linha = `point` (float, ex. 0.5/1.5/2.5). A odd = `price`. O lado = `name` (`"Over"`/`"Under"`). A API **não** fornece ID de jogador nem stats reais (SOT/chutes/desarmes históricos) — só odds. Stats vêm de outra fonte (BSD/API-Football; ⚠️ **FBref perdeu o feed Opta em 2026-01-20 — não é mais fonte de stats**). Cruzamento de nomes via `jogadores_crosswalk`.

---

## Dicionário de dados

### `/sports/` (array de objetos)
| field path | tipo | significado |
|---|---|---|
| `[].key` | string | ID do sport/liga (ex. `soccer_fifa_world_cup`, `soccer_brazil_serie_b`). Usado no path dos outros endpoints. |
| `[].group` | string | Grupo (`"Soccer"`). |
| `[].title` | string | Nome legível (`"FIFA World Cup"`). |
| `[].description` | string | Descrição longa. |
| `[].active` | bool | `true` se a liga está em temporada/aceita chamadas com dados. |
| `[].has_outrights` | bool | `true` para mercados de futuro (ex. `soccer_fifa_world_cup_winner`). |

### `/events` e o envelope de `/odds` (objeto por evento)
| field path | tipo | significado |
|---|---|---|
| `id` | string (hex 32) | event_id. Chave para `/events/{id}/odds`. |
| `sport_key` | string | liga. |
| `sport_title` | string | nome da liga. |
| `commence_time` | string ISO 8601 (`...Z`, UTC) | kickoff. |
| `home_team` | string | time da casa. |
| `away_team` | string | time visitante. |
| `bookmakers` | array | lista de casas (VAZIA em `/events`; preenchida em `/odds` se houver mercado). |

### `bookmakers[]`
| field path | tipo | significado |
|---|---|---|
| `bookmakers[].key` | string | ID da casa (`betmgm`, `pinnacle`, `unibet_nl`, `betfair_ex_uk`, `leovegas_se`...). |
| `bookmakers[].title` | string | nome legível. |
| `bookmakers[].last_update` | string ISO 8601 | quando a casa atualizou esse preço. |
| `bookmakers[].markets` | array | mercados oferecidos por essa casa. |

### `bookmakers[].markets[]`
| field path | tipo | significado |
|---|---|---|
| `markets[].key` | string | market key (`h2h`, `totals`, `player_shots_on_target`, `player_shots`, ...). |
| `markets[].last_update` | string ISO 8601 | timestamp do mercado. |
| `markets[].outcomes` | array | seleções apostáveis. |

### `markets[].outcomes[]` (o nível que importa para o modelo)
| field path | tipo | significado |
|---|---|---|
| `outcomes[].name` | string | Para `h2h`: nome do time ou `"Draw"`. Para `totals`/props O/U: `"Over"` / `"Under"`. Para props Yes/No: `"Yes"`/`"No"`. |
| `outcomes[].price` | float (number) | **odd decimal** (com `oddsFormat=decimal`). É o input para de-vig/EV. |
| `outcomes[].point` | float (number) \| ausente | linha da aposta. `totals` = gols (2.5); `player_shots_on_target`/`player_shots` = nº de chutes (0.5, 1.5...). **Ausente** em `h2h` e em props Yes/No. |
| `outcomes[].description` | string \| ausente | **nome do jogador** em player props (ex. `"Hirving Lozano"`). É o identificador do jogador (NÃO há ID numérico). Ausente em mercados de partida. |

### Headers de quota (em toda resposta)
| header | tipo | significado |
|---|---|---|
| `x-requests-remaining` | int | créditos restantes no mês. |
| `x-requests-used` | int | créditos já consumidos no mês. |
| `x-requests-last` | int | custo desta chamada (0 quando retorno veio vazio). |

---

## Anomalias observadas (ao vivo, 2026-06-02)

1. **Player props de futebol = totalmente indisponíveis agora.** `player_shots_on_target`, `player_shots`, `player_goal_scorer_anytime`, `player_assists` retornaram `bookmakers: []` em **todas** as ligas testadas: Copa do Mundo (us,uk,eu), J League (us; uk,eu), Brazil Série B (us,uk,eu). **Este é o bloqueador central do produto** — a fonte de odds de SOT por jogador não está entregando dados. (Provável: props só sobem horas antes do kickoff e/ou The Odds API cobre shots props só nas grandes ligas europeias, que estão fora de temporada em junho.)
2. **Chamada vazia = grátis.** `x-requests-last: 0` sempre que `bookmakers` veio `[]`. Dá para "sondar" um evento por props sem gastar crédito. A cobrança só ocorre quando há dados de book. (Começamos com `x-requests-used: 3` — uso prévio do dono da chave — e só subiu nas chamadas com retorno: +2 no `h2h,totals` Brasil, +3 no `h2h` Copa us,uk,eu. Total gasto nesta sessão: **5 créditos**.)
3. **O "bloqueio da Copa" NÃO vale para mercados de partida.** A Copa começa 2026-06-11 e o `h2h` já retorna **41 bookmakers** com odds reais (us+uk+eu). O bloqueio histórico de "bookmakers vazios na Copa" só persiste para **player props**, não para h2h/totals.
4. **Ligas grandes fora de temporada.** Em junho/2026, `/sports` lista apenas 13 `soccer_*` ativos — secundários (Série B BR, J League, Allsvenskan, Eliteserien, La Liga 2, Superettan, Super League China) + competições CONMEBOL + a própria Copa. **MLS, Brasileirão Série A, EPL, La Liga NÃO aparecem como ativos.** As ligas que carregam shots props (top europeias) não estão rodando.
5. **Sem player_id numérico.** A única identificação de jogador em props é `outcomes[].description` (string com o nome). Cruzamento com stats (BSD/API-Football; **FBref morreu 2026-01-20**, perdeu o feed Opta) depende de match por nome → usar `jogadores_crosswalk`.
6. **`point`/`description` são campos OPCIONAIS** — ausentes (não `null`) quando não se aplicam. Código deve usar `.get("point")` / `.get("description")`, não acesso direto.
7. **`player_tackles` (desarmes) NÃO está na lista de mercados de futebol** das docs (`betting-markets.html`). The Odds API expõe shots, shots_on_target, assists, goal scorer e cartões — mas **não desarmes nem escanteios por jogador**. Corners só como mercado de time (`alternate_totals_corners`). Para desarmes/escanteios por jogador, esta API não serve — usar outra fonte.
8. **Bookmaker keys variam por região.** us traz `betmgm`/`fanduel`/`draftkings`; uk/eu trazem `pinnacle`/`paddypower`/`skybet`/`betfair_ex_uk`/`marathonbet`/`grosvenor`; books regionais como `leovegas_se`, `unibet_nl` aparecem no `eu`.
