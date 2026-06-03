# Dados necessários para a análise (spec vivo) — fonte BSD

> **Propósito:** mapear EXATAMENTE quais dados a análise precisa, de onde vêm, como agregar, e o que
> entra no **prompt da IA** — para depois comparar com **odds** e achar valor (EV). Documento que
> **cresce** conforme novas necessidades de dado aparecem.
>
> **Fonte:** BSD / Bzzoiro (validado ao vivo + conferido manualmente no SofaScore em 2026-06-02 — dado
> real e preciso). Ficha técnica: [apis/bsd-bzzoiro.md](apis/bsd-bzzoiro.md). Doutrina do produto: ver
> CLAUDE.md ("Produto — o que é e como pensa").
>
> Base `https://sports.bzzoiro.com/api/v2` · auth header `Authorization: Token <BZZOIRO_API_KEY>` (no `.env`).

---

## 1. Princípio — o que a análise calcula

Para cada (jogador OU time, mercado, linha):

```
μ_base(quem PRODUZ a ação)  ×  multiplicador_concessão(adversário no MESMO eixo)
   → P(evento ≥ k)  [modelo de contagem NB2/Poisson no código]
   → compara com odd de-vig da casa  → edge/EV  → filtro rígido  → IA EXPLICA (não inventa número)
```

Nunca filtra por "prob alta" (favorito = −EV). Filtra por **EV/edge positivo**. A IA entra só no fim.

---

## 2. Schema dos dados por jogador (POR JOGO) — `/players/{id}/stats/` e `/events/{id}/player-stats/`

Cada linha = desempenho de 1 jogador em 1 partida. Campos reais capturados ao vivo:

| Campo | Tipo | Significado | Usado em |
|-------|------|-------------|----------|
| `player_id` | int | ID do jogador (chave; mesmo ID space do lineup) | join |
| `event_id` | int | ID da partida (→ `/events/{id}/` p/ data/adversário) | join/contexto |
| `team_id` | int | **Clube** em que jogou aquela partida | filtro de forma de clube |
| `minutes_played` | int | **Minutos** (exposição; base do rate por 90) | TODOS |
| `total_shots` | int | **Finalizações totais** | mercado **finalizações** |
| `shots_on_target` | int | **Chutes no alvo (SOT)** | mercado **SOT** (principal) |
| `total_tackle` | int | **Desarmes** (0 = 0, não null) | mercado **desarmes** |
| `won_tackle` | int | Desarmes ganhos | qualidade do desarme |
| `interception` | int | Interceptações | volume defensivo |
| `total_clearance` | int | Cortes | volume defensivo |
| `key_pass` | int | Passes decisivos | criação / matchup ofensivo |
| `total_cross` / `accurate_cross` | int | **Cruzamentos** | **escanteios** + matchup direcional |
| `aerial_won` / `aerial_lost` | int | Duelos aéreos | escanteios (bola parada), matchup |
| `duel_won` / `duel_lost` | int | Duelos no chão | intensidade/posição |
| `expected_goals` / `expected_assists` | float\|null | xG / xA do jogador na partida | sinal de qualidade (não settle) |
| `goals` / `goal_assist` | int | Gols / assistências | mercado gols, validação |
| `rating` | float | Nota da partida | contexto |
| `was_fouled` / `fouls` | int | Faltas sofridas/cometidas | mercado cartões (futuro) |
| `yellow_card` / `red_card` | int | Cartões | mercado cartões (futuro) |
| `saves` / `goals_conceded` / `punches` | int | Goleiro | filtro de goleiro |

> ⚠️ A linha de stats traz `event_id` + `team_id` mas **não** traz data/liga direto. Para data/adversário,
> fazer lookup `event_id → /events/{id}/`. Para forma "de clube na temporada", filtrar por `team_id` (clube)
> e/ou usar params `season_id`/`league_id`/`date_from`/`date_to` do endpoint.

### Agregação para μ_base (taxa por 90)
```
rate_SOT      = Σ shots_on_target / Σ minutes_played × 90   (sobre os últimos N jogos de CLUBE)
rate_shots    = Σ total_shots     / Σ minutes_played × 90
rate_tackles  = Σ total_tackle    / Σ minutes_played × 90
```
Aplicar shrinkage (prior) p/ amostra pequena. Amostra-alvo ≥10 jogos (doutrina). **Forma vem do CLUBE**,
não da seleção (seleção tem 2-7 jogos = ruído).

---

## 3. Schema por TIME (por jogo) — `/events/{id}/stats/`

| Campo | Significado | Usado em |
|-------|-------------|----------|
| `total_shots` | Chutes do time | mercado chutes do time; concessão |
| `shots_on_target` (Shots on Goal) | Chutes no alvo do time | concessão de SOT |
| **`Corner Kicks` / corners** | **Escanteios do time** | mercado **escanteios** |
| `ball_possession` | Posse (%) | contexto/estilo |
| `xg` (`xg.actual`) | xG do time | modelo de gols |
| `crosses`, `dribbles`, `long_balls`, `attack`, `dangerous_attack` | Estilo de jogo | matchup |
| `shotmap[]`, `xg_per_minute[]`, `momentum[]` | Eventos com coordenada/tempo | **direcional/zonal** (parcial) |

---

## 4. Schema do jogador (cadastro) — `/players/{id}/`

| Campo | Uso |
|-------|-----|
| `current_team_id` | **Clube atual** (chave seleção→clube) |
| `national_team_id` | Seleção (chave clube→seleção) |
| `position` / `specific_position` | Posição (ex.: `D`/`CB`) → filtro de mercado por posição |
| `preferred_foot` | Pé preferido → matchup direcional (lado) |
| `date_of_birth`, `height_cm` | Idade/altura (jogo aéreo) |
| `market_value_eur` | Proxy de qualidade/titularidade |
| `contract_until`, `availability` | Disponibilidade (minutos esperados) |

E `/players/{id}/career/` → `seasons[] {season_id, league_id, team_id, matches, minutes, goals, assists, avg_rating}` (separa clube vs seleção; prior de temporada).

---

## 5. Mapa de endpoints (BSD)

| Necessidade | Endpoint | Notas |
|-------------|----------|-------|
| Jogos da Copa | `/events/?league_id=27&season_id=&date_from=&to=` | 104 jogos; `status` (finished/notstarted) |
| **Pool da seleção** (jogadores+clube) | `/players/?national_team_id={tid}` | **funciona pré-Copa** (squad/lineup ainda não) |
| Cadastro/clube do jogador | `/players/{id}/` | tem `current_team_id` |
| **Retrospecto por jogo** | `/players/{id}/stats/?league_id=&season_id=&date_from=&to=&limit=` | newest-first; forma de clube |
| Agregado por temporada | `/players/{id}/career/` | priors |
| **XI confirmado** | `/events/{id}/lineups/` | `confirmed` ~1h antes; `predicted` com `ai_score` antes |
| Stats do time na partida | `/events/{id}/stats/` | escanteios, chutes, xG |
| Stats de todos por partida | `/events/{id}/player-stats/` | base p/ concessão do adversário |
| **Odds de partida (de-vig)** | `/events/{id}/odds/` (consensus) · `/odds/?event_id=&bookmaker_slug=pinnacle&market=` | 1x2, over_under, btts, total_corners, corners_1x2, red_card |
| Comparar casas | `/events/{id}/odds/comparison/` · `/odds/best/` | bet365, betano, pinnacle, consensus… |
| Elenco do clube | `/teams/{id}/squad/` | (clube ok; seleção vazio pré-Copa) |

---

## 6. Fluxo ponta-a-ponta da Copa (validado ao vivo)

```
1. Jogo: /events/?league_id=27  → ex.: France(485) x Iraq(933), event_id
2. Pool: /players/?national_team_id=485 e =933  → jogadores + current_team_id (clube)
3. (perto do kickoff) /events/{id}/lineups/  → filtra pro XI confirmado
4. Forma: p/ cada jogador, /players/{id}/stats/  no clube  → μ_base (SOT/finalizações/desarmes por 90)
5. Concessão do adversário (MESMO eixo): agrega /events/{id}/player-stats/ + /events/{id}/stats/
   dos jogos do adversário  → multiplicador (ex.: lateral-direito do adv desarma muito → over desarmes)
6. Modelo (código): μ_base × concessão → NB2 → P(over k)
7. De-vig: /events/{id}/odds/ (Pinnacle/bet365/betano)  → prob justa  → edge/EV  [SÓ mercado de partida]
8. Filtro rígido (edge≥0.04, EV≥0.05, amostra≥10)  → IA explica o confronto
```

**Exemplo real capturado:** Rabiot (França) → clube AC Milan (63) → `/players/1994/stats/`: jogos de 90min
com 4/0, 1/1, 4/0 (chutes/SOT) e 1-4 desarmes → base p/ modelar SOT/desarmes dele num jogo da Copa.

---

## 7. Receita de dado por mercado MVP

| Mercado | Produção (μ_base) | Concessão (adversário) | Odd p/ de-vig |
|---------|-------------------|------------------------|---------------|
| **SOT (jogador)** | `shots_on_target`/90 do jogador (clube) | SOT concedido pelo time adversário | ❌ prop (coletar à mão) |
| **Finalizações (jogador)** | `total_shots`/90 | chutes concedidos pelo adv | ❌ prop |
| **Desarmes (jogador)** | `total_tackle`/90 + posição | volume ofensivo do adv no lado do defensor (`total_cross`, ataque por lado) | ❌ prop |
| **Gols (partida)** | xG/gols do time × força | gols/xG concedidos | ✅ `over_under_*` |
| **Vitória (1X2)** | Poisson de gols → 1X2 | — | ✅ `1x2` (Pinnacle/bet365/betano) |
| **Escanteios** | `Corner Kicks`/jogo do time + cruzamentos | escanteios concedidos pelo adv | ✅ `total_corners`, `corners_1x2` |

**3 de 6 (partida) = de-vig disponível no BSD → EV ponta-a-ponta a $0.** 3 de 6 (jogador) = modela a prob,
mas **odd de prop não existe barato** → modelo-only ou coleta manual (betano.bet.br/bet365).

---

## 8. Inteligência de matchup (oferta × concessão) — dois níveis

- **Por-mercado (já viável):** μ_base(produz) × (concessão do adversário no mercado / média da liga). Dados:
  retrospecto do jogador/time + agregado dos jogos do adversário (`/events/{id}/player-stats/` + `/stats/`).
- **Direcional/zonal (parcial no BSD):** `total_cross`/`accurate_cross` por jogador (lado de ataque),
  `preferred_foot`/`specific_position` (lado do defensor), `shotmap[]` com coordenadas por partida. Permite
  inferir "Time A ataca pela esquerda × lateral-direito do Time B desarma muito → over desarmes do lateral".
  **Não** há feed de evento x/y por desarme (só shotmap de finalização) → direcional fica **aproximado**.

---

## 9. O que entra no PROMPT da IA (candidato estruturado)

A IA recebe um objeto pronto (números vêm do código) e só **aplica o filtro + explica o confronto**:

```json
{
  "jogo": "France x Iraq", "data": "2026-06-22",
  "alvo": "Rabiot", "clube": "AC Milan", "posicao": "M",
  "mercado": "desarmes", "linha": 1.5,
  "mu_base": 2.1, "amostra_jogos": 14, "minutos_esperados": 80,
  "matchup": { "eixo": "meio-campo central", "concessao_adv": 1.18,
               "motivo": "Iraq concede muitos desarmes ao meio adversário (volume de posse do rival)" },
  "p_modelo": 0.61, "p_devig": null, "edge": null, "ev": null,
  "odds": { "fonte": "sem prop (coletar a mao)", "linha_casa": null }
}
```
Para mercados de partida, `p_devig`/`edge`/`ev` vêm preenchidos (odd do BSD/Pinnacle). A IA escreve a
narrativa do confronto (produção × vulnerabilidade) — **nunca recalcula a probabilidade**.

---

## 10. Comparação com odds

- **Mercado de partida (gols/vitória/escanteios):** BSD `/events/{id}/odds/` + `/odds/?bookmaker_slug=pinnacle`
  → de-vig (power/multiplicativo) → `p_modelo` vs `p_justa` → edge/EV. **Pinnacle = âncora de margem baixa.**
  Odds **populam perto do kickoff** (vazio a 9+ dias).
- **Mercado de jogador (SOT/finalizações/desarmes):** **sem fonte de odd de prop barata** (confirmado: nenhuma
  API < $99/mês com casa BR). Caminho: modelar a prob agora; coletar a linha à mão de betano.bet.br/bet365 p/
  os candidatos fortes, ou validar o motor primeiro nos mercados de partida (CLV) antes de props.

---

## 11. Status de validação (2026-06-02, ao vivo)

| Item | Status |
|------|--------|
| Dado de jogador real e preciso | ✅ conferido manualmente no SofaScore (3 jogos Brasileirão) |
| ID-space lineup ↔ players | ✅ consistente (Fagner 1878) |
| Jogos da Copa (104) com seleções | ✅ |
| Seleção → pool de jogadores + clube (`national_team_id`) | ✅ (funciona pré-Copa) |
| Jogador → retrospecto no clube (`/players/{id}/stats/`) | ✅ (Rabiot → AC Milan) |
| Odds de partida (Pinnacle/bet365/betano) | ✅ (populam perto do kickoff) |
| Elenco/XI de seleção | ⏳ vazio pré-Copa; popula perto do jogo |
| Odd de prop de jogador (SOT) | ❌ não existe barato (coletar à mão) |
| Cross-validação automática vs 2ª fonte (API-Football) | ⏳ opcional, não feito |

---

## 12. Refinamentos validados (ideia do usuário, 2026-06-02)

### Regras de fluxo — NÃO violar
- **O EDGE seleciona o mercado, não o nível do stat.** Modelar a prob de TODOS os candidatos → de-vig de
  TODAS as odds → EV decide. Escolher mercado porque "o stat está alto" = escolher favorito = −EV (proibido).
- **Código decide o veredito (EV); a IA explica.** A IA recebe o candidato já filtrado; nunca recalcula o número.

### Agregação temporal (janelas + casa/fora)
Para time e jogador, agregar o retrospecto em **janelas de 3 / 5 / 10 jogos** e por **mando (casa/fora)**:
```
rate_janela(N, mando) = Σ stat[últimos N jogos no mando] / Σ minutos × 90   (jogador)
                      = média por jogo[últimos N no mando]                  (time)
```
- 3 jogos = recência (alta variância) · 10 = estabilidade. **Blend ponderado + shrinkage** (não tratar "últimos 3"
  como verdade). Mando importa (casa ≈ +10% / fora ≈ −10%, medir no dado).
- Fallback de escalação: se lineup não postado, usar **quem jogou os últimos 3 jogos** como XI provável.

### Variáveis de contexto (BSD `/events/{id}/` — OURO p/ Copa)
| Campo | Uso |
|-------|-----|
| `weather` (`temperature_c`, `wind_speed`) | calor nas sedes quentes → menos volume/intensidade |
| `travel_distance_km` | desgaste de viagem (EUA/México/Canadá) |
| `is_neutral_ground` | sem vantagem real de mando (Copa) |
| `pitch_condition`, `attendance`, `is_local_derby` | contexto de jogo |
| `referee_id` (+ `/referees/`) | rigor do árbitro → mercado de cartões (futuro) |
| (derivar de `venue.city`) | altitude (Cidade do México) |

### Movimento de linha / CLV (BSD odds)
`/odds/?event_id=&market=` traz `decimal_odds` + `previous_decimal_odds` + `movement` (SHORTENING/DRIFTING) +
`updated_at`. Usar para: (a) **CLV** (comparar nossa entrada vs linha de fechamento) — validação antes de dinheiro
real; (b) detectar pra onde o dinheiro sharp moveu (Pinnacle como referência).

### Insumos extras priorizados
1. **Concessão do adversário (matchup)** — metade do sinal; sem isso não há confronto. Por mercado: quanto o
   adversário PERMITE no mesmo eixo (SOT/chutes/desarmes/escanteios concedidos vs média da liga).
2. **xG/xGA** (`expected_goals`) no lugar de gol cru — menos ruído.
3. **Minutos esperados / `availability` / `ai_score`** do lineup — prop de jogador depende disso.
4. **Força/Elo** como prior (cold-start: encolher forte cedo).
