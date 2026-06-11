# I7 — Loop de validação forward (paper_ledger + CLV + settle)

## 1. TL;DR
Registrar cada recomendação no `paper_ledger` no momento da análise, capturar a odd de fechamento
e o resultado real do jogo, e agregar **Brier/ECE/CLV por mercado**. É a única forma de provar que
o modelo acerta na **população de seleção da Copa** (não dá para provar no passado — ver veredito).

## 2. Status
- **Ajuda à meta:** **Alto** (destrava confiar em tudo).
- **Pronto p/ Copa:** ✅ Sim.
- **Esforço:** Médio.
- **Risco de calibração/paridade:** Baixo (aditivo; não muda o money-path).
- **Custo de dado:** $0 (BSD já dá player-stats pós-jogo e odds de partida).

## 3. Problema / fundamento
"Validação-primeiro" é princípio inegociável: calibração offline → **CLV** → só então dinheiro real.
A **calibração** é o detector de mentira (homem do tempo: quando diz 70%, chove ~70%?). Hoje a prova
foi feita em **clubes EPL**; a Copa é outra população e **não há como refazer a prova no passado**
(BSD não guardou stats de 2018/2022 — provado na sondagem). Então a prova tem que ser **forward**.

Dois sinais forward, complementares:
- **Calibração forward (Brier/ECE):** ao longo da Copa, juntar as recomendações e comparar
  `prob_modelo` com o que aconteceu (`resultado` 0/1). Diz se o número é honesto **nas seleções**.
- **CLV (Closing Line Value):** comparar a odd que pegamos com a odd de **fechamento** (a mais
  esperta, segundos antes do jogo). CLV+ é o sinal mais rápido de que a aposta é boa de verdade,
  **antes** de ter amostra grande de resultados.

Sem este loop, cada melhoria dos Tiers 1/2 é fé não medida.

## 4. Evidência real
- `paper_ledger` = **0 linhas**; `jogadores_crosswalk` = 0 (Supabase, 2026-06-11). Não há prova forward.
- O **fluxo manual** (usado na Copa) **não grava ledger** — ver §5. Por isso está vazio.
- Settle automático é viável: `/events/{id}/player-stats/` pós-jogo traz `total_tackle`, `shots_on_target`,
  `total_shots` reais por jogador (confirmado na sondagem do amistoso 9099 e do jogo de clube 7166).
- CLV automático **só para mercado de partida**: `/events/{id}/odds/` dá 1x2/over-under gols/BTTS com
  os dois lados (sondagem dos events 8287 e 9099). **Player prop não tem odd na BSD** → fechamento manual.

## 5. Estado atual no código (o que já existe / o que falta)
**Já existe (infra pronta, só não está ligada no fluxo manual):**
- `src/store/schema.sql:16-33` — tabela `paper_ledger` com colunas: `event_id, jogador, linha,
  market_type, odd_flag, prob_modelo, prob_devig, edge, ev, odd_fechamento, prob_devig_fechamento,
  resultado int, clv, criado_em`. **`unique (event_id, jogador, linha, market_type)`**.
- `src/store/repo.ts:2` — `clv(oddFlag, closingOdd) = oddFlag/closingOdd - 1`.
- `src/store/repo.ts:35` (interface) / `:56,182` (impls) — `saveLedger(rows)`.
- `src/store/repo.ts:36/89/185` — `updateClosing(eventId, jogador, linha, marketType, closingOdd, resultado)` (seta odd_fechamento + resultado + clv juntos).
- `src/store/repo.ts:40/114/213` — `snapshotClosing(eventId, jogador, linha, marketType, closingOdd)` (seta odd_fechamento + clv, **sem** resultado).
- `src/pipeline.ts:44-53` — `analyzeMatch()` **JÁ grava** no ledger, mas só quando
  `ia.melhor_aposta.veredito === "APOSTAR"` (esse é o fluxo **por-mercado** com `defaultAnalyst`, não o manual).

**Falta:**
- `src/manual/analyze.ts:83-94` (`analyzeManual`) monta `result` e chama `repo.saveManualResult`,
  mas **não chama `repo.saveLedger`**. → registrar as recomendações aqui.
- Um método/caminho de **settle por resultado sem exigir odd de fechamento** (player prop não tem
  closing automático). Hoje `updateClosing` exige `closingOdd`. Precisa de um `settleResult(eventId,
  jogador, linha, marketType, resultado)` (ou tornar `closingOdd` opcional no settle).
- Um **job/CLI de fechamento** (snapshot da odd perto do kickoff) e um **job/CLI de settle** (pós-jogo).
- Um **relatório** de calibração/CLV por mercado a partir do `paper_ledger`.

## 6. Proposta de implementação
**Passo 1 — gravar no ledger no fluxo manual.** Em `src/manual/analyze.ts`, após `rankCandidates`
e a revisão da IA, gravar as linhas. **Decisão de produto a alinhar no brainstorming:** registrar
**todos os aprovados** (são os que o modelo diz ter valor) com um campo distinguindo o
`recomendado`/apostado — porque calibração precisa de **muitos pontos**, não só do topo; o CLV/aposta
mede-se no subconjunto liberado pelo N1 (titularidade confirmada).
```ts
// pós-review, em analyzeManual (respeitar N1: só "apostado=true" se titularidade==="confirmado")
const ledgerRows = revisados
  .filter((c) => c.edge > 0)                  // o universo de "valor" do modelo
  .map((c) => ({
    event_id: event.id, jogador: c.jogador, linha: c.linha, market_type: c.market_type,
    odd_flag: c.odd, prob_modelo: c.prob_modelo, prob_devig: c.prob_devig, edge: c.edge, ev: c.ev,
    // apostado/recomendado fica implícito por recomendado=true + titularidade confirmada (ver N1)
  }));
await repo.saveLedger(ledgerRows);            // upsert/ignore por unique(event_id,jogador,linha,market_type)
```
> ⚠️ `unique(event_id,jogador,linha,market_type)`: re-análise do mesmo jogo deve fazer **upsert
> idempotente** (não duplicar). `SupabaseRepo.saveLedger:182` usa `insert` → trocar por `upsert`
> com `onConflict` ou guardar contra duplicado. `InMemoryRepo.saveLedger:56` só dá push — ok p/ teste.

**Passo 2 — settle automático (resultado 0/1) lendo player-stats.** CLI novo (ex.:
`src/cli/settle.ts` ou função no runner) que, para um `event_id` finalizado:
1. lê o ledger do evento;
2. busca `client.eventPlayerStats(eventId)` → `player_stats[]`;
3. para cada linha de **player prop**, casa o jogador (por `player_id`/nome) e pega o `stat_field`
   do mercado (`MARKETS[market_type].stat_field`); `resultado = (valorReal > linha) ? 1 : 0` (over);
4. para **mercado de partida**, deriva do placar/escanteios do `/events/{id}/stats/`;
5. grava `resultado` (e `clv` se houver odd de fechamento).
> Mapa `market_type → stat_field`: `MARKETS` em `src/model/markets.ts:21`. Desarmes usa `total_tackle`
> **(ver ficha I8 — confirmar se a casa liquida `total_tackle` ou `won_tackle`; o settle DEVE usar a
> mesma definição da casa).**

**Passo 3 — snapshot de fechamento (CLV).**
- **Mercado de partida:** CLI que, perto do kickoff, lê `client.eventOdds(eventId)` e chama
  `snapshotClosing(...)` com a odd de fechamento → CLV automático.
- **Player prop:** BSD não dá odd → `snapshotClosing` recebe a odd colada manualmente (a última
  odd vista antes do jogo). Documentar no fluxo de coleta de odds (tabela `odds`).

**Passo 4 — relatório de calibração/CLV.** CLI/função que lê `paper_ledger` com `resultado != null`
e imprime por `market_type`: n, **Brier** = média((prob_modelo − resultado)²), **ECE** (bucketizado),
**CLV médio** = média(clv), e BrierSkill vs baseline. Reusar utilitários de calibração existentes se
houver em `test/`/`scripts/` (procurar `Brier`/`ECE`).

**Ports & Adapters:** toda a lógica de settle/relatório é pura sobre dados já buscados; o I/O (BSD,
Supabase) entra por `client`/`repo` injetados (como no resto). Testar com `InMemoryRepo` + fakes.

## 7. Plano de validação
Este item **é** a validação — mas precisa ser provado que funciona:
- **Teste unitário do settle:** dado um `eventPlayerStats` fake e linhas no `InMemoryRepo`, o
  `resultado` calculado bate com `valorReal > linha`.
- **Teste do relatório:** dado um ledger com `resultado` conhecido, Brier/ECE/CLV batem com cálculo à mão.
- **Critério de aceite:** rodar uma análise real de um jogo da Copa → ledger recebe linhas; após o
  jogo, settle preenche `resultado`; relatório imprime as métricas. Acumular ao longo da Copa.

## 8. Riscos & armadilhas
- **Duplicação:** `unique(...)` + `insert` quebra na re-análise → usar upsert idempotente.
- **`updateClosing` acopla odd+resultado:** player prop não tem odd de fechamento automática →
  precisa de caminho de settle só-resultado. Não force uma odd fictícia (corromperia o CLV).
- **Casamento de jogador no settle:** o ledger guarda `jogador` (nome) e a análise tem `player_id`;
  o settle deve casar de forma robusta (preferir `player_id`; cair para nome normalizado).
- **CLV de player prop é manual** — deixe explícito; não invente fechamento.
- **Não filtrar por "prob alta"** ao escolher o que registrar: registre por `edge>0`, não por prob.

## 9. Dependências
- **N1** (define "apostado/recomendado" = titularidade confirmada).
- **I8** (define qual stat o settle de desarme lê).
- Para CLV de partida: **N4** (leitura de `eventOdds`).

## 10. Esforço estimado
Médio: ~1 dia para gravar no fluxo manual + settle de player prop + relatório básico; +0.5 dia para
snapshot de fechamento (partida automático, prop manual).

## 11. Checklist de aceite
- [ ] `analyzeManual` grava no `paper_ledger` (upsert idempotente) as linhas com `edge>0`.
- [ ] CLI `settle` preenche `resultado` lendo `/events/{id}/player-stats/` (e placar p/ partida).
- [ ] CLI `snapshot-closing` preenche `odd_fechamento`/`clv` (partida automático; prop manual).
- [ ] Relatório imprime n/Brier/ECE/CLV por `market_type`.
- [ ] Testes Vitest cobrindo settle e relatório com fakes; `npm test` verde.
- [ ] `docs/ROADMAP.md` atualizado (loop forward ativo).

## 12. Como verificar
```bash
npm test                                  # suíte verde (settle/relatório)
# após um jogo da Copa finalizar, rodar o settle e conferir o ledger:
```
```sql
-- Supabase MCP (execute_sql)
select market_type, count(*) n,
       avg((prob_modelo - resultado)*(prob_modelo - resultado)) brier,
       avg(clv) clv_medio
from paper_ledger where resultado is not null group by market_type;
```
```bash
# sondar player-stats pós-jogo (settle automático) — usa BZZOIRO_API_KEY do .env:
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/8287/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(j.count, j.player_stats?.[0]?.total_tackle))'
```
