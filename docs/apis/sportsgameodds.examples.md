# SportsGameOdds (SGO) API v2 — Data Reference

> Documento de referência para a próxima sessão do Claude. Capturas **ao vivo** feitas em
> **2026-06-02** com a chave do tier **gratuito (Amateur)** compartilhada com o usuário.
> Foco: anatomia do `oddID`, como uma prop de **Shots on Target** apareceria, campos de
> odds/preço, e o que o tier gratuito **bloqueia**.

## 1. Cabeçalho

| Item | Valor |
|------|-------|
| API | SportsGameOdds (SGO) API v2 |
| Docs oficiais | https://sportsgameodds.com/docs |
| Base URL | `https://api.sportsgameodds.com/v2` |
| Autenticação | Header HTTP `X-Api-Key: <chave>` (não é query param) |
| Variável de chave | `SGO_API_KEY` (lida de `.env`; **nunca** commitar o valor) |
| Tier testado | Free **Amateur** — 2.500 objetos/mês, 10 req/min, **compartilhado** com o usuário |
| Formato resposta | `{"success": bool, "data": [...]}` em sucesso; `{"success": false, "error": "..."}` em erro |

Exemplo de chamada (use placeholder, **nunca** a chave literal):

```bash
curl -s -H "X-Api-Key: $SGO_API_KEY" \
  "https://api.sportsgameodds.com/v2/events?leagueID=MLS&limit=1"
```

---

## 2. Endpoints

Catálogo (paths confirmados no docs `/docs/endpoints/`; os marcados ✅ foram chamados ao vivo).
SGO cobra por **objeto retornado** (não por request): 1 evento ≈ 1 objeto; listas grandes consomem mais.

| Método | Path | Propósito | Custo / quota |
|--------|------|-----------|---------------|
| GET | `/v2/sports` ✅ | Lista de esportes (SOCCER, BASKETBALL, FOOTBALL, …) | Barato (~1 obj/esporte). Não é gated — retornou todos os 11 esportes. |
| GET | `/v2/leagues` ✅ | Lista de ligas que a **chave realmente desbloqueia** | Barato. Aceita `?sportID=SOCCER`. Retorna só ligas do tier. |
| GET | `/v2/events` ✅ | Eventos/partidas + `odds`, `results`, `teams`, `players`, `status` | **Mais caro** — 1 objeto por evento. Use `limit=1` ao explorar. |
| GET | `/v2/teams` | Metadados de times | Por objeto. |
| GET | `/v2/players` | Metadados de jogadores (mapeia `playerID`) | Por objeto. Útil p/ crosswalk. |
| GET | `/v2/stats` | Catálogo de `statID` (definições de estatísticas) | Barato. |
| GET | `/v2/markets` | Catálogo de mercados/`betTypeID` disponíveis | Barato. |
| GET | `/v2/account/usage` | Uso/quota da conta (objetos consumidos no mês) | Barato — cheque antes de explorar pesado. |

### Query params de `/v2/events` (relevantes)

| Param | Tipo | Significado |
|-------|------|-------------|
| `leagueID` | string | Filtra por liga (ex.: `MLS`, `UEFA_CHAMPIONS_LEAGUE`). Liga fora do tier → **HTTP 400**. |
| `eventID` | string | Busca um evento específico. |
| `type` | string | Tipo de evento (ex.: `match` para futebol). |
| `limit` | int | Limita nº de eventos (use `limit=1` p/ economizar quota). |
| `startsAfter` / `startsBefore` | string (ISO date) | Janela temporal. |
| `oddsAvailable` | bool | Filtra eventos com odds ao vivo/abertas. |
| `cursor` | string | Paginação (resposta inclui `nextCursor` quando há mais páginas). |

---

## 3. Exemplos de retorno (reais, capturados ao vivo)

### 3.1 `GET /v2/sports` — esportes (trecho, SOCCER em destaque)

`hasMeaningfulHomeAway=false` e `prefers3WayMoneyline=true` no futebol (empate existe);
`basePeriods` do futebol são `["1h","2h"]` e `clockType` é `COUNTS_UP`.

```json
{
  "success": true,
  "data": [
    {
      "sportID": "SOCCER",
      "enabled": true,
      "hasMeaningfulHomeAway": false,
      "prefers3WayMoneyline": true,
      "name": "Soccer",
      "shortName": "Soccer",
      "pointWord": { "short": {"singular":"goal","plural":"goals"}, "long": {"singular":"goal","plural":"goals"} },
      "eventWord": { "short": {"singular":"match","plural":"matches"}, "long": {"singular":"match","plural":"matches"} },
      "defaultPopularityScore": 8,
      "clockType": "COUNTS_UP",
      "basePeriods": ["1h", "2h"],
      "extraPeriods": ["ot", "so"],
      "defaultTeamType": "DEFAULT",
      "scheduleDensity": "NEXT_DAY"
    }
    // ... BASKETBALL, HOCKEY, FOOTBALL, BASEBALL, TENNIS, HANDBALL, GOLF, MMA, HORSE_RACING, NON_SPORTS
  ]
}
```

### 3.2 `GET /v2/leagues?sportID=SOCCER` — ligas que o tier free libera

**Só 2 ligas de futebol no free tier:** `MLS` e `UEFA_CHAMPIONS_LEAGUE`.
(O ID da Champions é `UEFA_CHAMPIONS_LEAGUE`, **não** `CL`.)

```json
{
  "success": true,
  "data": [
    {
      "sportID": "SOCCER",
      "leagueID": "MLS",
      "enabled": true,
      "name": "MLS",
      "shortName": "MLS",
      "longName": "Major League Soccer",
      "teamType": "DEFAULT",
      "countryName": "United States",
      "countryCode": "US"
    },
    {
      "sportID": "SOCCER",
      "leagueID": "UEFA_CHAMPIONS_LEAGUE",
      "enabled": true,
      "name": "Champions League",
      "shortName": "UCL",
      "longName": "UEFA Champions League",
      "teamType": "DEFAULT",
      "countryName": null,
      "countryCode": null
    }
  ]
}
```

`GET /v2/leagues` (sem filtro) retornou **8 ligas no total** no tier free:
`["NBA","UEFA_CHAMPIONS_LEAGUE","MLB","MLS","NCAAB","NCAAF","NFL","NHL"]`
— ou seja, ligas majoritárias dos EUA + apenas MLS e UCL no futebol.

### 3.3 `GET /v2/events?leagueID=MLS&limit=1` — objeto de evento (trecho)

Chaves de topo confirmadas ao vivo: `["eventID","sportID","leagueID","type","teams","results","odds","status","players"]`.
Este evento é **histórico/finalizado** (`status.ended=true`), tem **20 odds** (todas de **time**, nenhuma prop de jogador)
e **29 jogadores** em `players`. `byBookmaker` veio **vazio** (`{}`) em todas as odds (evento já encerrado).

```json
{
  "success": true,
  "data": [
    {
      "eventID": "QBi6VJJkQHfOxJeMcsnD",
      "sportID": "SOCCER",
      "leagueID": "MLS",
      "type": "match",
      "teams": {
        "home": {
          "statEntityID": "home",
          "names": { "short": "MIA", "medium": "Inter Miami", "long": "Inter Miami CF" },
          "teamID": "INTER_MIAMI_MLS",
          "colors": { "primary": "#212322", "secondary": "#F6B5CC", "primaryContrast": "#FFFFFF", "secondaryContrast": "#212322" },
          "score": 2
        },
        "away": {
          "statEntityID": "away",
          "score": 0,
          "names": { "short": "SAL", "medium": "Salt Lake", "long": "Real Salt Lake" },
          "teamID": "REAL_SALT_LAKE_MLS",
          "colors": { "primary": "#CC0000", "secondary": "#FFFF00", "primaryContrast": "#FFFFFF", "secondaryContrast": "#CC0000" }
        }
      },
      "status": {
        "hardStart": true, "delayed": false, "cancelled": false,
        "startsAt": "2024-02-22T01:00:00.000Z",
        "started": true, "displayShort": "FT", "displayLong": "Final",
        "ended": true, "completed": true, "live": false, "finalized": true,
        "currentPeriodID": "", "previousPeriodID": "",
        "oddsPresent": true, "oddsAvailable": false,
        "periods": { "started": ["1h","2h","game","reg"], "ended": ["1h","2h","game","reg"] }
      },
      "players": {
        "ANDRES_GOMEZ_1_MLS": {
          "playerID": "ANDRES_GOMEZ_1_MLS",
          "teamID": "REAL_SALT_LAKE_MLS",
          "alias": "ANDRES_GOMEZ_REAL_SALT_LAKE_MLS",
          "firstName": "Andrés", "lastName": "Gómez", "name": "Andrés Gómez"
        }
        // ... 28 outros jogadores, chave = playerID (ex.: DIEGO_LUNA_1_MLS, JULIAN_GRESSEL_1_MLS)
      },
      "results": { /* ver 3.5 */ },
      "odds":    { /* ver 3.4 */ }
    }
  ]
}
```

### 3.4 Objeto `odds` — mercados (trecho)

`odds` é um **objeto** (dict) cuja **chave é o `oddID`**. Todos os 20 oddIDs deste evento usaram
`statID="points"` (= gols no futebol). Tipos de aposta vistos: `ou` (over/under), `ml` (moneyline 3-way),
`sp` (spread/handicap asiático). Odds são **strings em formato americano** (ex.: `"+315"`, `"-1430"`).

```json
{
  "points-all-game-ou-over": {
    "oddID": "points-all-game-ou-over",
    "opposingOddID": "points-all-game-ou-under",
    "marketName": "Over/Under (Full Match)",
    "statID": "points",
    "statEntityID": "all",
    "periodID": "game",
    "betTypeID": "ou",
    "sideID": "over",
    "started": true, "ended": true, "cancelled": false,
    "bookOddsAvailable": false, "fairOddsAvailable": false,
    "fairOdds": "+315",
    "bookOdds": "+296",
    "fairOverUnder": "2.5",
    "bookOverUnder": "2.5",
    "score": 2,
    "scoringSupported": true,
    "byBookmaker": {}
  },
  "points-home-game-ml-home": {
    "oddID": "points-home-game-ml-home",
    "opposingOddID": "points-away-game-ml-away",
    "marketName": "Moneyline (Full Match)",
    "statID": "points", "statEntityID": "home", "periodID": "game",
    "betTypeID": "ml", "sideID": "home",
    "fairOdds": "-1430", "bookOdds": "-68141",
    "score": 2, "scoringSupported": true,
    "byBookmaker": {}
  },
  "points-away-game-sp-away": {
    "oddID": "points-away-game-sp-away",
    "opposingOddID": "points-home-game-sp-home",
    "marketName": "Spread (Full Match)",
    "statID": "points", "statEntityID": "away", "periodID": "game",
    "betTypeID": "sp", "sideID": "away",
    "fairOdds": "+135", "bookOdds": "+124",
    "fairSpread": "+0", "bookSpread": "+0",
    "score": 0, "scoringSupported": true,
    "byBookmaker": {}
  }
  // ... 17 outras odds, todas statID=points (variando statEntityID home/away/all, periodID game/1h, betTypeID ou/ml/sp)
}
```

**`byBookmaker` (forma documentada — veio `{}` neste evento finalizado).** Em eventos com odds ao vivo,
é um dict keyed por `bookmakerID` (`draftkings`, `fanduel`, `betmgm`, …) com a forma aproximada:

```json
"byBookmaker": {
  "draftkings": {
    "odds": "-110",
    "overUnder": "2.5",        // ou "spread" / "line" conforme o betType
    "available": true,
    "lastUpdatedAt": "2026-06-02T20:00:00.000Z",
    "deeplink": "https://..."  // pode existir
    // openOdds/closeOdds, openOverUnder/closeOverUnder com includeOpenCloseOdds=true
  }
}
```

### 3.5 Objeto `results` — estatísticas reais por período/lado (trecho)

`results` é keyed por **`periodID`** (`"1h"`, `"2h"`, `"reg"`, `"game"`), depois por **lado** (`"home"`/`"away"`),
contendo um dict de estatísticas. **`reg`/`game`** trazem só `points` (gols totais do período regular); **`1h`/`2h`**
trazem a **estatística completa** (shots on target, shots, tackles, corners, etc.). É a fonte de verdade para o modelo.

```json
"results": {
  "1h": {
    "home": {
      "points": 1,
      "shots": 9,
      "shots_onGoal": 5,
      "shots_offGoal": 2,
      "shots_insideBox": 4,
      "shots_outsideBox": 5,
      "tackles": 14,
      "cornerKicks": 5,
      "interceptions": 10,
      "clearances": 4,
      "offsides": 2,
      "yellowCards": 0,
      "possessionPercent": 61,
      "passes_attempted": 303,
      "passes_accurate": 258,
      "duels_won": 21,
      "aerials_won": 1,
      "dribbles_attempted": 3,
      "dribbles_won": 1,
      "crosses_attempted": 1,
      "crosses_accurate": 5,
      "longBalls_attempted": 25,
      "longBalls_accurate": 14,
      "freeKicks": 5,
      "throwIns": 6,
      "goalie_saves": 0,
      "goalie_goalKicks": 1,
      "disposessed": 62
    },
    "away": { "points": 0, "shots": 4, "shots_onGoal": 0, "tackles": 6, "cornerKicks": 0 /* ... mesmos campos */ }
  },
  "2h":  { "home": { /* ... */ }, "away": { /* ... */ } },
  "reg": { "home": { "points": 2 }, "away": { "points": 0 } },
  "game":{ "home": { /* ... */ }, "away": { /* ... */ } }
}
```

### 3.6 Tier bloqueado — `GET /v2/events?leagueID=INTERNATIONAL_SOCCER`

Copa do Mundo (`INTERNATIONAL_SOCCER`) está **bloqueada no free tier**. Retorna **HTTP 400**:

```json
{
  "success": false,
  "error": "The leagueID INTERNATIONAL_SOCCER is unavailable at your current subscription tier. Upgrade to unlock"
}
```

---

## 4. Dicionário de dados

Caminhos relativos a um item de `data` (evento), salvo indicado. Tipos verificados ao vivo.

| Field path | Tipo | Significado |
|------------|------|-------------|
| `eventID` | string | ID único do evento (ex.: `"QBi6VJJkQHfOxJeMcsnD"`). |
| `sportID` | string | Esporte (ex.: `"SOCCER"`). |
| `leagueID` | string | Liga (ex.: `"MLS"`, `"UEFA_CHAMPIONS_LEAGUE"`). |
| `type` | string | Tipo de evento (`"match"` no futebol). |
| `teams.home.teamID` / `teams.away.teamID` | string | ID do time (ex.: `"INTER_MIAMI_MLS"`). Use para crosswalk. |
| `teams.home.statEntityID` | string | Sempre `"home"`/`"away"` — liga o time ao `statEntityID` das odds. |
| `teams.{home,away}.names.{short,medium,long}` | string | Nomes do time. |
| `teams.{home,away}.score` | int | Placar final do time. |
| `teams.{home,away}.colors.*` | string (hex) | Cores do time (cosmético). |
| `status.startsAt` | string (ISO 8601) | Início do evento (UTC). |
| `status.started/ended/completed/finalized/live/cancelled/delayed` | bool | Estado do jogo. |
| `status.oddsPresent` | bool | Há odds anexadas ao evento. |
| `status.oddsAvailable` | bool | Odds ainda **abertas/apostáveis** (false em jogo finalizado). |
| `status.periods.started` / `.ended` | array[string] | Períodos iniciados/encerrados (ex.: `["1h","2h","game","reg"]`). |
| `players` | object | Dict keyed por **`playerID`**. |
| `players.<playerID>.playerID` | string | ID do jogador = `NOME_SOBRENOME_NUM_LIGA` (ex.: `"ANDRES_GOMEZ_1_MLS"`). **É o `statEntityID` das player props.** |
| `players.<playerID>.teamID` | string | Time do jogador. |
| `players.<playerID>.alias` | string | Alias alternativo (`NOME_SOBRENOME_TIME_LIGA`). |
| `players.<playerID>.{firstName,lastName,name}` | string | Nome (atenção: mojibake UTF-8 — ver Anomalias). |
| `odds` | object | Dict keyed por **`oddID`**. Cada valor é um objeto de mercado. |
| `odds.<oddID>.oddID` | string | O próprio oddID (ver Anatomia abaixo). |
| `odds.<oddID>.opposingOddID` | string | oddID do lado oposto (over↔under, home↔away). |
| `odds.<oddID>.marketName` | string | Nome legível (ex.: `"Over/Under (Full Match)"`). |
| `odds.<oddID>.statID` | string | Estatística do mercado (`"points"`=gols; ver tabela statID). |
| `odds.<oddID>.statEntityID` | string | A quem se aplica: `"home"`/`"away"`/`"all"` (time) ou um **`playerID`** (prop de jogador). |
| `odds.<oddID>.periodID` | string | Período: `"game"`, `"1h"`, `"2h"`, … |
| `odds.<oddID>.betTypeID` | string | `"ou"` (over/under), `"ml"` (moneyline), `"sp"` (spread/handicap). |
| `odds.<oddID>.sideID` | string | `"over"`/`"under"` (ou), `"home"`/`"away"` (ml/sp), também `"yes"`/`"no"`, `"draw"`. |
| `odds.<oddID>.fairOdds` | string (American) | **Odd de-vig (sem juice)** — base do valor do modelo. Ex.: `"+315"`. |
| `odds.<oddID>.bookOdds` | string (American) | Odd de consenso **com juice**. Ex.: `"+296"`. |
| `odds.<oddID>.fairOverUnder` / `bookOverUnder` | string (decimal) | **Linha/point** do over/under (ex.: `"2.5"`). Só em `betTypeID=ou`. |
| `odds.<oddID>.fairSpread` / `bookSpread` | string | Linha do handicap (ex.: `"+0"`). Só em `betTypeID=sp`. |
| `odds.<oddID>.score` | int \| null | Resultado realizado da estatística desse lado (settle). |
| `odds.<oddID>.scoringSupported` | bool | Se a estatística é liquidável. |
| `odds.<oddID>.bookOddsAvailable` / `fairOddsAvailable` | bool | Se há odd de book/fair disponível agora. |
| `odds.<oddID>.started/ended/cancelled` | bool | Estado do mercado. |
| `odds.<oddID>.byBookmaker` | object | Odds por **`bookmakerID`** (`draftkings`, `fanduel`, …). `{}` em evento finalizado. |
| `odds.<oddID>.byBookmaker.<book>.odds` | string (American) | Odd daquele book. |
| `odds.<oddID>.byBookmaker.<book>.overUnder` / `spread` / `line` | string | Linha daquele book. |
| `odds.<oddID>.byBookmaker.<book>.available` | bool | Se o book tem o mercado aberto. |
| `odds.<oddID>.byBookmaker.<book>.lastUpdatedAt` | string (ISO) | Última atualização. |
| `results.<periodID>.<side>.points` | int | **Gols** do lado nesse período. |
| `results.<periodID>.<side>.shots_onGoal` | int | **Shots on Target (SOT)** — métrica-alvo do modelo. |
| `results.<periodID>.<side>.shots` | int | Total de finalizações. |
| `results.<periodID>.<side>.shots_offGoal` | int | Finalizações para fora. |
| `results.<periodID>.<side>.shots_insideBox` / `shots_outsideBox` | int | Finalizações dentro/fora da área. |
| `results.<periodID>.<side>.tackles` | int | Desarmes (tackles). |
| `results.<periodID>.<side>.cornerKicks` | int | Escanteios (corners). |
| `results.<periodID>.<side>.interceptions` | int | Interceptações. |
| `results.<periodID>.<side>.possessionPercent` | int | Posse de bola (%). |
| `results.<periodID>.<side>.{passes_attempted,passes_accurate}` | int | Passes tentados/certos. |
| `results.<periodID>.<side>.{duels_won,aerials_won,dribbles_won}` | int | Duelos/aéreos/dribles ganhos. |
| `results.<periodID>.<side>.{yellowCards,offsides,clearances,freeKicks,throwIns}` | int | Cartões/impedimentos/cortes/faltas/laterais. |
| `results.<periodID>.<side>.goalie_saves` | int | Defesas do goleiro. |

> **Minutos jogados:** não há campo de minutos no objeto `results` deste evento de time. Minutos por
> jogador (se existirem) viriam em endpoints/props de jogador, não testáveis no free tier (sem player props).

### Anatomia do `oddID`

Formato (5 componentes, separados por `-`):

```
{statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID}
```

Exemplo de **time** (confirmado ao vivo): `points-all-game-ou-over`
→ statID=`points` (gols), entity=`all` (jogo todo), period=`game`, betType=`ou`, side=`over`.

Exemplo de **player prop** (forma documentada — **não disponível no free tier**):
`shots_onGoal-ANDRES_GOMEZ_1_MLS-game-ou-over`
→ statID=`shots_onGoal` (SOT), entity=**playerID**, period=`game`, betType=`ou`, side=`over`.
A linha (ex.: 0.5 / 1.5 SOT) viria em `fairOverUnder`/`bookOverUnder`; a odd em `fairOdds`/`bookOdds`.

| Componente | Valores vistos / esperados |
|------------|----------------------------|
| `statID` | `points` (= gols, visto ao vivo). Para props: `shots_onGoal` (SOT), `shots`, `tackles`, `cornerKicks`, `assists`, `goals`. Os nomes batem com as chaves de `results`. Confirme nomes exatos via `GET /v2/stats`. |
| `statEntityID` | `home`, `away`, `all` (time/jogo); ou um **`playerID`** (`ANDRES_GOMEZ_1_MLS`) para prop de jogador. |
| `periodID` | `game` (jogo todo), `1h`, `2h` (futebol); `reg` aparece em `results`. |
| `betTypeID` | `ou` (over/under), `ml` (moneyline 3-way no futebol), `sp` (spread/handicap). |
| `sideID` | `over`, `under`, `home`, `away`; também `yes`/`no`, `draw` em alguns mercados. |

> **statID para Shots on Target:** a chave de resultado é **`shots_onGoal`**. A prop de SOT, quando
> existir num tier pago, deve usar `statID=shots_onGoal` com `statEntityID=<playerID>`. Total de
> finalizações = `shots`; desarmes = `tackles`; escanteios = `cornerKicks`; gols = `points`/`goals`.
> Valide os nomes exatos de statID para props em `GET /v2/stats` antes de montar oddIDs.

---

## 5. Anomalias observadas

- **World Cup bloqueado (confirmado ao vivo):** `leagueID=INTERNATIONAL_SOCCER` → **HTTP 400** com
  `{"success":false,"error":"The leagueID INTERNATIONAL_SOCCER is unavailable at your current subscription tier. Upgrade to unlock"}`.
  Inviável validar com a Copa 2026 no free tier — precisa de upgrade.
- **Só 2 ligas de futebol no free tier:** `MLS` e `UEFA_CHAMPIONS_LEAGUE`. Total geral = 8 ligas
  (resto são US majors: NBA, MLB, NHL, NCAAB, NCAAF, NFL). Confirma a suspeita prévia.
- **Sem player props no free tier:** o evento MLS retornou **20 odds, todas `statID=points` e de time**
  (home/away/all), nenhuma com `statEntityID=<playerID>`. Não dá para validar o modelo de SOT por
  jogador sem upgrade — só dá para inspecionar `results.<period>.<side>.shots_onGoal` (estatística de **time**).
- **`byBookmaker` vazio em evento finalizado:** todas as 20 odds tinham `"byBookmaker": {}` e
  `status.oddsAvailable=false`. Odds por casa só aparecem em eventos com mercado aberto; teste com
  `oddsAvailable=true` (gasta mais quota) para ver a forma real preenchida.
- **Odds são strings americanas, não números:** `fairOdds`/`bookOdds` vêm como `"+315"`, `"-1430"`.
  Linhas (`fairOverUnder`, `fairSpread`) também são strings (`"2.5"`, `"+0"`). Parsear para float no código.
- **Outliers em `bookOdds`:** vi `"bookOdds":"-68141"` (Inter Miami ML), valor extremo provável de
  evento histórico/conssenso degenerado. Trate odds com magnitude absurda como ruído.
- **`results` assimétrico por período:** `reg` e `game` trazem campos reduzidos (`reg` só `points`);
  a estatística completa (shots_onGoal, tackles, corners…) está em `1h` e `2h`. Para SOT do jogo inteiro,
  **some 1h + 2h** (ou use `game` se preencher — neste evento `game` existia mas confirme campo a campo).
- **Mojibake nos nomes:** `firstName`/`name` vieram com dupla-codificação UTF-8 (ex.: `"AndrÃ©s"`
  = "Andrés" mal codificado → "AndrÃ©s"). Normalizar (latin-1→utf-8) ao mapear nomes; prefira `playerID` como chave estável.
- **Sem campo de minutos jogados** no objeto de time; minutos por jogador dependeriam de player stats
  (indisponíveis no free tier).
- **Sem headers de rate-limit:** as respostas **não** trouxeram `X-RateLimit-*`. Para monitorar quota,
  use `GET /v2/account/usage` explicitamente — não dá para inferir pelos headers.
- **`/v2/sports` e `/v2/leagues` não são gated** (200 OK), mas `/v2/events` de liga fora do tier é 400.
  Erros de permissão vêm como **400** (não 401/403) com `success:false`.
