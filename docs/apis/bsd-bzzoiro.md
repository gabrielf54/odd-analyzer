# BSD / Bzzoiro Sports Data — impacto 8/10 (potencial 9, cross-check pendente)

> Pesquisa: workflow 2026-06-02 + **sonda ao vivo 2026-06-02** (key do usuário). Base `https://sports.bzzoiro.com/api/v2`, auth header `Authorization: Token <key>`. Índice: [README.md](README.md).

## Sonda ao vivo (2026-06-02) — passou o sanity

- **Stats (2 jogos finalizados, sanity ok):** Coritiba 3-2 Bahia (id 7155) e Cruzeiro 1-1 Fluminense (id 7166) via `GET /events/{id}/player-stats/`: 46 jogadores/jogo; `shots_on_target`+`total_shots`+`total_tackle`+`minutes_played`+`interception`+`rating` populados; **`total_tackle`=0 (NÃO null) em todos** (mais limpo que API-Football que usa null); minutos somam ~1987/jogo (~990/time ✓); **SOT ≥ gols nos dois** (8≥5, 8≥2 ✓). `GET /events/{id}/lineups/` = `lineup_status:"confirmed"` com formação (4-2-3-1). **Pendente:** cross-check contra fonte independente (API-Football) antes de dinheiro real.
- **WC2026 CONFIRMADA:** `GET /leagues/` → `league_id=27 = "World Cup 2026"` (International), `/events/?league_id=27` → **`count=104` partidas** (seleções reais no grupo: Germany×Côte d'Ivoire, Netherlands×Sweden). Cobre também Brasileirão A (`9`) e B (`34`), USL (`57`), ligas europeias.
- **Odds de partida REAIS** via `GET /events/{id}/odds/` (consensus) e `GET /odds/?event_id=&bookmaker_slug=&market=`: **17 casas** incl. **bet365, betano, pinnacle, consensus, novibet, sportingbet, 1xbet, unibet, bwin**; campos `decimal_odds`+`implied_probability`+`previous_decimal_odds`+`movement`(SHORTENING/DRIFTING)+`is_max_quote`. Mercados: `1x2`, `over_under_{15,25,35}`, `btts`, `total_corners`, `corners_1x2`, `red_card`, `double_chance`, `draw_no_bet`. **Pinnacle disponível = âncora de de-vig de margem baixa** (substitui a Betfair que bloqueia IP BR). `/odds/best/` e `/events/{id}/odds/comparison/` p/ comparar casas.
- **Timing:** odds **populam perto do kickoff** — WC vazio agora (9+ dias), mas `/odds/best/` retornou **81 jogos próximos já com odds hoje, incl. Pinnacle**. Mesmo padrão das outras fontes.
- **Player-prop odds: NÃO existe** (só mercado de partida) — igual a toda fonte barata.
- **Cadeia da Copa ponta-a-ponta VALIDADA:** `/players/?national_team_id={tid}` traz o **pool da seleção + `current_team_id` (clube) de cada jogador JÁ HOJE** (pré-Copa). Ex.: France(485) → Rabiot → clube AC Milan(63) → `/players/1994/stats/` = retrospecto no Milan (shots/SOT/desarmes por jogo). ID-space lineup↔players consistente (Fagner 1878). **Caveat:** `/teams/{nat}/squad/` e lineup de seleção = **vazio pré-Copa** (popula perto do jogo); usar o `national_team_id` até lá. Schema completo dos campos + fluxo de análise em **[../dados-necessarios-analise.md](../dados-necessarios-analise.md)**.

**Headline:** entrega **3 dos 4 insumos num só ID space, grátis** (stats de jogador+time, escalação, odds de partida de bet365/betano/pinnacle p/ de-vig) + WC2026 (104 jogos). Mata o player-matching entre fontes (ponto de falha mais caro). Se a precisão dos números bater com fonte independente, **substitui o API-Football a $0**. Único gap: odd de SOT por jogador (que ninguém entrega barato).

**Papel:** candidato a fonte primária de **stats de jogador + time + escalação** no caminho $0. Concorre direto com o API-Football Pro $19/mês.

## Tiers
| Tier | Preço | Limites |
|------|-------|---------|
| Free | $0 | Sem rate limit documentado; exige registro p/ token de API. Cartão não requerido. |
| Sports Pack | $5/mês | Só esportes **não-futebol** (tênis/esports/dardos) — irrelevante p/ o projeto. |

**Free dá (segundo a doc):** por partida/jogador — `shots_on_target`, `total_shots`, `total_tackle`, `interceptions`, `minutes_played`, gols, assistências, xG/xA, key passes, cartões, saves. Lineups (previsto pré-jogo + confirmado). Shot maps com x/y + xG por chute. Odds de 19+ casas. Escanteios/chutes por time. Endpoints de squad da Copa 2026.
**Free nega:** nada documentado como pago no futebol — todo o futebol é free.

**Menor tier p/ o produto:** **Free ($0)** — se passar no smoke-test.

**Impacto 8/10 (potencial 9):** insumo mais barato possível — 3 dos 4 insumos a $0 no mesmo ID space, sonda ao vivo passou no sanity. Não chega a 9 só porque a **precisão do dado ainda não foi cross-validada** contra fonte independente (provedor indie; risco de revenda/scrape com lacunas silenciosas). Confirmado o cross-check, vira 9 e mata a necessidade do API-Football $19.

## Riscos
- **Proveniência desconhecida — risco #1.** Provedor indie pequeno, sem validação de comunidade em escala de produção. Número errado em silêncio → motor de EV gera sinal lixo com falsa confiança. **Smoke-test obrigatório:** puxar 3-4 jogos finalizados e comparar SOT/desarmes/minutos contra fonte de verdade (StatsBomb / box score conhecido) antes de qualquer sinal ao vivo.
- Casas BR específicas (Betano/KTO) no endpoint de odds **não confirmadas** — verificar após signup.
- Cobertura da Copa 2026 ao vivo depende do provedor popular os dados durante o torneio (mesmo timing-risk do API-Football).
- Sustentabilidade do provedor (pode sair do ar) — não hard-depender; manter API-Football $19 como fallback testado.

## Fontes
- https://sports.bzzoiro.com/docs/v2/
- https://sports.bzzoiro.com/free-football-api/
- https://sports.bzzoiro.com/
