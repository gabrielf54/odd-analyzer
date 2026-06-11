# N4 — Odds automáticas da BSD (só mercado de partida)

> 🗑️ **DESCARTADO (decisão do dono, 2026-06-11).** O dono decidiu **não** usar odds automáticas.
> A BSD só dá mercado de **partida** (não recomendável: gols selado; 1x2/BTTS sem calibração) e
> **zero player prop** (o MVP). A ficha fica como **histórico**, não como passo a implementar.
> Ver `docs/proximos-passos/SESSION-MAP.md` (seção "Descartado").

## 1. TL;DR
A BSD entrega odds de **1x2 / over-under gols / BTTS com os DOIS lados** → **de-vig real** e **linha de
fechamento (CLV) automáticos** nesses mercados. Ler `eventOdds` e mapear para os mercados de partida do
motor, passando `odd_over` **e** `odd_under` ao builder. **NÃO serve player prop** (a BSD não dá), e
**NÃO destrava novas apostas confiáveis** (gols é selado; 1x2/BTTS precisam de calibração própria). O
ganho é **infra** (de-vig real + CLV automático para o I7), não recomendação nova.

## 2. Status
- **Ajuda à meta:** **Médio** (de-vig real + CLV automático onde a BSD dá os dois lados; alimenta o loop forward).
- **Pronto p/ Copa:** ✅ Sim para a **infra**; ⏳/❌ para virar **aposta** (gols selado; 1x2/BTTS sem calibração).
- **Esforço:** **Baixo-Médio**.
- **Risco de calibração/paridade:** **Baixo** — só muda `prob_devig` em mercado de partida; não toca μ/NB2/modelo de gols. Golden de `test/parity/` intactas.
- **Custo de dado:** **$0** — BSD já assinada (`BZZOIRO_API_KEY`).

## 3. Problema / fundamento
**De-vig real precisa dos dois lados.** Em player prop a casa dá só o over → de-vig inerte
(`sem_devig=true`, ver ficha I1). Mas em **mercado de partida** a BSD entrega **over E under** (gols),
**home/draw/away** (1x2) e **btts_yes/btts_no** — ou seja, dá para **tirar a margem de verdade** e achar
a `prob_devig` justa que a casa acredita. E a **odd de fechamento** (a mais esperta, segundos antes do
jogo) também está nesses mercados → o **CLV** (Closing Line Value) do I7 pode ser **automático** aqui.

Em termos do produto: o número justo da casa (de-vig) é o adversário do nosso `prob_modelo`. Tê-lo
**honesto e automático** em gols/1x2/BTTS:
- dá **de-vig real** nesses mercados (em vez do conservador one-sided);
- alimenta o **CLV** do loop forward (medir se pegamos preço melhor que o fechamento) **sem coleta
  manual** — o sinal de validação mais rápido que existe.

**Mas — limite duro:** "ter odd limpa" **não** é "pode apostar". **Gols não calibra** (selado em
validação). **1x2/BTTS** não têm calibração própria. Então N4 melhora **de-vig/CLV**, e **não** libera
recomendações novas. A calibração manda (princípio: validação-primeiro).

## 4. Evidência real (sondagem 2026-06-11)
`GET /events/8287/odds/` e `GET /events/9099/odds/` retornam um payload com os campos:
```
home_win, draw, away_win,
over_15_goals, over_25_goals, over_35_goals,
under_15_goals, under_25_goals, under_35_goals,
btts_yes, btts_no
```
→ **dois lados** em gols (`over_X5_goals` ↔ `under_X5_goals`) e em 1x2 (home/draw/away) e BTTS
(yes/no). **ZERO player prop** (nenhum campo de SOT/finalizações/desarmes/escanteios por jogador).

> ⚠️ **Forma do payload a confirmar antes de codar.** A sondagem acima descreve uma forma **achatada**
> (`{ home_win, over_25_goals, ... }`). O adapter `BSDMatchOdds` que já existe no código
> (`src/providers/odds.ts:52-79`) espera outra forma — `{ bookmakers: [{ markets: [{ outcomes: [{ name,
> point, price }] }] }] }` (estilo The-Odds-API). **As duas não batem.** Ao implementar, **sondar
> `eventOdds` ao vivo** e adaptar o parser à forma real (provavelmente a achatada). Ver §5.

## 5. Estado atual no código (o que existe / o que falta)
**Já existe:**
- `src/bsd/client.ts:50` — `eventOdds(id)` → `GET /events/{id}/odds/` (TTL_ODDS). `:51` — `oddsByBook(id, market, book)`.
- `src/providers/odds.ts:52-79` — **um adapter `BSDMatchOdds`** já chama `client.eventOdds(event.id)`
  (`:59`) e mapeia para `OddsLine`. **PORÉM:**
  - mapeia só **3 mercados** via `BSD_MARKET_KEY` (`odds.ts:5-9`): `escanteios→corners_total`,
    `gols→goals_total`, `vitoria→match_winner` — **chaves que não aparecem na sondagem achatada**;
  - faz parsing da forma **`bookmakers/markets/outcomes`** (`:61-76`), com `name === "over"/"under"`
    e `o.point/o.price` — **incompatível** com `{ over_25_goals: ..., under_25_goals: ... }`;
  - filtra linhas que tenham **os dois lados** (`:77` `filter((l) => l.odd_over && l.odd_under)`) — a
    intenção (2 lados) está certa, só a forma de entrada que diverge.
- **O fluxo manual (usado na Copa) NÃO consome `eventOdds`.** Em `src/manual/analyze.ts:64-67`, o ramo
  de mercado de partida monta um `ManualOdds` com as **odds coladas** (`src/providers/odds.ts:16-20`),
  não `BSDMatchOdds`. Confirme lendo `src/providers/odds.ts` e `src/manual/analyze.ts`.

**Falta:**
- Um adapter/`OddsProvider` que leia `eventOdds` na **forma real** (achatada) e mapeie:
  - `over_X5_goals`/`under_X5_goals` → mercado **`gols`**, linhas `[1.5, 2.5, 3.5]` (= `MARKETS.gols.lines`, `src/model/markets.ts:48`), com `odd_over` **e** `odd_under`;
  - `home_win`/`draw`/`away_win` → mercado **`vitoria`** (1x2);
  - `btts_yes`/`btts_no` → mercado **BTTS** (novo, opcional — ver §6).
- **Ligar** esse provider ao fluxo (manual e/ou pipeline) para de-vig real de partida.
- Usar `eventOdds` como **snapshot de fechamento** do CLV (I7) em mercado de partida.

## 6. Proposta de implementação
**Passo 1 — adapter de odds de partida (forma achatada da BSD).** Novo `OddsProvider` (ou refatorar
`BSDMatchOdds`) que lê `client.eventOdds(event.id)` e mapeia a forma **real**:
```ts
// pseudo — confirmar nomes de campo na sondagem ao vivo antes de codar
async lines(event, market): Promise<OddsLine[]> {
  const o = await this.client.eventOdds(event.id);  // { home_win, over_25_goals, under_25_goals, btts_yes, ... }
  if (market.key === "gols") {
    return market.lines.flatMap((linha) => {            // [1.5, 2.5, 3.5] de markets.ts:48
      const over  = o[`over_${linha*10}_goals`];        // over_15_goals, over_25_goals, over_35_goals
      const under = o[`under_${linha*10}_goals`];
      return (over && under)
        ? [{ entidade: "partida", linha, odd_over: over, odd_under: under, book: "bsd" }]
        : [];                                            // sem 2 lados → não emite (de-vig real exige par)
    });
  }
  if (market.key === "vitoria") { /* home_win/draw/away_win → linhas 1x2 */ }
  if (market.key === "btts")    { /* btts_yes/btts_no → mercado BTTS (Passo 3) */ }
  return [];
}
```
- **Contrato no fio (snake_case PT):** o `OddsLine` resultante alimenta `buildCandidate`, que com os dois
  lados produz `prob_devig` de 2 vias e `sem_devig=false` (ver I1). Saída do candidato inalterada em forma:
  ```jsonc
  { "entidade": "partida", "market_type": "gols", "linha": 2.5,
    "odd_over": 1.90, "odd_under": 1.95, "prob_devig": 0.512, "sem_devig": false, "edge": 0.02, "ev": 0.01 }
  ```
- **Ports & Adapters:** este é um **adapter** (faz I/O via `client` injetado, implementa `OddsProvider`);
  o domínio (`model/`/`value/`) não muda. Testar com um **fake de `eventOdds`** (sem rede).

**Passo 2 — snapshot de fechamento (CLV) para o I7.** Perto do kickoff, um CLI/job lê `eventOdds` e
chama `snapshotClosing(...)` (`src/store/repo.ts`) com a odd de fechamento de partida → **CLV
automático** nesses mercados (player prop continua manual — ver I7/I1). Reaproveita o mesmo adapter.

**Passo 3 — BTTS como extensão (opcional).** A casa dá `btts_yes/btts_no`, mas o motor **não tem** o
mercado BTTS hoje (`MARKETS` em `src/model/markets.ts:21` cobre sot/finalizacoes/desarmes/escanteios/
gols/vitoria). Para comparar `prob_modelo` vs de-vig de BTTS, derivar **P(ambos marcam)** do
`scoreMatrix` do modelo de partida (`src/model/matchModel.ts`) — `P(home≥1 e away≥1)`. **Mas:** isso é
um mercado **novo e não calibrado** → entra **só** como de-vig/CLV em quarentena, **não** como
recomendação, até ter calibração. (Pode ser empurrado para o Tier 2.)

## 7. Plano de validação
- **De-vig real (offline, determinístico):** com um **fake de `eventOdds`** (forma achatada), o adapter
  emite `odd_over`+`odd_under` por linha de gols/1x2; `buildCandidate` produz `prob_devig` de 2 vias que
  bate com `fairProbOver` à mão; linhas sem os dois lados **não** são emitidas.
- **Gate de paridade:** `test/parity/` verde (o número do modelo de gols/partida não muda — só o de-vig).
- **CLV automático (forward, via I7):** após o kickoff, `snapshotClosing` preenche `odd_fechamento`/`clv`
  para mercado de partida sem coleta manual. **Critério de aceite:** rodar num jogo real da Copa →
  `paper_ledger` (linhas de partida) recebe `clv` automático coerente com `odd_flag / odd_fechamento − 1`.
- **QUARENTENA (parte da validação):** confirmar que **gols não vira recomendação** só por ter odd limpa,
  e que 1x2/BTTS ficam fora de recomendação até calibrar. O de-vig/CLV existe; a aposta, não.

## 8. Riscos & armadilhas
- **Tratar "tem odd limpa" como "pode apostar" (ERRADO).** Gols é selado; 1x2/BTTS sem calibração. O
  ganho é **de-vig/CLV (infra)**, não novas apostas confiáveis. **Calibração manda.**
- **Forma do payload divergente.** O `BSDMatchOdds` existente (`odds.ts:52-79`) espera
  `bookmakers/markets/outcomes`; a sondagem mostra forma **achatada**. **Sondar ao vivo e adaptar o
  parser** — não assumir a forma antiga.
- **Linhas sem os dois lados** (ex.: só `over_35_goals` presente) → **não emitir** (de-vig real exige o
  par); cair para conservador é o comportamento de I1, mas para N4 (cujo propósito é o de-vig real)
  melhor **omitir** a linha incompleta.
- **BTTS exige mercado novo + derivação do `scoreMatrix`** (`matchModel.ts`) — não é só ler odd; e
  nasce **não calibrado**. Manter em quarentena.
- **Paridade:** mexer só no de-vig de partida não toca as golden; ainda assim rodar `test/parity/`.

## 9. Dependências
- **I1** (de-vig honesto): N4 fornece o `odd_under` automático de partida que I1 consome no de-vig de 2 vias.
- **I7** (loop forward): consome o `snapshotClosing` de partida para o CLV automático.
- **Para BTTS:** modelo de partida (`src/model/matchModel.ts`, `scoreMatrix`) — e calibração futura.

## 10. Esforço estimado
**Baixo-Médio.** ~0,5 dia para o adapter de gols/1x2 (forma achatada) + de-vig de 2 vias + testes com
fake. +0,5 dia para o snapshot de fechamento (CLV de partida). BTTS é **extra** (mercado novo +
derivação + quarentena) — empurrar se faltar tempo.

## 11. Checklist de aceite
- [ ] Adapter lê `client.eventOdds` na **forma real** (achatada) e mapeia gols (`over/under_X5_goals`) e 1x2 (`home/draw/away_win`).
- [ ] Linhas de partida com 2 lados produzem `prob_devig` de 2 vias (`sem_devig=false`); linhas incompletas são omitidas.
- [ ] Snapshot de fechamento de partida preenche `odd_fechamento`/`clv` automaticamente (via I7).
- [ ] **Quarentena mantida:** gols/1x2/BTTS **não** viram recomendação só por ter odd limpa.
- [ ] (Opcional) BTTS derivado do `scoreMatrix`, marcado como não-calibrado/quarentena.
- [ ] `npm test` verde (testes com fake de `eventOdds`); golden de `test/parity/` intactas.
- [ ] `docs/ROADMAP.md` atualizado (odds de partida automáticas: de-vig real + CLV; sem nova recomendação).

## 12. Como verificar
```bash
npm test
npm run typecheck
```
Sondar a **forma real** do `eventOdds` antes de codar (usa `BZZOIRO_API_KEY` do `.env`):
```bash
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/8287/odds/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j).slice(0,600)))'
# conferir os campos dos dois lados (gols/1x2/BTTS) e a AUSÊNCIA de player prop:
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/9099/odds/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(Object.keys(j)))'
```
Esperado: chaves como `home_win, draw, away_win, over_25_goals, under_25_goals, btts_yes, btts_no` e
**nenhuma** chave de SOT/finalizações/desarmes/escanteios por jogador. CLV de partida (após settle):
```sql
-- Supabase MCP (execute_sql) — CLV automático de mercado de partida
select market_type, count(*) n, avg(clv) clv_medio
from paper_ledger
where market_type in ('gols','vitoria') and clv is not null
group by market_type;
```
