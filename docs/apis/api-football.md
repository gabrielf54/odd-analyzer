# API-Football — impacto 9/10

> Pesquisa: 2026-06-02. Confirmar preço na fonte antes de pagar. Índice: [README.md](README.md).

**Headline:** entrega stats + escalação (2 dos 4 insumos) num só ID space, mas a temporada da Copa e o `/players` completo só saem do tier **Pro $19/mês**.

**Papel:** fonte primária de **stats de jogador** (chutes/SOT, minutos, jogos) + **escalação/lineups** + contexto do adversário que alimentam o modelo. **Não** fornece odds de player props.

## Tiers

| Tier | Preço | Destrava (relevante) | Limites |
|------|-------|----------------------|---------|
| Free | $0 | Todos os endpoints, mas **só seasons 2022-2024** | 100 req/dia, 10/min, `/players` capado na pág. 3 |
| **Pro** | **$19/mês** | **Temporada atual + Copa (`season=2026`) + lineups ao vivo + `/players` completo** | 7.500 req/dia |
| Ultra | $39/mês | + 75k req/dia + `/odds` (1X2/totais, **não** props) | 75k/dia |
| Mega | $99/mês | + 150k req/dia + "player stats deep dive" | 900/min |

**Free dá:** pipeline modelo+backtest de calibração de graça em ligas de clube 2022-2024 (já rodado: EPL 2023, n~986, over 0.5 Brier 0.173 / over 1.5 Brier 0.066 — sinal real). Mesmo ID space de stats e lineups, sem scraping/403, roda em Python 3.14 só com `requests`.
**Free nega:** temporada da Copa (`season=2026`) e atual; varredura de `/players` (cap pág. 3 → contornado com leave-one-out de `/fixtures/players`); volume (100/dia, 10/min).

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
