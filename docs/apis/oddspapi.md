# OddsPapi — impacto 4/10 (backup; redundante c/ BSD)

> Pesquisa: workflow 2026-06-02 + **sonda ao vivo 2026-06-02** (key do usuário). Base `https://api.oddspapi.io`, auth query `apiKey=`. Índice: [README.md](README.md).

## Sonda ao vivo (2026-06-02)
- `/v4/sports` → soccer = `sportId=10`. `/v4/bookmakers` → **370 casas**. `/v4/tournaments?sportId=10` → **1702 torneios** de futebol. `/v4/markets` → 32.814 entradas.
- **Sem player prop de futebol** (nenhum mercado de shots/SOT/jogador no catálogo de soccer). Shape dos objetos é trabalhoso (campos não-óbvios).
- **Veredito: redundante.** O **BSD** já entrega odds de partida de **bet365/betano/pinnacle/consensus** (casas BR + âncora de de-vig) no mesmo ID space dos stats. OddsPapi vira **cross-check secundário** — não gastar os 250 req/mo do free nele por ora.

**Headline:** único agregador de odds com **casas LEGAIS no Brasil confirmadas no tier FREE** (betano.bet.br, EstrelaBet, KTO, Betnacional +4), retornando todas as casas num só JSON. Resolve o mínimo do produto (de-vig de **mercado de partida** de casa BR) a **$0**. **Não** resolve odd de SOT por jogador (não confirmado).

**Papel:** fonte de **odds de casa disponível no Brasil** p/ mercado de partida (1X2/over/escanteio) — o nível MÍNIMO que o produto aceita p/ comparar prob do modelo vs de-vig.

## Tiers
| Tier | Preço | Limites |
|------|-------|---------|
| Free | $0 | **250 requests/mês**, sem cartão, todas as 350+ casas e esportes incluídos. 1 request = JSON com todas as casas. |
| Paga | **$49/mês** | REST polling (WebSocket = custom). Modelo per-request. |

**Free dá:** mercados de partida (1X2, O/U, Asian Handicap, BTTS, escanteios, cartões) de 350+ casas globais incl. 8 BR confirmadas (**Betano BR, Betnacional, EstrelaBet, KTO, BetPlay, Blaze, Bpremium, PlayPix**). Pinnacle e Betfair Exchange também no pool. 1.372 torneios de futebol.
**Free nega:** odd de **SOT por jogador** de casa BR **não confirmada** (player props listados como "where available" — testar via request real, **não** contar com isso). 250 req/mo é apertado p/ varredura — priorizar jogos-alvo.

**Menor tier p/ o produto:** **Free ($0)** p/ mercado de partida. $49/mês só se o volume justificar.

**Impacto 7/10:** destrava o insumo de odds de casa BR a $0 p/ o MVP de mercado de partida — sem equivalente grátis com casa BR. Não é maior porque (a) não entrega o mercado ideal (SOT player prop) e (b) cobertura de casa BR é claim de doc, não verificado por chamada ao vivo populando `bookmakers[]`.

## Riscos
- **Claim de doc ≠ dado ao vivo.** Lição do The Odds API (`bookmakers[]` vazio p/ SOT): confirmar Betano BR populado p/ o mercado-alvo com request real antes de tratar como fonte.
- SOT player prop de soccer não confirmado — provável que não exista aqui.
- 250 req/mo no free → gastar em jogos-alvo, cachear agressivo.
- Risco regulatório/geo BR: casa confirmada hoje (KTO/EstrelaBet) pode sair/mudar endpoint — não hard-depender de uma só casa.

## Fontes
- https://oddspapi.io/sportsbooks
- https://oddspapi.io/sportsbooks/betano-bet-br
- https://oddspapi.io/blog/sportsbook-api-350-bookmakers/
- https://oddspapi.io/en/docs
