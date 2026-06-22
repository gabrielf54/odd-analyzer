# CLV por histórico imutável + escalação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execução inline).
> Steps usam checkbox para tracking. Spec: `docs/superpowers/specs/2026-06-22-clv-snapshots-escalacao-design.md`.

**Goal:** Desacoplar CLV da coleta (histórico imutável de odds) e torná-lo ciente da
escalação, com recomendação de timing — sem tocar o money-path.

**Architecture:** `odds_snapshots` append-only por coleta → `computeClvSegments` (puro,
segmenta entrada/escalação/fechamento) → `lineupEdge`+recomendação → `clvService`/endpoint
→ aba só-leitura no front. Remove a captura-por-gatilho (gambiarra).

**Tech Stack:** Node/TS, Vitest (TDD), Supabase (MCP apply_migration), Express, Next (front).

---

### Task A: Tabela `odds_snapshots` + repo append/get

**Files:**
- Modify: `src/store/schema.sql` (nova tabela), `src/store/repo.ts` (interface + InMemory + Supabase)
- Migration: MCP `apply_migration` `create_odds_snapshots`
- Test: `test/oddsSnapshots.test.ts`

- [ ] **A1** Teste (RED): `InMemoryRepo.appendOddsSnapshot(eventId, rows)` acrescenta (não
  sobrescreve) e `getOddsSnapshots(eventId)` devolve em ordem de `coletado_em`. Dois appends
  da MESMA linha → 2 retratos.
- [ ] **A2** Rodar → falha (métodos não existem).
- [ ] **A3** Implementar: interface `appendOddsSnapshot(eventId, rows: OddsSnapshotRow[])` +
  `getOddsSnapshots(eventId): OddsSnapshotRow[]`. InMemory: array append. Supabase: `insert`
  (append) + `select ... order(coletado_em)`. Tipo `OddsSnapshotRow` = {entidade_norm, entidade,
  market_type, linha, odd_over, odd_under, book, lineup_status, coletado_em}.
- [ ] **A4** Rodar → passa. **A5** Migração `create_odds_snapshots` + refletir schema.sql +
  `get_advisors`. **A6** Commit.

### Task B: Append na coleta + REMOVER a gambiarra

**Files:** Modify `src/service.ts` (3 hooks), `src/api/app.ts` (tira endpoint), `src/store/repo.ts`
(tira `applyClosingUpdates`), del `src/backtest/clvCapture.ts` parte de capture. Test: `test/clvCapture.test.ts` (ajusta).

- [ ] **B1** Teste (RED): após `saveOddsService`, `getOddsSnapshots` tem 1 retrato com o
  `lineup_status` do evento; re-salvar → 2 retratos. E `capturarFechamentoService` não existe mais.
- [ ] **B2** Rodar → falha. **B3** Implementar: nova `appendSnapshotFromUnified(repo, eventId,
  lineupStatus)` (lê odds_unificadas, append). Chamar em saveOdds/coletar/unificar **no lugar** de
  `capturarFechamentoService`. Remover `capturarFechamentoService`, `applyClosingUpdates`, endpoint
  `POST /capturar-fechamento`, `computeClosingUpdates`. `lineup_status` vem do evento BSD (normalizeEvent).
- [ ] **B4** Rodar → passa (ajustar testes antigos de clvCapture). **B5** Commit.

### Task C: `computeClvSegments` (puro, segmentado pela escalação)

**Files:** Create `src/backtest/clvSegments.ts`. Test: `test/clvSegments.test.ts`.

- [ ] **C1** Teste (RED): dados retratos de UMA linha com `coletado_em`/`lineup_status`/`odd_over`,
  `entryTime`, `kickoff` → `{pre_escalacao, salto_escalacao, pos_escalacao, total, marcos}`.
  Cenários: (a) série completa pred→pred→conf→conf: salto = oddUltimoPre/oddPrimeiroPos−1, total =
  oddEntrada/oddFechamento−1; (b) sem `confirmed` ainda → salto/pos = null, total parcial até o
  último; (c) retrato após kickoff é ignorado no fechamento.
- [ ] **C2** Rodar → falha. **C3** Implementar `computeClvSegments(snaps, entryTime, kickoff)`:
  ordena por tempo; entrada = último ≤ entryTime (ou 1º); fechamento = último < kickoff; ultimoPre/
  primeiroPos pela virada de status; `clv(a,b)=a/b−1`; segmentos null quando falta marco; devolve marcos.
- [ ] **C4** Rodar → passa. **C5** Commit.

### Task D: `lineupEdge` + recomendação de timing (puro)

**Files:** Modify `src/backtest/clvSegments.ts` (ou novo `clvTiming.ts`). Test: `test/clvTiming.test.ts`.

- [ ] **D1** Teste (RED): `lineupEdge(saltos: number[], opts)` → {media, lo, hi, n} (reusa
  `bootstrapMetricCI`/`brierScore`? não — média simples + bootstrap da média). `recommendTiming(
  preLineup: boolean, edge)` → `"apostar_pre"` se preLineup && edge.lo>0; senão `"sem_sinal"`.
- [ ] **D2** Rodar → falha. **D3** Implementar: média dos saltos + IC bootstrap (mulberry32 de
  `validation.ts`, métrica = média). Recomendação pela regra acima (IC não cruza zero).
- [ ] **D4** Rodar → passa. **D5** Commit.

### Task E: `clvService` + endpoint `GET /jogos/:eventId/clv`

**Files:** Modify `src/service.ts` (clvService), `src/api/app.ts` (rota). Test: `test/clvCapture.test.ts`→`test/clvService.test.ts`.

- [ ] **E1** Teste (RED): com ledger (apostas flagadas, `criado_em`), snapshots (pré+pós escalação)
  e um `getEvent` fake (kickoff), `clvService(client, repo, eventId)` devolve por aposta os segmentos
  + marcos, e o resumo `lineup_edge` por mercado + recomendação. Casa por (entidade_norm, mercado, linha).
- [ ] **E2** Rodar → falha. **E3** Implementar `clvService`: lê ledger + snapshots + kickoff (BSD
  `event_date`); agrupa snapshots por linha; `computeClvSegments` por aposta; agrega `lineupEdge` por
  mercado; monta recomendação. Endpoint `GET /jogos/:eventId/clv` chama o serviço.
- [ ] **E4** Rodar → passa. **E5** Commit.

### Task F: `report.ts` usa CLV derivado

**Files:** Modify `src/cli/report.ts` (e/ou `ledgerReport`). Test: ajusta `test/ledgerReport.test.ts` se preciso.

- [ ] **F1** O `report.ts` hoje lê `r.clv` do ledger (que não é mais escrito). Trocar p/ derivar do
  histórico via `clvService` por evento liquidado (CLVm = média do `total`). Manter painel modelo×casa+IC.
- [ ] **F2** Rodar report com dado real (sanity) + `npm test`. **F3** Commit.

### Task G: Front — aba "CLV / Linha" (repo `odd-analyzer-frontend`)

**Files:** explorar o repo `C:\Users\gabri\Documents\projects\odd-analyzer-frontend` e seguir o padrão.

- [ ] **G1** Mapear a tela de jogo (componente/rotas/serviço de API).
- [ ] **G2** Serviço `getClv(eventId)` → `GET /jogos/:id/clv`.
- [ ] **G3** Aba "CLV / Linha" só-leitura: resumo (vantagem no salto + IC + n), por aposta a
  linha-do-tempo com marcos [entrada]·[escalação]·[apito], 4 números segmentados, badge de timing.
- [ ] **G4** Não tocar a tela de análise/coleta. Testar local (`npm run dev`) ou build. **G5** Commit no repo do front.

### Task H: Verificar + docs + commit final

- [ ] **H1** `npm test` (gate de paridade) + `npm run typecheck` verdes.
- [ ] **H2** CORE.md + memória (substitui o CLV-gambiarra pelo derivado/escalação) + APAGAR a pasta
  `docs/features/...` se aplicável (não há). **H3** Commit.

---

## Self-Review

- **Cobertura da spec:** §3 (A), §6+§8 (B), §4 (C), §5 (D), §6 endpoint (E), report (F), §7 front (G),
  §9/§10 (H). ✅
- **Placeholders:** nenhum "TODO/edge cases" vago; cada task tem teste/assinatura concretos.
- **Consistência de tipos:** `OddsSnapshotRow` (A) reusada em B/C/E; `computeClvSegments` (C) consumida
  por E; `lineupEdge`/`recommendTiming` (D) por E. Nomes batem.
- **Money-path:** nenhuma task toca model/value → gate de paridade intacto.
