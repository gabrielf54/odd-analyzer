# Ficha — Superbet (`superbet.bet.br`)

> **Status:** 🟠 **2ª ONDA** (depois de KTO + Betnacional). Dificuldade **alta**, mas **viável**.
> O gateway principal tem WAF/geoblock; os hosts de odds reais (Fastly) são limpos.

## Plataforma
**Própria**, desenvolvida in-house pela divisão "Happening" (codinome de infra: **"Betler"**). Mesmo
codebase compartilhado entre `superbet.bet.br/.ro/.pl/.rs/.bg/.gr`. Front = micro-frontends **Vue +
module federation**; a federação `sportOffer` tem submódulos `bet-builder`, `markets`,
`eventDetailsPage` e **`playerFocusedExperience`** (prop de jogador). **Não** é white-label.

## Endpoint (config viva extraída; path de odds a capturar)
Da config em `https://superbet.bet.br/static/js/fetchConfig/app`:
```
offerServer            = https://production-superbet-offer-br.freetls.fastly.net     # Fastly, CORS aberto, SEM WAF
offerPresentation      = https://offer-presentation-production.global.ssl.fastly.net/
betBuilderStreaming    = https://production-superbet-bmb.freetls.fastly.net/betbuilder
socketIo               = https://offer-server.trading.superbet.bet.br/sb-basic/api    # in-play
awsWafDomain           = api.web.production.betler.superbet.bet.br                     # api-gw: CloudFront + AWS WAF (sa-east-1)
```

- **Dois caminhos:** (1) o `api-gw` (`api.web.production.betler...`) está atrás de **CloudFront + AWS
  WAF** e devolveu **403 "Request blocked"** para IP fora do BR (geoblock no edge). (2) Os **hosts de
  odds reais (Fastly)** respondem 200/404 limpos, **CORS aberto, SEM challenge WAF** — é por aí que
  se raspa.
- **Player props quase certamente existem** (federação `playerFocusedExperience`:
  `OfferPlayerCards`/`PlayerViewContainer`/`BetBuilderPlayerCards`), provavelmente sob demanda por
  evento, podendo passar pelo `bet-builder` host (que pode ser mais protegido).

## ⏳ Fase 0 (o que o DONO precisa capturar no DevTools de `superbet.bet.br`)
1. O **path exato** no host Fastly (`production-superbet-offer-br...`) que devolve os mercados de um
   jogo — não dá pra adivinhar às cegas; sai do HAR/DevTools logado-deslogado em ~5 min.
2. A request específica de **prop de jogador** (federação `playerFocusedExperience` / `bet-builder`)
   — confirmar se passa pelo Fastly limpo ou pelo `bmb` mais protegido.
3. Se o **geoblock atinge também o Fastly** (provavelmente não) — se atingir, precisa rodar local BR.
4. **Settlement por mercado** (qual stat Opta — ver STATUS §5).

## Risco residual
- O `bet-builder` host pode exigir handshake/token; o api-gw está bloqueado p/ IP estrangeiro
  (mitiga rodando local no BR).

## Evidências
- Config viva: `superbet.bet.br/static/js/fetchConfig/app` (hosts acima). `awsWafUrl` em `*.sa-east-1.token.awswaf.com` (AWS WAF confirmado).
- Teste: `api.web.production.betler.superbet.bet.br/api-gw/...` → 403 CloudFront de fora do BR; hosts Fastly → 200/404 limpos com `Access-Control-Allow-Origin: *`.
- Chunks Vue: `...playerFocusedExperience...OfferPlayerCards/PlayerViewContainer/BetBuilderPlayerCards` (prop de jogador no site BR).
- github.com/superbet-group (47 repos de infra: Vite module-federation, websocket TS) — stack própria, sem SDK público de odds.
- Agregadores (OpticOdds, Betstamp, odds-api.io) listam Superbet **com player props** → feed raspável.
