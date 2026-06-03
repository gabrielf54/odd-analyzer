# Betfair Exchange API — impacto 6/10 (âncora de de-vig/CLV a $0)

> Pesquisa: workflow 2026-06-02 (docs oficiais + verificação de domínio). Índice: [README.md](README.md).

**Headline:** Betfair é **licenciada no Brasil** (betfair.bet.br, desde jan/2025) e a Exchange é peer-to-peer de **margem ~0** — a melhor referência de **preço justo** p/ de-vig e CLV em mercado de partida. App key **delayed é grátis** (read-only, ~3s). SOT por jogador **NÃO** está na Exchange (só no Sportsbook, API de afiliado).

**Papel:** **âncora de de-vig / Closing Line Value** p/ mercado de partida (1X2/over/escanteio). Como a Exchange quase não tem margem, o preço dela ≈ probabilidade justa — referência ideal p/ validar o de-vig do código e medir CLV sem dinheiro real.

## Tiers
| Tier | Preço | O que dá |
|------|-------|----------|
| Delayed App Key | **$0** | Dados de mercado read-only, atraso ~3s, sem custo mensal. `placeOrders` bloqueado. Suficiente p/ de-vig/CLV offline. |
| Live App Key | **£499 one-off** | Key ao vivo (sem atraso) + apostar via API. Taxa única, debitada da conta. Só p/ operação real. |

Rate limit: weight-based (~200 pontos/request). Exige conta Betfair **com saldo** p/ gerar a key.

**Exchange dá:** match odds (1X2), over/under gols, BTTS, Asian handicap, next goal, correct score, **escanteios, cartões**. Histórico de preços.
**Exchange NÃO dá:** **SOT por jogador** — removido/inexistente na Exchange Grade 1. Mercados de jogador (gol, assist) entraram em trial só na Premier League (mar/2025); SOT vive no **Sportsbook** (Build Ups / Safe Sub, settlement Opta), cuja API é **só p/ afiliado licenciado** — sem feed público.

**Menor tier p/ o produto:** **Delayed key ($0)** p/ de-vig/CLV de mercado de partida. £499 só quando for apostar de verdade.

**Impacto 6/10:** âncora de de-vig de qualidade única a $0 (margem ~0 bate qualquer casa com vig p/ estimar prob justa). Não é maior porque (a) não entrega SOT player prop e (b) key delayed (~3s) e a live custa £499.

## Riscos
- **Não é fonte de prop.** Exchange não carrega SOT; confundir com fonte de SOT desorienta o plano de odds. É âncora de partida, não de prop.
- Key delayed tem atraso ~3s → bom p/ offline/CLV, ruim p/ pegar linha de fechamento exata ao vivo.
- Exige conta funded + £499 p/ uso real (sem atraso / apostar).
- Liquidez da Exchange em jogos/mercados de nicho pode ser fina → preço ruidoso fora de jogos grandes.

## Fontes
- https://developer.betfair.com/
- https://support.developer.betfair.com/hc/en-us/articles/115003864531-Are-there-any-costs-associated-with-API-access
- https://support.developer.betfair.com/hc/en-us/articles/115003886731-Can-I-place-Sportsbook-bets-via-the-API
- https://support.betfair.bet.br/en/app/answers/detail/10531-customer-migration-faqs/
