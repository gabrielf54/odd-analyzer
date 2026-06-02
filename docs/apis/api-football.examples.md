# API-Football v3 — Referência de dados

Documento de referência para a próxima sessão do Claude. Capturas **reais ao vivo** em 2026-06-02
(plano **Free**), liga `id=39` (Premier League), temporada `2023` (= época 2023/24).

- **API:** API-Football v3 (api-sports.io)
- **Docs oficiais:** https://www.api-football.com/documentation-v3
  *(o site bloqueia fetch automatizado com HTTP 403; as capturas abaixo vêm de chamadas reais)*
- **Base URL:** `https://v3.football.api-sports.io`
- **Auth:** header HTTP `x-apisports-key: <KEY>` (use a env var `$APIFOOTBALL_KEY`).
  Não usa query param. (Há também o gateway RapidAPI com header `x-rapidapi-key`, **não** usado aqui.)
- **Env var no projeto:** `APIFOOTBALL_KEY` (lida de `.env` via `odd_analyzer.config.get_required`).

### Envelope de resposta (comum a TODOS os endpoints)

Toda resposta tem o mesmo "envelope":

```json
{
  "get": "fixtures",                          // string: nome do endpoint
  "parameters": { "league": "39", ... },      // object: params ecoados (string) — ou [] se nenhum
  "errors": [],                               // array VAZIO em sucesso; OBJETO {chave:msg} em erro de plano
  "results": 9,                               // int: nº de itens em response
  "paging": { "current": 1, "total": 51 },    // object: paginação (20 itens/página)
  "response": [ ... ]                         // array: payload de fato
}
```

> ⚠️ **`errors` muda de tipo:** é `array []` quando há sucesso, mas vira `object` (ex.:
> `{"plan":"Free plans do not have access to the Last parameter."}`) quando o plano bloqueia
> algo. Trate ambos os tipos ao parsear. Em erro de plano, HTTP ainda é **200** e `response` é `[]`.

---

## Endpoints

| Método | Path | Propósito | Custo / quota |
|--------|------|-----------|---------------|
| GET | `/status` | Conta, plano, uso de requests/limite do dia | 1 request. **Não** conta no limite diário em alguns planos, mas AQUI contou (Free). |
| GET | `/leagues?id={id}` | Metadados da liga + lista de `seasons` com flags de cobertura | 1 request |
| GET | `/fixtures?league={}&season={}&from={}&to={}` | Lista de partidas (ids, times, placar). `fixture.id` é a PK p/ stats | 1 request. ⚠️ param `last`/`next` **bloqueado no Free** |
| GET | `/fixtures/players?fixture={id}` | **CORE.** Estatísticas POR JOGADOR na partida: shots, minutes, tackles, goals | 1 request |
| GET | `/fixtures/statistics?fixture={id}` | **CORE.** Estatísticas POR TIME na partida: Corner Kicks, Total Shots, Shots on Goal | 1 request |
| GET | `/players?league={}&season={}&page={}` | Agregado de jogador na temporada (médias/totais) | 1 request/página. ⚠️ Free **só até page=3** |

### Limites do plano Free (confirmados ao vivo)

- **100 requests/dia** + **10 requests/minuto** (headers abaixo). **Compartilhado** com o usuário.
- Headers de quota em toda resposta:
  - `x-ratelimit-limit: 10` / `x-ratelimit-remaining: 9` → janela por minuto.
  - `x-ratelimit-requests-limit: 100` / `x-ratelimit-requests-remaining: 36` → cota diária.
- `from`/`to` (intervalo de datas) funcionam no Free; `last`/`next` **não** funcionam.
- `/players` paginação travada em **page ≤ 3** no Free (msg de erro exata na seção Anomalias).
- Estouro de minuto → HTTP **429** (espace ~7s entre chamadas).

---

## Exemplos de retorno (reais, capturados ao vivo)

### `GET /status`

```json
{
  "get": "status",
  "parameters": [],
  "errors": [],
  "results": 0,
  "paging": { "current": 1, "total": 1 },
  "response": {
    "account": { "firstname": "Gabriel", "lastname": null, "email": "g***@gmail.com" },
    "subscription": { "plan": "Free", "end": "2027-06-02T00:00:00+00:00", "active": true },
    "requests": { "current": 61, "limit_day": 100 }
  }
}
```
> Note: em `/status`, `response` é um **object** (não array). `requests.current` = usado hoje.

### `GET /leagues?id=39`

```json
{
  "get": "leagues",
  "parameters": { "id": "39" },
  "errors": [],
  "results": 1,
  "paging": { "current": 1, "total": 1 },
  "response": [
    {
      "league": { "id": 39, "name": "Premier League", "type": "League", "logo": "https://media.api-sports.io/football/leagues/39.png" },
      "country": { "name": "England", "code": "GB-ENG", "flag": "https://media.api-sports.io/flags/gb-eng.svg" },
      "seasons": [
        {
          "year": 2023,
          "start": "2023-08-11",
          "end": "2024-05-19",
          "current": false,
          "coverage": {
            "fixtures": { "events": true, "lineups": true, "statistics_fixtures": true, "statistics_players": true },
            "standings": true, "players": true, "top_scorers": true, "top_assists": true,
            "top_cards": true, "injuries": true, "predictions": true, "odds": false
          }
        }
        // ... seasons de 2010 a 2025 (16 itens); só 2014+ tem statistics_fixtures/_players=true
      ]
    }
  ]
}
```
> `coverage.fixtures.statistics_players` indica se `/fixtures/players` tem shots/tackles para aquela época.
> Para PL: `false` até 2013, `true` de 2014 em diante. `odds:false` → **sem odds via este endpoint p/ a PL**.

### `GET /fixtures?league=39&season=2023&from=2023-08-11&to=2023-08-13`

```json
{
  "get": "fixtures",
  "parameters": { "league": "39", "season": "2023", "from": "2023-08-11", "to": "2023-08-13" },
  "errors": [],
  "results": 9,
  "paging": { "current": 1, "total": 1 },
  "response": [
    {
      "fixture": {
        "id": 1035037,
        "referee": "C. Pawson",
        "timezone": "UTC",
        "date": "2023-08-11T19:00:00+00:00",
        "timestamp": 1691780400,
        "periods": { "first": 1691780400, "second": 1691784000 },
        "venue": { "id": 512, "name": "Turf Moor", "city": "Burnley" },
        "status": { "long": "Match Finished", "short": "FT", "elapsed": 90, "extra": null }
      },
      "league": { "id": 39, "name": "Premier League", "country": "England", "season": 2023, "round": "Regular Season - 1", "standings": true },
      "teams": {
        "home": { "id": 44, "name": "Burnley", "logo": "...", "winner": false },
        "away": { "id": 50, "name": "Manchester City", "logo": "...", "winner": true }
      },
      "goals": { "home": 0, "away": 3 },
      "score": {
        "halftime": { "home": 0, "away": 2 },
        "fulltime": { "home": 0, "away": 3 },
        "extratime": { "home": null, "away": null },
        "penalty": { "home": null, "away": null }
      }
    }
    // ... +8 fixtures
  ]
}
```
> `fixture.id` (ex.: **1035037**) é a chave para `/fixtures/players` e `/fixtures/statistics`.
> `teams.home/away.winner` é `bool|null` (null = empate ou jogo não finalizado).
> `goals` é o placar do tempo normal; `score.fulltime` repete; `score.penalty`/`extratime` p/ mata-mata.

### `GET /fixtures/players?fixture=1035037`  ← CORE (shots + minutes + tackles por jogador)

Estrutura: `response[]` → um item **por time**; cada time tem `players[]`; cada player tem
`statistics[0]` (array de 1 elemento).

```json
{
  "get": "fixtures/players",
  "parameters": { "fixture": "1035037" },
  "errors": [],
  "results": 2,
  "paging": { "current": 1, "total": 1 },
  "response": [
    {
      "team": { "id": 50, "name": "Manchester City", "logo": "...", "update": "2024-05-21T04:12:03+00:00" },
      "players": [
        {
          "player": { "id": 44, "name": "Rodri", "photo": "..." },
          "statistics": [
            {
              "games": { "minutes": 90, "number": 16, "position": "M", "rating": "9.3", "captain": false, "substitute": false },
              "offsides": 1,
              "shots":   { "total": 3, "on": 3 },
              "goals":   { "total": 1, "conceded": 0, "assists": 1, "saves": null },
              "passes":  { "total": 110, "key": 1, "accuracy": "107" },
              "tackles": { "total": 5, "blocks": null, "interceptions": null },
              "duels":   { "total": 9, "won": 6 },
              "dribbles":{ "attempts": null, "success": null, "past": null },
              "fouls":   { "drawn": null, "committed": 2 },
              "cards":   { "yellow": 0, "red": 0 },
              "penalty": { "won": null, "commited": null, "scored": 0, "missed": 0, "saved": null }
            }
          ]
        },
        {
          "player": { "id": 323449, "name": "Ameen Al-Dakhil", "photo": "..." },
          "statistics": [
            {
              "games": { "minutes": 90, "number": 28, "position": "D", "rating": "6.3", "captain": false, "substitute": false },
              "shots":   { "total": null, "on": null },
              "tackles": { "total": 2, "blocks": 1, "interceptions": 1 },   // <-- DESARMES: defensor com blocks/interceptions preenchidos
              "goals":   { "total": null, "conceded": 0, "assists": null, "saves": null }
              // ... demais blocos iguais à estrutura acima
            }
          ]
        },
        {
          "player": { "id": 162489, "name": "James Trafford (GK)", "photo": "..." },
          "statistics": [
            {
              "games": { "minutes": 90, "number": 1, "position": "G", "rating": "7.5", "captain": false, "substitute": false },
              "shots":   { "total": null, "on": null },                      // <-- GK: shots NULL
              "goals":   { "total": null, "conceded": 3, "assists": null, "saves": 5 }, // saves preenchido só p/ GK
              "tackles": { "total": null, "blocks": null, "interceptions": null }
            }
          ]
        }
        // ... ~14 jogadores por time
      ]
    }
    // ... response[1] = o outro time
  ]
}
```

> **Caminhos exatos para o modelo (por jogador, na partida):**
> - Shots on target (SOT): `response[].players[].statistics[0].shots.on` → `int | null`
> - Total shots:           `response[].players[].statistics[0].shots.total` → `int | null`
> - Minutos jogados:       `response[].players[].statistics[0].games.minutes` → `int | null`
> - **Desarmes (tackles):** `response[].players[].statistics[0].tackles.total` → `int | null`
> - Bloqueios:             `...tackles.blocks` → `int | null`
> - Interceptações:        `...tackles.interceptions` → `int | null`
> - Gols / assistências:   `...goals.total` / `...goals.assists` → `int | null`
> - Player id:             `response[].players[].player.id` → `int`
> - Team id:               `response[].team.id` → `int`
>
> ⚠️ `null` ≠ `0`. Campo `null` = "sem dado / não se aplica" (ex.: shots de goleiro, tackles de
> quem não desarmou). Para um modelo de contagem, normalmente trate `null` como `0` **só** quando
> o jogador entrou em campo (`games.minutes > 0`). `rating` e `passes.accuracy` vêm como **string**.

### `GET /fixtures/statistics?fixture=1035037`  ← CORE (corners + chutes por TIME)

`response[]` = um item por time; `statistics[]` = lista de pares `{type, value}`.

```json
{
  "get": "fixtures/statistics",
  "parameters": { "fixture": "1035037" },
  "errors": [],
  "results": 2,
  "paging": { "current": 1, "total": 1 },
  "response": [
    {
      "team": { "id": 50, "name": "Manchester City", "logo": "..." },
      "statistics": [
        { "type": "Shots on Goal",    "value": 8 },
        { "type": "Shots off Goal",   "value": 4 },
        { "type": "Total Shots",      "value": 17 },
        { "type": "Blocked Shots",    "value": 5 },
        { "type": "Shots insidebox",  "value": 14 },
        { "type": "Shots outsidebox", "value": 3 },
        { "type": "Fouls",            "value": 8 },
        { "type": "Corner Kicks",     "value": 5 },
        { "type": "Offsides",         "value": 1 },
        { "type": "Ball Possession",  "value": "66%" },
        { "type": "Yellow Cards",     "value": null },
        { "type": "Red Cards",        "value": 0 },
        { "type": "Goalkeeper Saves", "value": 1 },
        { "type": "Total passes",     "value": 706 },
        { "type": "Passes accurate",  "value": 634 },
        { "type": "Passes %",         "value": "90%" },
        { "type": "expected_goals",   "value": "2.08" }
      ]
    }
    // ... response[1] = Burnley (Corner Kicks=6, Total Shots=6, Shots on Goal=1, expected_goals="0.33")
  ]
}
```

> **`type` strings VERBATIM** (use exatamente assim ao filtrar):
> `"Shots on Goal"`, `"Shots off Goal"`, `"Total Shots"`, `"Blocked Shots"`, `"Shots insidebox"`,
> `"Shots outsidebox"`, `"Fouls"`, `"Corner Kicks"`, `"Offsides"`, `"Ball Possession"`,
> `"Yellow Cards"`, `"Red Cards"`, `"Goalkeeper Saves"`, `"Total passes"`, `"Passes accurate"`,
> `"Passes %"`, `"expected_goals"`.
>
> **Mercados MVP — onde vivem:**
> - **Escanteios:** `type == "Corner Kicks"` (por time; some os dois p/ total da partida).
> - **Chutes no alvo (time):** `type == "Shots on Goal"`.
> - **Total de chutes (time):** `type == "Total Shots"`.
> - **xG:** `type == "expected_goals"` (string, ex.: `"2.08"` — fazer `float()`).
>
> ⚠️ `value` é **tipo misto**: `int` (chutes/escanteios), `string` com `%` (`"66%"`, `"90%"`),
> `string` numérica (`expected_goals` = `"2.08"`), ou `null` (ex.: `Yellow Cards` quando 0/sem dado).
> NÃO há `type` para tackles/desarmes agregados de time aqui — desarmes só existem **por jogador**
> em `/fixtures/players`.

### `GET /players?league=39&season=2023&page=1`  (agregado de temporada)

```json
{
  "get": "players",
  "parameters": { "league": "39", "season": "2023", "page": 1 },
  "errors": [],
  "results": 20,
  "paging": { "current": 1, "total": 51 },
  "response": [
    {
      "player": {
        "id": 54, "name": "Diego Costa", "firstname": "Diego", "lastname": "da Silva Costa",
        "age": 37, "birth": { "date": "1988-10-07", "place": "Lagarto", "country": "Brazil" },
        "nationality": "Spain", "height": "188 cm", "weight": "83 kg", "injured": false, "photo": "..."
      },
      "statistics": [
        {
          "team":   { "id": 39, "name": "Wolves", "logo": "..." },
          "league": { "id": 39, "name": "Premier League", "country": "England", "season": 2023 },
          "games":  { "appearences": null, "lineups": null, "minutes": null, "number": null, "position": "Attacker", "rating": null, "captain": false },
          "substitutes": { "in": null, "out": null, "bench": null },
          "shots":   { "total": null, "on": null },
          "goals":   { "total": null, "conceded": null, "assists": null, "saves": null },
          "passes":  { "total": null, "key": null, "accuracy": null },
          "tackles": { "total": null, "blocks": null, "interceptions": null },
          "duels":   { "total": null, "won": null },
          "dribbles":{ "attempts": null, "success": null, "past": null },
          "fouls":   { "drawn": null, "committed": null },
          "cards":   { "yellow": null, "yellowred": null, "red": null },
          "penalty": { "won": null, "commited": null, "scored": null, "missed": null, "saved": null }
        }
      ]
    }
    // ... 20 jogadores/página; paging.total = 51 páginas no servidor, MAS Free só serve page<=3
  ]
}
```

> Estrutura parecida com `/fixtures/players`, porém agregada na temporada e com `games.appearences`,
> `games.lineups`, `substitutes`. Aqui `shots.total`/`shots.on` são **somas da temporada** (úteis para
> priors do modelo de SOT) — quando preenchidos. Os primeiros jogadores da página 1 vieram com tudo
> `null` (jogadores com 0 minutos / não jogaram). `cards` aqui tem campo extra `yellowred` que NÃO
> existe em `/fixtures/players`.

---

## Dicionário de dados

Foco no que o modelo precisa (SOT de jogador, chutes, desarmes, minutos, escanteios, gols, ids).

| Caminho do campo | Tipo | Significado |
|------------------|------|-------------|
| `response[].players[].player.id` | `int` | ID do jogador (chave p/ crosswalk entre fontes) |
| `response[].players[].player.name` | `string` | Nome de exibição |
| `...statistics[0].games.minutes` | `int \| null` | **Minutos jogados** na partida (exposição; null = 0/não jogou) |
| `...statistics[0].games.position` | `string` | Posição: `"G"`,`"D"`,`"M"`,`"F"` (em /fixtures/players) ou `"Attacker"` etc (em /players) |
| `...statistics[0].games.rating` | `string \| null` | Nota da partida (ex.: `"9.3"`) — string, fazer `float()` |
| `...statistics[0].shots.total` | `int \| null` | **Total de chutes** do jogador (mercado total shots player) |
| `...statistics[0].shots.on` | `int \| null` | **Chutes no alvo (SOT)** do jogador — **mercado principal** |
| `...statistics[0].tackles.total` | `int \| null` | **Desarmes** do jogador — **mercado desarmes/tackles** |
| `...statistics[0].tackles.blocks` | `int \| null` | Bloqueios (defesa) |
| `...statistics[0].tackles.interceptions` | `int \| null` | Interceptações |
| `...statistics[0].goals.total` | `int \| null` | Gols marcados |
| `...statistics[0].goals.assists` | `int \| null` | Assistências |
| `...statistics[0].goals.saves` | `int \| null` | Defesas (só goleiro) |
| `...statistics[0].passes.key` | `int \| null` | Passes-chave (criação) |
| `response[].team.id` | `int` | ID do time |
| **TEAM stats** (`/fixtures/statistics`) | | |
| `response[].statistics[] {type,value}` | `array<object>` | Lista de pares tipo/valor por time |
| `type == "Corner Kicks"` → `value` | `int \| null` | **Escanteios** do time — mercado corners |
| `type == "Total Shots"` → `value` | `int \| null` | **Total de chutes** do time |
| `type == "Shots on Goal"` → `value` | `int \| null` | **Chutes no alvo** do time |
| `type == "expected_goals"` → `value` | `string \| null` | xG do time (ex.: `"2.08"`; fazer `float()`) |
| `type == "Ball Possession"` → `value` | `string` | Posse (ex.: `"66%"`; strip `%`) |
| **FIXTURE / resultado** (`/fixtures`) | | |
| `fixture.id` | `int` | **PK da partida** (liga players↔statistics) |
| `fixture.status.short` | `string` | `"FT"`=encerrado, `"NS"`=não iniciado, `"HT"`, `"1H"`, etc |
| `fixture.date` / `fixture.timestamp` | `string(ISO)` / `int` | Kickoff (UTC) / epoch |
| `teams.home.id` / `teams.away.id` | `int` | IDs dos times |
| `teams.home.winner` / `away.winner` | `bool \| null` | Vencedor (null = empate / não finalizado) — **resultado 1X2** |
| `goals.home` / `goals.away` | `int \| null` | **Placar** (tempo normal) — mercado gols/over-under |
| `score.fulltime.{home,away}` | `int \| null` | Placar final |
| `score.halftime.{home,away}` | `int \| null` | Placar do 1º tempo (mercado HT) |
| **ODDS / bookmaker** | | ⚠️ **NÃO** vêm destes endpoints. Ver endpoint dedicado `/odds` (não testado; `coverage.odds=false` p/ PL no Free). Odds/linhas (`point`/`line`) e casas devem vir de The Odds API / SportsGameOdds. |

> **Observação sobre odds/linhas:** nenhum dos endpoints documentados aqui retorna odds de casa de
> aposta nem linhas (`point`/`line`). A API-Football tem `/odds` e `/odds/bookmakers` separados, mas
> `coverage.odds` é `false` para a Premier League e o foco do projeto p/ odds é The Odds API/SGO.
> Use API-Football como fonte de **estatística histórica** (shots, tackles, corners, resultados) para
> treinar/calibrar o modelo, não como fonte de odds.

---

## Anomalias observadas (LIVE)

1. **`errors` muda de tipo.** Sucesso → `errors: []` (array). Erro de plano → `errors: { "plan": "..." }`
   (object). HTTP continua **200** e `response: []`. Parser deve aceitar os dois tipos e checar
   `if errors:` (object truthy / array vazio falsy funciona em Python).

2. **Param `last`/`next` bloqueado no Free.** `GET /fixtures?...&last=2` retornou
   `{"errors":{"plan":"Free plans do not have access to the Last parameter."},"results":0,"response":[]}`.
   **Workaround:** usar `from=YYYY-MM-DD&to=YYYY-MM-DD` (intervalo de datas), que funciona no Free.

3. **`/players` travado em page ≤ 3 no Free.** `GET /players?...&page=4` →
   `{"errors":{"plan":"Free plans are limited to a maximum value of 3 for the Page parameter"}}`.
   Mesmo com `paging.total: 51`, o Free só serve 3 páginas (60 jogadores). Para dataset completo de
   temporada via `/players` é preciso plano pago — ou montar o agregado a partir de `/fixtures/players`
   partida a partida.

4. **Temporadas: `/leagues` mostra até 2025, mas dados são limitados.** O objeto `seasons` de
   `/leagues?id=39` lista 2010→2025 (`2025.current=true`). Porém o **acesso a dados** no Free é
   restrito às temporadas **2022, 2023, 2024** (a metadata da liga não respeita esse limite; os
   endpoints de dados sim). Use season 2022–2024 para puxar fixtures/stats no Free.

5. **`null` ≠ `0` em todo lugar.** Goleiro tem `shots.{total,on}: null`; jogador sem desarme tem
   `tackles.total: null`; jogador com 0 minutos tem o bloco inteiro `null`. Tratar `null` como `0`
   só faz sentido condicionado a `games.minutes > 0`. Em `/players`, os primeiros itens da página 1
   vieram 100% `null` (jogadores que não atuaram na temporada).

6. **Tipos mistos em `value` (team stats) e strings numéricas.** `expected_goals` e `Ball Possession`
   são **string** (`"2.08"`, `"66%"`); `Yellow Cards` veio `null` (não `0`). `rating` e
   `passes.accuracy` (player) também são **string**. Fazer cast explícito antes de calcular.

7. **Sem desarmes agregados por time.** `/fixtures/statistics` não tem `type` para tackles/desarmes.
   O mercado de desarmes depende exclusivamente de `tackles.*` por jogador em `/fixtures/players`.

8. **Sem odds.** Nenhum endpoint aqui devolve odds/casas/linhas; `coverage.odds=false` p/ PL.

9. **Quota é compartilhada e some rápido.** No início desta sessão já havia **61/100** requests usados
   no dia (provável uso prévio do usuário). 7 chamadas desta sessão deixaram **~36/100** restantes.
   Sempre cheque `x-ratelimit-requests-remaining` antes de lotes grandes; espace ~7s (limite 10/min).

10. **`/status` conta no limite diário (no Free).** `requests.current` subiu a cada chamada; não
    assuma que status é "grátis".
