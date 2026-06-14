# Ficha — Betano (`betano.bet.br` / `br.betano.com`)

> **Status:** 🔴 **FORA do v1 automático.** Dificuldade **alta**, **pior troca de esforço** das 4.
> Candidata ao balde "manual fallback" junto da bet365. Reavaliar só se KTO+Betnacional+Superbet não
> bastarem. Ironia: é uma das casas-base do dono hoje (fluxo manual via Chrome).

## Plataforma
**Kaizen Gaming (KGIL)** — sportsbook proprietário in-house (mesma plataforma do Stoiximan). O
trading de player props foi reforçado pela **aquisição da GameplAI (mar/2026)** — micromarkets +
player props como **camada de trading separada e premium**. Sem API pública.

## Por que fica de fora do v1
1. **Geoblock duro** (comprovado): `.bet.br` mostra mensagem de bloqueio para IP não-brasileiro, e a
   regulação 2025 exige geolocalização real **bloqueando VPN/proxy de datacenter**. (Mitiga rodando
   local no BR — mas os outros problemas continuam.)
2. **Anti-bot não-trivial:** **nenhum** scraper público bate o endpoint JSON via `fetch` limpo —
   **todos** (tutorial Betano, arbitragem Stoiximan/Kaizen) usam **Selenium/SeleniumBase UC mode
   (stealth)**, ferramenta usada justamente contra **Cloudflare/Turnstile**. Vendor exato não
   confirmado, mas o padrão indica challenge de browser. Server-side `fetch` puro $0 **não bate**.
3. **Prop de jogador = desconhecido no JSON público.** Vive na camada **GameplAI** separada,
   tipicamente carregada sob demanda por evento e **possivelmente mais protegida**. Os scrapers
   públicos só pegaram **mercado de partida** (1X2) do Brasileirão via DOM.

➡️ Para funcionar, Betano exigiria **navegador headless stealth + (provável) contexto BR** — alta
manutenção, contra o requisito "$0 server-side fetch". **Mantém manual** (o fluxo do Chrome que já
existe) como fallback, igual bet365.

## Se um dia for reavaliada (Fase 0 — só vale o esforço se necessário)
- Capturar no DevTools se o prop (GameplAI) sai em algum XHR JSON ou se é DOM/canvas.
- Medir se um contexto de browser real local (Playwright com perfil persistente, IP BR) consegue ler
  o prop sem Turnstile — só então pensar em adapter.
- **Settlement por mercado** (qual stat Opta — ver STATUS §5).

## Evidências
- https://github.com/hansalemaos/tutorial_raspagem_de_dados_betano (Selenium, DOM, só partida do Brasileirão)
- https://github.com/panagiotisgia/arbitage_betting (Stoiximan = mesma plataforma Kaizen; Selenium, não API)
- https://en.wikipedia.org/wiki/Betano_(company) (Kaizen Gaming, plataforma própria, sem API pública)
- https://igaming.org/sports-news/kaizen-gaming-acquires-gameplai-to-strengthen-betano-sportsbook/ (GameplAI mar/2026 — props como camada separada/premium)
- https://cybernews.com/br/melhores-vpns/vpn-para-apostas-esportivas/ + reclameaqui (geoblock + geolocalização real bloqueando VPN)
- https://www.zenrows.com/blog/selenium-cloudflare-bypass (SeleniumBase UC = padrão anti-Cloudflare/Turnstile)
