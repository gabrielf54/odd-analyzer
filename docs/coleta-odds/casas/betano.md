# Betano — 🟡 implementada (código + testes); validação BR ao vivo PENDENTE

| | |
|---|---|
| **Status** | 🟢 **Implementada** (adapter + de-para + registry, TDD). **Transporte resolvido em BR (2026-06-16, jogo 8305): via headless** (`needsBrowser:true`) — o `fetch` puro tomava 403 (JA3). Falta só a confirmação final de odds gravadas ao vivo. |
| **Plataforma** | **Própria/1ª parte** (`www.betano.bet.br`). A pesquisa de mesa dizia "Kaizen/GameplAI difícil" — **a captura no navegador derrubou isso**: o feed de odds é endpoint de 1ª parte, JSON puro. (Kameleoon = só A/B testing; Sportradar = só provedor de **stat**, não de odds.) **Motor de preço próprio → diversidade real** no line shopping (como a Stake). |
| **Como busca** | **navegador headless** (`needsBrowser:true`) — o `fetch` puro do Node toma **403** (fingerprint TLS/JA3), mesmo em BR e com headers de browser; o headless (Playwright, já aberto p/ Betnacional/Stake) passa. Idêntico à Stake. |
| **Anti-bot** | Cloudflare + **fingerprint TLS/JA3** (barra `fetch` do Node → 403). **Sem** Turnstile/captcha interativo nas chamadas de API (headless silencioso resolve; se um dia exigir challenge, `HEADFUL=1`). **Geoblock FORTE** (fora do BR → `403` "Betano Splash Screen") → rodar **local no BR é obrigatório**. |
| **Mercados** | SOT, finalizações, **desarmes** (ganhos = `won_tackle`), faltas (cometidas). Cobre os 4. |
| **Código** | `src/collect/adapters/betano.ts` · de-para em `tables.ts::BETANO_TABLE` · entrada em `houses.ts` (`needsBrowser:true`). |

## Transporte: por que headless (resolvido em BR)

O `fetch` puro do Node tomou **403** no endpoint da lista, **em BR, deslogado, com headers de browser** (`[coletar 8305] betano: lista falhou (403 ...)`). Não é geoblock (estava em BR) nem Turnstile — é **fingerprint TLS/JA3** (o edge da Cloudflare distingue o handshake do Node do de um browser real). É a **mesma lição da Stake**: "200 deslogado no navegador ≠ `fetch` do Node passar". Conserto = `needsBrowser:true` → usa o Chromium headless (handshake de browser real) já aberto pras outras casas-browser. Se algum dia o headless silencioso esbarrar num challenge visível, `HEADFUL=1` (janela real) resolve uma vez (cf_clearance fica na sessão).

## Endpoints (públicos, deslogado — capturados em BR 2026-06-15)

```
# odds de UM jogo (props de jogador LIGADOS via isPlayersToggle=true):
GET https://www.betano.bet.br/api/odds/{slug}/{eventId}/?bt=3&isPlayersToggle=true&req=s,stnf,c,mb,mbl
    ex.: /api/odds/franca-senegal/77353568/?bt=3&isPlayersToggle=true&req=s,stnf,c,mb,mbl

# lista de jogos (crosswalk):
GET https://www.betano.bet.br/api/league/hot/upcoming?leagueId=201663      # 201663 = Copa 2026
```

- O endpoint de odds precisa do **`slug` no path** (ex.: `franca-senegal`) **além** do `eventId`. Por isso o
  crosswalk carrega o id como **`"slug/eventId"`** (extraído do campo `url` da lista) e o `oddsUrl` o
  interpola direto.

## Shape e parsing

- Wrapper: `{ data: { event: { markets: [...] } } }`. Diferente de Stake/Superbet (arrays planos), o Betano é
  **ANINHADO**: cada `market` carrega seu `selections[]`.
- **Chave de de-para:** `market.typeId` **numérico** (id de TIPO de mercado, global). O parser emite
  `market_label = String(typeId)`.
- **Jogador:** embutido em `market.name = "{Jogador} {Mercado em PT}"` (não há campo de nome separado) →
  `betanoPlayer()` remove o sufixo PT conhecido pelo `typeId` (`BETANO_MARKET_SUFFIX`). Há `market.playerId`
  (id numérico) para casar por id se um dia precisar.
- **Linha:** `selection.name = "N+"` (`"1+"`=≥1=over 0.5; `"2+"`=over 1.5). **NÃO use `selection.handicap`** —
  ele é `0` em todas as seleções de **faltas**; usar handicap quebraria faltas (o teste blinda isso).
- **Odd:** `selection.price` (decimal).
- **Suspenso:** mercado suspenso **some** de `markets[]` (não há flag). O parser pula seleção sem `price` finita,
  market sem `playerId` (time/partida), sem `typeId` ou sem `name` — tudo fail-closed.

## De-para + liquidação (chave = `typeId` NUMÉRICO)

| `typeId` | rótulo PT (`market.name` sufixo) | → |
|---|---|---|
| `596` | Chutes no gol | `sot` (on-target) |
| `595` | Total de chutes | `finalizacoes` (total shots) |
| `599` | Total de Desarmes | `desarmes` (**ganhos** = `won_tackle`) |
| `1000679` | Faltas cometidas | `faltas` (fouls committed) |
| `1000678` | Faltas ganhas | **rejeitado** (sofridas ≠ cometidas) |
| `1000680` / `1000681` | …- Primeiro Tempo | **rejeitado** (subtipo de 1º tempo) |
| outros (assistências/passes/cartão/gols…) | — | **rejeitado** (não mapeado → fail-closed) |

> **Liquidação dos desarmes (confirmada por pesquisa web 2026-06-15):** a Betano liquida "Total de Desarmes"
> por **tackle GANHO via Opta** (não tentado) — *"a métrica considerada é tackles won, não attempted"*; falta
> cometida invalida o desarme; cabeceio não conta. Bate com o nosso `settle_field=won_tackle`, mesma base de
> KTO/Superbet/Stake. (Nuance Opta "won vs lost" existe pra **todas** as casas igual — não é específico da
> Betano.) Fontes: casa-apostas.com/betano/tackles-betano, netflu (Opta como provedora), Squawka/Statz.

## Crosswalk

`league/hot/upcoming` → `data.events[]` com `name` "A - B" em **PT** (`"França - Senegal"`) + `url`
(`/odds/franca-senegal/77353568/`). `parseBetanoEventList` faz `split(" - ")` e extrai `slug/eventId` da `url`
→ `{ id: "slug/eventId", home, away }`; `canonicalTeam` resolve PT/EN/FR contra a BSD.

## Validação

- **Offline (feito):** `test/collect/betanoParser.test.ts` — 8 testes verdes na amostra real do recon; parser
  devolve jogador/linha/odd certos, de-para mapeia os 4 mercados e rejeita o resto (faltas ganhas, 1º tempo,
  não-mapeado), faltas provam linha-do-name (não do handicap). Suite total **433 verdes**, typecheck limpo, gate
  de paridade intacto.
- **Transporte em BR (resolvido 2026-06-16):** com `needsBrowser:false` o POST `/coletar-odds` do jogo 8305
  deu `betano: lista falhou (403 ...) — pulando` (JA3). Flipado p/ `needsBrowser:true`. **Falta** reconfirmar
  (server reiniciado) que agora `betano ✓(N)` com N>0 e que as odds gravam — clicar **"obter odds"** num jogo
  **pré-jogo** e conferir o painel/`puladas` no JSON.
