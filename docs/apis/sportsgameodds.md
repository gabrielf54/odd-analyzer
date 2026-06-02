# SportsGameOdds (SGO) — impacto 8/10

> Pesquisa: 2026-06-02. Confirmar preço na fonte antes de pagar. Índice: [README.md](README.md).

**Headline:** fornece SOT da **bet365** (casa legal no BR) só no tier **Pro $299/mês** — essencial para apostar de verdade, dispensável para validar o modelo de graça.

**Papel:** única fonte por API confirmada de **odds de SOT por jogador da bet365** + International Soccer/Copa + player props juntos. É o insumo (1) "odd da casa rastreável" — o alvo do produto (edge = modelo vs odd de-vig da casa onde se aposta).

## Tiers

| Tier | Preço | Destrava (relevante) | Limites |
|------|-------|----------------------|---------|
| Amateur | Free | Props só de **9 casas US**, **sem bet365**, **sem Copa** | 2.5k objs/mês, atraso ~10min |
| Rookie | ~$99/mês¹ | + Copa + 77 casas, **mas ainda sem bet365** | 100k objs/mês, atraso ~3min |
| **Pro** | **$299/mês**² | **bet365 + Pinnacle + props + Copa + histórico** | objs ilimitados, sub-minuto |
| All-Star | Custom | + Betano/Superbet/KTO + WebSocket | ilimitado |

¹ Anual; m2m citado ~$149/mês em blogs (não confirmado). ² "Best Value"; anual "save up to 40%" (valor exato não publicado).

**Free dá:** chave válida, metadados, player props como tipo de mercado, odds de jogo (ML/total) de 9 casas US com 10min de atraso.
**Free nega (tudo que importa):** bet365, International Soccer/Copa 2026 (bloqueado, "upgrade to unlock" — confirmado ao vivo), e as ligas free atuais (MLS/Champions) estão em intervalo em jun/2026 → zero SOT observável agora.

**Menor tier para o produto:** **Pro $299/mês** — primeiro que junta bet365 + International Soccer + player props. Rookie ($99) traz a Copa mas **não** bet365.

**Impacto 8/10:** a tese inteira é achar EV na linha de SOT de uma casa legal no BR, e SGO Pro é o único caminho por API confirmado para a bet365 com props na Copa. Não é 10 porque: (a) o modelo se valida/calibra de graça sem ela (API-Football + de-vig de casas US) → essencial p/ **apostar**, não p/ provar a tese; (b) Pinnacle (tb legal no BR) é backup parcial, mas tb só no Pro; (c) custo alto p/ uso pessoal.

## Riscos
- bet365 está fora do Free **e** do Rookie; só destrava no Pro $299/mês — barreira de custo alta p/ uso pessoal.
- "World Cup" não é nomeado no pricing; cai sob International Soccer — **confirmar via API key que a Copa 2026 é coberta com `statID=shots_on_target` da bet365 antes de pagar $299**.
- Props da Copa podem só aparecer perto do kickoff (vazio 9 dias antes no teste ao vivo).
- Billing por "object" (item top-level): varrer muitos jogos/casas consome cota; Pro é ilimitado, Rookie 100k/mês.
- Atraso de dados (Free 10min, Rookie 3min) corrói CLV/edge; só Pro (sub-minuto) serve p/ caça a valor.
- Preços m2m vs anual divergem entre fontes — usar números da página oficial atual.
- Definição de SOT da SGO/bet365 pode diferir da base-rate (API-Football) → risco de mismatch de settlement.

## Estratégia de assinatura (uso pessoal)
Assinar **mensal pontual** em janelas de jogos-alvo e cancelar entre elas, em vez de anual fixo, até o volume de apostas justificar os $299/mês contínuos.

## Fontes
- https://sportsgameodds.com/pricing
- https://sportsgameodds.com/docs/data-types/bookmakers
- https://sportsgameodds.com/bookmakers/
- https://sportsgameodds.com/docs/data-types/markets
- https://sportsgameodds.com/blog/comparing-bet365-odds-api-providers
