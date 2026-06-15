# Stake — ✅ AO VIVO

| | |
|---|---|
| **Status** | ✅ Em produção (4ª casa). Provado ao vivo 2026-06-15 (Belgium×Egypt). |
| **Plataforma** | **Própria/proprietária** (`sbweb.stake.bet.br`). **NÃO é Kambi** (a pesquisa de mesa errou; a captura no navegador provou motor proprietário). Sportradar só para widgets de estatística. |
| **Como busca** | **Navegador headless** (Playwright) — `needsBrowser:true`. Ver "Anti-bot". |
| **Anti-bot** | Edge com **fingerprint de browser/TLS (JA3)**. ⚠ **O `fetch` puro do Node toma 403** (página de challenge Cloudflare `ie6 oldie`), **mesmo com headers de browser** (Origin/Referer/sec-fetch testados → 403). O navegador vê 200 deslogado (`credentials:'omit'`), mas isso **NÃO transfere pro Node**. Sem Turnstile interativo/login; o headless (já aberto p/ Betnacional) passa. |
| **Geoblock** | Rodando local no BR. GeoComply presente (só compliance). |
| **Mercados** | SOT, finalizações, **desarmes**, faltas (cometidas). **Cobre desarmes** (3ª fonte, junto de KTO/Superbet). |
| **Código** | `src/collect/adapters/stake.ts` · de-para em `tables.ts::STAKE_TABLE` · `needsBrowser:true` no `houses.ts`. |
| **Diversidade** | **1ª casa com motor de preço INDEPENDENTE** das outras (KTO=Kambi, Superbet/Betnacional=Sportradar) → muda o line shopping de verdade. |

## Endpoints (públicos no navegador; via headless no Node)

```
# odds de UM jogo (GET REST; eventId = id interno string, = o da URL do site e da lista):
GET https://sbweb.stake.bet.br/api/v1/br/pt-br/events/{eventId}/odds

# lista de jogos de um torneio (crosswalk). Copa do Mundo 2026 = tournamentId 2010133908:
GET https://sbweb.stake.bet.br/api/v1/br/pt-br/tournament/{tournamentId}/live-upcoming
# (há também /api/v1/br/pt-br/sport/FOOTBALL/tournaments p/ listar torneios+ids se mudar de arena)
```

- O endpoint `/markets` do mesmo jogo existe (rótulos+ids), mas **não é chamado em runtime**: serviu só
  pra montar o de-para. O coletor precisa só de `/odds` + a lista.

## Shape e parsing

- `/odds` = `{ odds: [...], prePacks: [] }` — array PLANO de seleções. Cada seleção:
  `name` (jogador) · `addValue` (linha, **string** `"0.5"`) · `oddValue` (odd, **number**) ·
  `oddTypeName` (`"Mais"`=Over / `"Menos"`=Under) · `marketId` (**string**) · `frozen` (true = sem preço).
- **Over-only:** os props de jogador só trazem `"Mais"` → o parser filtra `oddTypeName==="Mais"` e
  `odd_under=null`. Pula `frozen===true` (suspenso) e sem name/linha/odd (fail-closed).
- **Linha** vem de `addValue` convertido a número (igual Superbet) — o `parseLinha` do normalizer só
  aceita over (`.5`/`N+`), então passar `"0.5"` como número evita a rejeição de string crua.

## De-para + liquidação (chave = `marketId` NUMÉRICO base)

A chave é o **`marketId`** (id de **tipo de mercado, GLOBAL** — confirmado **igual nos 2 jogos**
capturados, não muda por partida). O `/markets` traz o id com **sufixo de linha** (`_15`/`_55`/`_125`);
o `/odds` traz a **base** → o parser casa pela **base** (`String(marketId).split("_")[0]`).

| `marketId` | `name` (Stake) | Liquida (Opta) | → mercado |
|---|---|---|---|
| `1002035662` | Chutes a gol pelo jogador | shots on target | `sot` |
| `1004544421` | Chutes pelo jogador | total shots | `finalizacoes` |
| `1001809658` | Desarmes **completados** pelo Jogador | **tackles ganhos** (`won_tackle`) | `desarmes` |
| `1007684754` | Faltas **concedidas** pelo jogador | faltas cometidas | `faltas` |
| `1007684761` | Faltas **ganhas** pelo jogador | faltas **sofridas** | **rejeitado** (não modelamos) |

> **Liquidação Opta (igual KTO):** desarmes = **completados** (ganhos = `won_tackle`, o que o modelo
> prevê na decomposição tentativas×aproveitamento); faltas = **concedidas** (= cometidas). Cuidado com o
> par: "concedidas"=cometidas (quer); "ganhas"=sofridas (**rejeita**). O resto dos marketIds de jogador
> cai como não-mapeado → fail-closed.

## Crosswalk

`/tournament/2010133908/live-upcoming` → `{events:[...]}`; cada evento tem `id` (string) +
`teams.home`/`teams.away` em **PT** ("Espanha"/"Cabo Verde") → `parseStakeEventList` → `matchEventByName`
(via `canonicalTeam`). Bônus: `externalIds[].value` traz o id **Betradar** (`provider:"BET_RADAR"`).
Casou **Belgium×Egypt → `1025862146` com confiança 1.0**.

## Validação ao vivo (2026-06-15)

Belgium×Egypt (`1025862146`), pré-jogo, BR, via headless: 217 props de jogador → **178 linhas canônicas**
(sot 46 · finalizações 41 · desarmes 18 · faltas 73), 39 rejeitadas (fail-closed). `Omar Marmoush
desarmes 2.5 @ 2.35` bateu **exato** com a captura manual → parse/settlement/marketId corretos. As 4 casas
(kto/betnacional/superbet/stake) coletaram juntas no mesmo `collectOdds 8300 --dry`.

## Observações

- **Headless compartilhado serializado:** Betnacional **e** Stake usam o mesmo Chromium (página única).
  O `collectAll` dispara em paralelo → dois `page.goto` concorrentes colidiam. O `browserFetch` agora
  **serializa** os gets (fila) — sem corrida; custo sequencial aceitável (poucas casas-browser).
- Se o edge endurecer: `HEADFUL=1` (abre janela real).
