# Betano — 🟡 implementada (código + testes); validação BR ao vivo PENDENTE

| | |
|---|---|
| **Status** | 🟡 **Código pronto e testado** (adapter + de-para + registry, TDD na amostra real do recon 2026-06-15). **Falta o teste ao vivo na sua máquina no BR** (F3/F4 do rito) — este ambiente é geoblocado (não-BR) e não consegue validar. |
| **Plataforma** | **Própria/1ª parte** (`www.betano.bet.br`). A pesquisa de mesa dizia "Kaizen/GameplAI difícil" — **a captura no navegador derrubou isso**: o feed de odds é endpoint de 1ª parte, JSON puro. (Kameleoon = só A/B testing; Sportradar = só provedor de **stat**, não de odds.) **Motor de preço próprio → diversidade real** no line shopping (como a Stake). |
| **Como busca** | `fetch` puro (default `needsBrowser:false`) — o recon pegou **HTTP 200 deslogado** (`credentials:'omit'`) no navegador, no BR, sem Turnstile/token. ⚠ **Ver "Risco de transporte" abaixo.** |
| **Anti-bot** | Cloudflare presente, mas **sem Turnstile/captcha interativo** nas chamadas de API. **Geoblock FORTE** (de fora do BR devolve `403` "Betano Splash Screen"). |
| **Mercados** | SOT, finalizações, **desarmes** (ganhos = `won_tackle`), faltas (cometidas). Cobre os 4. |
| **Código** | `src/collect/adapters/betano.ts` · de-para em `tables.ts::BETANO_TABLE` · entrada em `houses.ts` (`needsBrowser:false`). |

## ⚠ Risco de transporte (decidir no 1º `--dry` em BR)

O `fetch` puro do **Node**, deste ambiente (não-BR), tomou **403 + página "Betano Splash Screen"** — isso é **geoblock** (não Cloudflare/JA3). Na sua máquina no BR isso não deve acontecer (o recon, em BR, pegou 200). **Mas** a Stake ensinou que um `.bet.br` pode barrar o `fetch` do Node por **fingerprint TLS/JA3** mesmo logado-em-BR (o "200 no navegador" não transfere pro Node). Por isso:

- **Default = `needsBrowser:false`** (justificado pelo recon: fetch-able em BR).
- **Se o `collectOdds --dry` em BR mostrar `betano` pulado/403** → flipe **`needsBrowser:true`** em `houses.ts` (passa a usar o headless já aberto pra Betnacional/Stake). É a única linha que muda.

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
- **Ao vivo em BR (PENDENTE — você):** `npx tsx src/cli/collectOdds.ts <event_id_BSD> --dry` num jogo real da
  Copa; conferir `betano ✓(N)` com N>0 e linhas batendo com o site. Se vier `403`/pulado → flipar
  `needsBrowser:true` (ver "Risco de transporte"). Depois rodar sem `--dry` e clicar **"obter odds"** no front.
