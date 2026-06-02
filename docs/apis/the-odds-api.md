# The Odds API — impacto 3/10

> Pesquisa: 2026-06-02. Confirmar preço na fonte antes de pagar. Índice: [README.md](README.md).

**Headline:** o mercado `player_shots_on_target` só existe em **6 ligas de clube** via **casas US** (sem Copa, sem bet365/Betano) — útil de graça p/ prototipar de-vig, **não** p/ validar SOT na Copa 2026 em casa BR.

**Papel:** fonte candidata das **odds de SOT por jogador** (insumo 1) para de-vig e cálculo de edge, com tier free de 500 créditos/mês para validação grátis.

## Tiers

| Tier | Preço | Créditos/mês |
|------|-------|--------------|
| Free | $0 | 500 |
| 20K | $30/mês | 20.000 |
| 100K | $59/mês | 100.000 |
| 5M | $119/mês | 5.000.000 |
| 15M | $249/mês | 15.000.000 |

Custo do event-odds = (mercados **retornados**) × (regiões). Histórico ~10×.

**Free dá:** pedir `player_shots_on_target` via endpoint event-odds custa quase nada (cobra só por mercado retornado × região) → testar é barato. Pinnacle (EU) serve como linha "sharp" de referência.
**Free nega (no caso central):** (a) player props de soccer documentados **apenas** em EPL/Ligue 1/Bundesliga/Serie A/La Liga/MLS e **só em casas US**; `soccer_fifa_world_cup` **não** lista player props; (b) bet365 só como "Bet365 AU", Betano inexistente → **nenhuma casa rastreável legal no BR**. Bate com o teste ao vivo (SOT da Copa vazio + bet365 ausente).

**Menor tier para o produto:** **nenhum** resolve o caso central (SOT da Copa em casa BR). Para SOT em **ligas de clube** via casas US, o Free ($0) basta para validar e o 20K ($30) p/ rodar leve.

**Impacto 3/10:** a categoria "odds" é 10/10, mas **esta** API falha onde importa — sem props na Copa (a arena de validação) e zero casa legal no BR. Sobe de 1-2 para 3 só por ser útil/barata p/ prototipar a lógica de de-vig e p/ SOT de clube pós-Copa.

## Riscos
- bet365 só existe como "Bet365 AU"; sem bet365 US/UK/EU nem Betano — sem casa BR p/ apostar/de-vig de SOT.
- Player props de soccer só em 6 ligas de clube via casas US; Copa descoberta p/ SOT.
- Props vêm vazios dias antes (já observado) → poll perto do kickoff gasta créditos repetidos.
- Conflito de fontes sobre Pinnacle (blog diz "No Pinnacle", oficial mostra EU) — confirmar via API key.
- Custo = mercados × regiões; varrer várias casas/jogos drena os 500 free; histórico 10×.
- Listas de casas/mercados mudam sem aviso; "todos os mercados" no marketing não garante SOT num jogo específico.

## Fontes
- https://the-odds-api.com/#get-access
- https://the-odds-api.com/sports-odds-data/betting-markets.html
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
- https://the-odds-api.com/sports/fifa-world-cup-odds.html
- https://the-odds-api.com/liveapi/guides/v4/
