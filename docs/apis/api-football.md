# API-Football — impacto 9/10

> Pesquisa: 2026-06-02. Confirmar preço na fonte antes de pagar. Índice: [README.md](README.md).

**Headline:** entrega stats + escalação (2 dos 4 insumos) num só ID space, mas a temporada da Copa e o `/players` completo só saem do tier **Pro $19/mês**.

**Papel:** fonte primária de **stats de jogador** (chutes/SOT, minutos, jogos) + **escalação/lineups** + contexto do adversário que alimentam o modelo. **Não** fornece odds de player props.

## Tiers

> **Fato-chave (página de pricing, 2026-06-02):** *"All plans include all endpoints and all data
> types with no paywalled features."* Nenhum endpoint é gated por plano. A diferença entre tiers é
> **só (a) requests/dia + (b) profundidade de temporadas históricas**. Pagar NÃO destrava endpoint
> novo — destrava **volume** e **acesso à temporada atual / `season=2026`** (Free fica preso em 2022-2024).

| Tier | Preço/mês | Req/dia | O que muda de fato |
|------|-----------|---------|--------------------|
| Free | $0 | 100 | Só seasons **2022-2024**; `/players` capado na pág. 3; 10 req/min |
| **Pro** | **$19** | **7.500** | **Temporada atual + `season=2026` + `/players` sem cap** |
| Ultra | $29 | 75.000 | Só mais volume |
| Mega | $39 | 150.000 | Só mais volume (≈900 req/min) |

**Free dá:** pipeline modelo+backtest de calibração de graça em ligas de clube 2022-2024 (já rodado: EPL 2023, n~986, over 0.5 Brier 0.173 / over 1.5 Brier 0.066 — sinal real). Mesmo ID space de stats e lineups, sem scraping/403, roda em Python 3.14 só com `requests`.
**Free nega:** temporada da Copa (`season=2026`) e atual (`2025`); varredura de `/players` (cap pág. 3 → contornado com leave-one-out de `/fixtures/players`); volume (100/dia, 10/min).

## Cobertura — sonda ao vivo (2026-06-02, plano Free; metadata da liga não respeita o cap de season)

`GET /leagues?id={id}` devolve as flags `coverage.*` por temporada, mesmo no Free. Verificado:

| Liga (id) | Season | lineups | stats_fixtures | stats_players | players | odds |
|-----------|--------|:-------:|:--------------:|:-------------:|:-------:|:----:|
| World Cup (1) | 2018 | ✅ | ✅ | ✅ | ✅ | ❌ |
| World Cup (1) | 2022 | ✅ | ✅ | ✅ | ✅ | ❌ |
| **World Cup (1)** | **2026** (current) | **❌** | **❌** | **❌** | **❌** | ❌ |
| Premier League (39) | 2025 (current) | ✅ | ✅ | ✅ | ✅ | ❌ |
| La Liga (140) | 2025 | ✅ | ✅ | ✅ | ✅ | ❌ |
| Serie A (135) | 2025 | ✅ | ✅ | ✅ | ✅ | ❌ |
| Bundesliga (78) | 2025 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ligue 1 (61) | 2025 | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Leitura:** Copa 2026 está **tudo False AGORA** porque o torneio começa 11/jun — o gate é **tempo,
> não plano**. 2018 e 2022 estão tudo True; o guia oficial da Copa confirma que `season=2026` terá
> `events/lineups/statistics_fixtures/statistics_players` ligados (104 jogos, 11/jun→19/jul, 48 seleções),
> com a ressalva *"availability may vary from match to match especially early in the tournament"*.
> **A forma dos jogadores vem do clube** (`season=2025`, já 100% coberta), não da seleção — amostra de
> seleção é pequena demais para o modelo de contagem.

**Menor tier para o produto:** **Pro $19/mês** — destrava `season=2026` + lineups ao vivo + `/players` sem cap. Free serve só para validar/backtest em temporadas antigas.

**Impacto 9/10:** insumo quase insubstituível — entrega **2** das 4 entradas num único ID space, eliminando o player-matching (ponto de falha mais caro). Sem equivalente grátis robusto: FBref perdeu o feed Opta (20/jan/2026); scraping (soccerdata/Sofascore/Understat) = 403/ToS comercial/só pós-jogo (não dá lineup pré-jogo). Não é 10 porque a calibração já se faz de graça e o custo de operar ao vivo é baixo ($19).

## Riscos
- Free **não** cobre a temporada da Copa (`season=2026`) nem 2025-26 — operar a Copa ao vivo exige Pro $19/mês (confirmado ao vivo).
- `/players` capado na pág. 3 no free torna a varredura inviável; pivot = leave-one-out de `/fixtures/players` (já feito) ou pagar Pro.
- Lineups da Copa: `coverage.fixtures.lineups=False` antes do torneio; vira `True` ~11/jun, mas só em plano pago p/ `season=2026` — reverificar na largada.
- Janela de escalação apertada (~20-40min pré-jogo); minutos esperados = maior fonte de erro do modelo.
- Definição de SOT pode divergir de Opta/settlement bet365 (risco de viés base-rate vs liquidação).
- **`/odds` é 1X2/totais, não player props** — não confundir, não subir p/ Ultra achando que resolve odds.

## Fontes
- https://www.api-football.com/pricing
- https://www.api-football.com/documentation-v3
- https://www.api-football.com/news/post/how-ratelimit-works
- https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports
- https://www.api-football.com/coverage
