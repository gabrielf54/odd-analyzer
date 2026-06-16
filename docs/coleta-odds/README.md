# Coleta automática de odds — estado e manual

> **Doc vivo e operacional do subsistema de coleta de odds.** É a realidade do que está no ar, casa por
> casa, + o **passo a passo para adicionar uma casa nova**. Quando for estudar uma casa nova, entregue
> esta pasta ao Claude: *"Considere `docs/coleta-odds/`, veja as casas implementadas, vamos estudar
> adicionar a Casa X"*.
>
> Diferença pro `docs/features/coleta-odds-automatica/`: aquilo era o **planejamento/viabilidade**
> (feature pendente); **aqui é o estado de produção** (o que já roda). O histórico de viabilidade vive
> no git e na pasta features.

---

## 1. O que é (em uma frase)

Em vez de colar um prompt no Claude do navegador e pegar odds de **uma** casa na mão, o sistema busca
as odds de **várias casas sozinho**, escolhe o **melhor preço** (line shopping), marca **divergências
suspeitas** e **grava no banco** — de onde a análise do front já lê. Roda **local na sua máquina (no
Brasil), deslogado**, lendo só odd pública.

## 2. Como rodar (hoje)

```bash
# acha o jogo nas casas implementadas, coleta, line-shop e GRAVA no banco:
npx tsx src/cli/collectOdds.ts <event_id_BSD>

# só testar, sem gravar:
npx tsx src/cli/collectOdds.ts <event_id_BSD> --dry

# forçar ids de casa na mão (se o crosswalk automático falhar):
npx tsx src/cli/collectOdds.ts <event_id_BSD> --kambi <id_kto> --bet6 <id_ramp>
```

**Pelo front (botão "obter odds"):** `POST /jogos/:eventId/coletar-odds` (`?dry=1` testa sem gravar;
corpo opcional `{ "overrides": { "kto": "<id>", "betnacional": "<id>" } }`). O endpoint roda a MESMA
coleta do CLI e grava no `odds`. Fluxo do botão: **POST coletar-odds → POST /analise/manual** (a
análise já lê as odds gravadas). Retorna `{ jogo, casas, n_por_casa, n_line_shop, divergencias, gravadas }`.

`<event_id_BSD>` é o id do jogo no nosso sistema (BSD). O resto é automático: o sistema descobre o id
do jogo em cada casa pelo **nome dos times** (resolve PT/EN/FR — Alemanha = Germany).

> **Cloudflare:** se uma casa endurecer o anti-bot, rode com `HEADFUL=1` (abre uma janela do navegador
> de verdade — só funciona na sua máquina). Ex.: `HEADFUL=1 npx tsx src/cli/collectOdds.ts 8295`.

## 3. Estado das casas

| Casa | Plataforma | Como busca | Anti-bot | Status | Mercados de jogador cobertos |
|---|---|---|---|---|---|
| **KTO** | Kambi | `fetch` puro | Varnish (rate-limit) | ✅ **AO VIVO** | SOT, finalizações, **desarmes**, faltas |
| **Betnacional** | NSX/Bet6 (Sportradar) | navegador headless | Cloudflare | ✅ **AO VIVO** | SOT, finalizações, faltas *(sem desarmes)* |
| **Superbet** | Betler (própria, Sportradar) | `fetch` puro | **nenhum** (Fastly, deslogado) | ✅ **AO VIVO** | SOT, finalizações, **desarmes**, faltas |
| **Stake** | **própria** (`sbweb.stake.bet.br`) | navegador headless | fingerprint TLS/JA3 (fetch puro → 403) | ✅ **AO VIVO** | SOT, finalizações, **desarmes**, faltas |
| **Betano** | **própria** (`www.betano.bet.br`) | `fetch` puro (default) | geoblock forte (fora do BR → 403 splash); **sem** Turnstile interativo | 🟡 **código pronto** (validação BR pendente) | SOT, finalizações, **desarmes**, faltas |

Detalhe de cada uma em [`casas/`](casas/). **Provado ao vivo (2026-06-14)** no jogo Germany×Curaçao:
KTO + Betnacional resolvidas sozinhas (confiança 1.0), line shopping cruzado, divergências reais
sinalizadas, odds gravadas no banco. **Stake adicionada (2026-06-15, Belgium×Egypt):** 1ª casa com
**motor de preço próprio** (não-Kambi/não-Sportradar) → diversidade real; as 4 casas coletam juntas.

> **Headless compartilhado é serializado.** Betnacional e Stake usam o mesmo Chromium (página única); o
> `collectAll` dispara as casas em paralelo, então o `browserFetch` **enfileira** os gets (dois
> `page.goto` concorrentes na mesma página colidiam). Adicionar mais casas-browser não recria a corrida.

## 4. Como funciona (mapa do código)

```
src/collect/                 ← MOTOR (puro, sem rede/banco — testável offline)
  houses.ts                  ← REGISTRY: lista das casas (book, needsBrowser, URLs, parsers).
                               buildCollectors() resolve o id de cada casa (crosswalk) + monta os collectors.
                               ★ ADICIONAR CASA = 1 entrada aqui (+ adapter + de-para).
  run.ts                     ← runCollection(): orquestração compartilhada CLI+endpoint
                               (buildCollectors → collectOdds → grava no `odds`). fetchers/repo injetados.
  normalizer.ts              ← de-para fail-closed: rótulo cru da casa → mercado canônico
  tables.ts                  ← o de-para de CADA casa (rótulo → market_type)
  lineShop.ts                ← line shopping: melhor odd por (jogador, mercado, linha)
  antiTrap.ts                ← anti-armadilha: marca divergências fortes entre casas (só REVISÃO)
  matchEvent.ts              ← crosswalk de jogo: casa o jogo da BSD ao da casa pelo nome
  teamNames.ts               ← canonicalTeam: PT/EN/FR de seleção → mesma chave (Alemanha=Germany)
  pipeline.ts                ← collectOdds: collectAll → normaliza por casa → divergência → line shop
  adapters/<casa>.ts         ← UM por casa: parser do formato cru + builders de URL (odds + lista)
src/cli/
  collectOdds.ts             ← CLI: monta fetchers + chama runCollection
  fetchers.ts                ← makeFetchers(): fetch puro + headless (a camada que toca a internet)
  browserFetch.ts            ← navegador headless (Playwright) p/ casas atrás de Cloudflare
src/api/app.ts               ← POST /jogos/:id/coletar-odds (importa fetchers DINAMICAMENTE → Playwright
                               só carrega no request) → service.coletarOddsService → runCollection
```

**Regra de ouro da arquitetura:** o motor (`src/collect/`) é **puro** — não sabe o que é `fetch`,
navegador ou banco. Quem busca na internet (`fetch`/headless, em `cli/fetchers.ts`) e grava no banco é
**injetado** no motor (`runCollection`). Por isso o motor roda 100% offline nos testes, e o CLI e o
endpoint compartilham a MESMA orquestração.

## 5. Princípios que não mudam (valem para QUALQUER casa nova)

- **Higiene legal:** deslogado, volume baixo, com pausa entre chamadas, **sem proxy/VPN rotativo**,
  nunca redistribuir o dado raspado. Ler odd pública deslogado é legal no BR; o risco é só civil/ToS
  (ban de IP, reversível). Rodar **local no BR** mata o geoblock e dá IP residencial limpo.
- **Fail-closed:** na dúvida, **rejeita**. Rótulo de mercado que não está no de-para exato é descartado
  (nunca adivinha por "parecido"). O que não passa nunca entra no cálculo de aposta.
- **A IA nunca calcula número.** O line shopping só escolhe a **maior `odd_over` dentro de uma casa**
  (nunca cruza margem de casas diferentes). A probabilidade vem do modelo, em código.
- **Liquidação importa:** o mesmo "desarme" pode ser **tentativas** ou **ganhos**; "faltas" pode ser
  **cometidas** ou **sofridas**. Sempre confirme **qual stat a casa paga** antes de mapear — senão o
  card mostra um número e a aposta liquida outro.

## 6. Playbook — adicionar uma casa nova (ex.: Betano)

> **Rito E2E completo (exploração no navegador → código → front buscando sozinho):**
> [`IMPLEMENTAR-CASA.md`](IMPLEMENTAR-CASA.md). Use-o quando for adicionar uma casa — ele traz os
> **prompts prontos** pro Claude do Chrome e dita o rito até o botão "obter odds" trazer a casa nova.
> O §6 abaixo é o **detalhe de código** dos passos (parser/de-para/registry); o rito é a camada de cima.

Siga na ordem. Cada passo tem um "pronto quando".

1. **Capturar o endpoint (1 vez).** Descobrir a chamada que traz as odds de **prop de jogador** daquela
   casa. Dois jeitos: (a) você abre o site deslogado, F12 → Network, abre a aba de prop e captura
   (HAR/print/Claude-no-Chrome); (b) eu gravo a rede com o navegador headless. **Anotar:** URL +
   parâmetros, método (GET/POST), shape do JSON, **onde está** o nome do jogador, a linha e a odd, e
   se há token/cookie. *Pronto quando:* consigo refazer a chamada e receber as odds.
2. **Vencer o anti-bot.** Testar `fetch` puro. Se vier **403/HTML de Cloudflare** → usar o
   `browserFetch` (headless). Se vier **geoblock** → confirmar que roda **local no BR**. *Pronto
   quando:* a chamada retorna JSON na nossa máquina.
3. **Parser** (`src/collect/adapters/<casa>.ts`). JSON cru → `RawCollectedLine[]`. Pula o que não
   entende (fail-closed). Se a linha está embutida no nome do mercado (escada "N+"), o parser extrai.
   **TDD:** escreva o teste com uma amostra real **antes**. *Pronto quando:* o teste verde devolve
   jogador + linha + odd certos.
4. **De-para** (`src/collect/tables.ts`). Rótulo da casa → `market_type` canônico (`sot`,
   `finalizacoes`, `desarmes`, `faltas`...). **EXATO, nunca substring.** Mercado que não quer →
   deixar de fora (rejeita) ou marcar `reject` com motivo. *Pronto quando:* a cadeia
   parser→`normalizeCollected` mapeia os mercados certos e rejeita o resto.
5. **Liquidação.** Confirmar (pelo rótulo/regras da casa): desarme = **ganho** (`won_tackle`) ou
   tentativa? falta = **cometida** ou sofrida? "chutes no gol" (SOT) vs "chutes" (finalizações)?
   *Pronto quando:* o `market_type` casa com o que a casa realmente paga.
6. **Crosswalk de jogo.** Achar a **lista de jogos** da casa (endpoint que lista os jogos do torneio
   com id + nome dos times). Parser dela → `matchEventByName` (já usa `canonicalTeam` p/ PT/EN/FR).
   *Pronto quando:* dado o jogo da BSD, o sistema acha o id da casa sozinho (confiança alta).
7. **Ligar no REGISTRY.** Adicionar **uma entrada** em `HOUSES` (`src/collect/houses.ts`):
   `{ book, needsBrowser, oddsUrl, parseOdds, listUrl, parseList }` — `needsBrowser:true` se a casa
   exige headless (passo 2). É só isso: o CLI e o endpoint passam a buscar a casa nova
   automaticamente (nenhum outro arquivo muda). *Pronto quando:* `collectOdds.ts <event_id> --dry`
   lista as odds da casa nova junto das outras.
8. **Validar e gravar.** Rodar `--dry` num jogo real; conferir odds plausíveis e as divergências
   cross-casa; depois rodar sem `--dry`. *Pronto quando:* as linhas da casa nova estão no banco `odds`.
9. **Documentar.** Criar `casas/<casa>.md` (use as existentes de molde) e atualizar a matriz da §3.

> **Gate de paridade:** nada disso toca o motor de probabilidade (`model/`/`value/`). Rodar `npm test`
> e `npm run typecheck` ao fim — devem seguir verdes.

## 7. Onde a odd vai parar

O CLI grava na tabela **`odds`** (PK `event_id, entidade, market_type, linha, book`) — **uma linha por
casa** (não só a vencedora), pra a análise refazer o line shopping e manter o sinal de divergência. A
análise manual (`/analise/manual`, `GET /jogos/:id/analise`) já lê dessa tabela. Odds **manuais**
(coladas, ex.: book `Betano`) e **automáticas** (`kto`, `betnacional`) **convivem** no mesmo jogo.
