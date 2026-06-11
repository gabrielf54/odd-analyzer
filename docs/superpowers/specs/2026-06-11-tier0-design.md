# Tier 0 — Pré-requisitos para dinheiro real na Copa 2026 (design)

> **Data:** 2026-06-11 (abertura da Copa). **Origem:** brainstorming sobre `docs/proximos-passos/tiers/tier-0-pre-requisitos/`.
> **Meta:** habilitar indicações **confiáveis** (não mais belas — honestas) para dinheiro real, hoje.

## 0. O que este trabalho é — e o que NÃO é

Tier 0 **não melhora o número** (`prob_modelo`/`edge`). Ele:
1. **alinha o alvo** do desarme com o que a casa paga (I8),
2. **impede a perda burra** de recomendar quem fica no banco (N1),
3. **passa a medir** se o número acerta na população de seleção (I7).

Sem isso as indicações são fé cega. A melhora de qualidade do número é Tier 1/2 (fora deste escopo).

## 1. Decisões travadas (brainstorming 2026-06-11)

- **Casa:** bet365 + betano (odds via scraping externo, alternando).
- **I8:** a casa liquida desarme por **ganhos** (`won_tackle`), não tentados (`total_tackle`) — confirmado por pesquisa (bet365/SkyBet/PaddyPower/WillHill, todas Opta-fed, "settle based on Tackles Won"). **Recalibrar o modelo para `won_tackle` (abordagem A1):** re-derivar priors/baselines e **validar Brier/ECE na população de seleção**.
- **Descoberta-chave:** o gate de paridade (`test/parity/parity.test.ts`) testa **funções puras** com `mu` hardcoded — **não lê `stat_field`**. Trocar o stat do desarme **não quebra a golden**. O custo do I8 é re-derivar priors + revalidar calibração, não re-congelar paridade.
- **I7 — ledger:** gravar **todos os `edge>0`** (calibração precisa de muitos pontos); "apostado/CLV" é o subconjunto liberado pelo N1.
- **N1 — flag:** `pendente_lineup: true` (nível jogo) + `pronto_para_apostar: boolean` (por candidato). Análise provisória ainda aparece; só não crava recomendado.
- **N1 — modo "só confirmados":** parâmetro em `Cuts`, **default OFF**.
- **I7 — settle:** novo `settleResult(...)` sem exigir odd de fechamento; desarme lê **`won_tackle`** (coerente com I8).
- **Estrutura:** 1 spec, planos sequenciados **I8 → N1 → I7**, commit/checkpoint por frente. Check no `docs/proximos-passos/README.md` no fim.

## 2. Princípios que este design respeita

(do `CLAUDE.md` / README do tier) Valor = `prob_modelo > prob_devig`; IA não calcula número; validação-primeiro; Ports & Adapters (domínio não importa express/supabase/fetch); nomes em inglês no código, snake_case PT no fio; gate de paridade 1e-9 intacto; `npm test` verde.

---

## 3. Frente I8 — Desarme em `won_tackle` (modelar e liquidar o que a casa paga)

### 3.1 Mudanças no money-path
- `src/model/markets.ts:35` — `desarmes.stat_field: "total_tackle"` → **`"won_tackle"`**. `label` e `eixo_concessao` continuam "Desarmes"/"desarmes_concedidos_por_jogo" (a *definição* muda, o rótulo leigo não).
- `src/model/markets.ts` — `desarmes.prior_rate` e `concede_baseline`/`concede_baseline_nacional` **re-derivados** para won (ganhos < tentados → valores menores). Valores vêm da §3.3.
- **Eixo de concessão de time:** `src/providers/stats.ts` `TEAM_STAT_FIELD.total_tackle = "total_tackles"` é a definição "total". O team `/stats/` traz `tackles_won` como **percentual** (ex.: 75), não contagem → **não usar como eixo**. Em vez disso, derivar "won-tackles concedidos/jogo" do adversário **somando `won_tackle` dos jogadores** (campo de jogador, contagem limpa) por jogo. Implementar como caminho específico para `won_tackle` em `teamConceded`/`teamRate` (ou helper dedicado), preservando o caminho atual para os demais mercados.

### 3.2 Por que a paridade não quebra
`golden.count` guarda tuplas `{mu, line, r, prob}` e testa `probOverLine(mu, line, r)`. O `stat_field` só decide **qual coluna do player-stats vira `mu` lá em cima** no provider — não toca a função pura. Logo a golden segue válida; nenhum re-freeze. (Confirmado lendo `test/parity/parity.test.ts:20-25`.)

### 3.3 Recalibração (A1) — como derivar e validar
- **Harness:** `src/backtest/calibration.ts` já tem `brierScore`, `expectedCalibrationError`, `brierSkillScore`, `logLoss`, `reliabilityBins`. Há scripts `.mts` de backtest (`scripts/backtest-tilt.mts`) como molde.
- **Dados:** jogos de seleção via BSD (ligas nacionais 31/58-67; exemplos em `docs/apis/bsd-bzzoiro/examples/wc_intl_finished_playerstats_*.json`). Usar `won_tackle` por jogador como actual.
- **Derivar:** `prior_rate` (won/90 médio na população), `concede_baseline_nacional` (won-tackles concedidos/jogo médio entre seleções). `concede_baseline` (clube) pode herdar a mesma razão won/total observada se não houver re-backtest de clube — documentar.
- **Validar (critério de aceite):** num backtest leave-one-out de seleção em `won_tackle`, **BrierSkill > 0** e ECE não pior que o do `total_tackle` atual de forma material (≤ +5% relativo). Se falhar → desarme **não** vai a dinheiro real (selar como gols), registrar no ROADMAP.

### 3.4 Verificação empírica (antes de recalibrar)
Sondar 1-2 jogos finalizados reais (`/events/{id}/player-stats/`) e confirmar `won_tackle ≤ total_tackle` e presença consistente. (Exemplos do repo já confirmam: `won_tackle` existe por jogador; team `tackles_won` é %.)

---

## 4. Frente N1 — Gate de lineup confirmado

### 4.1 Bugs confirmados no código
- `src/providers/stats.ts:195` — `xi_confirmado = xiTeamIds.size>0 ? has : true` → pré-lineup **todos `true`**.
- `src/candidates/filter.ts:29` — corta `"titular"` só se `xi_confirmado !== true` → pré-lineup **ninguém cortado**.
- `src/candidates/rank.ts:39` — estrela vai pro 1º **sem `alerta_minutos`**, **ignora `titularidade`** → crava recomendado num "provavel".
- `src/manual/analyze.ts:122-124` — `titularidade = xiTeamIds.size>0 ? (...) : "provavel"`.

### 4.2 Mudanças
- **`rank.ts` — `recomendado` consciente de titularidade:** estrela só para `titularidade === "confirmado"` **e** sem `alerta_minutos`. Se ninguém confirmado → **nenhum** `recomendado=true`. Não remove ninguém da lista (apresentação).
- **Fio (snake_case PT):** `result.pendente_lineup: boolean` (true quando `xiTeamIds` vazio / `lineup_status != "confirmed"`); por candidato `pronto_para_apostar: boolean` (= `titularidade==="confirmado"` && sem `alerta_minutos`).
- **`Cuts` — modo "só confirmados":** novo campo opcional (ex.: `exigir_confirmado?: boolean`, default `false`) em `src/candidates/filter.ts`; quando ligado, corta `"titular"` se `titularidade !== "confirmado"` (não o `xi_confirmado` default-true).
- **NÃO** mudar `xi_confirmado` default para `false` cego (cortaria todos pré-lineup e mataria a análise provisória). A correção separa *mostrar análise* (mantém) de *recomendar/apostar* (bloqueia até confirmar).

### 4.3 `lineup_status`
Confirmar valores possíveis na Copa (`/events/{id}/lineups/` retornou `lineup_status` + `beta`). Saber quando vira `"confirmed"` (~1h antes) e se há estado intermediário. Documentar.

---

## 5. Frente I7 — Loop de validação forward

### 5.1 Gravar no ledger (fluxo manual)
- `src/manual/analyze.ts` (~:94, após review) — gravar `repo.saveLedger(rows)` com **todos os `edge>0`**: `{event_id, jogador, linha, market_type, odd_flag, prob_modelo, prob_devig, edge, ev}`. O flag de "apostado" é implícito: `recomendado===true` && `pronto_para_apostar` (N1).
- **Idempotência:** `unique(event_id,jogador,linha,market_type)`. `SupabaseRepo.saveLedger` usa `insert` → trocar por **upsert** com `onConflict`. `InMemoryRepo.saveLedger` (push) → ajustar para dedup por chave (não duplicar em re-análise).

### 5.2 Settle por resultado (sem exigir odd de fechamento)
- **Repo:** novo método na interface `Repo` (`src/store/repo.ts:25-41`):
  `settleResult(eventId, jogador, linha, marketType, resultado): Promise<void> | void` — seta `resultado` (e mantém `clv`/`odd_fechamento` se já houver; não inventa odd). Implementar em `InMemoryRepo` e `SupabaseRepo`.
- **CLI settle** (`src/cli/settle.ts`): para um `event_id` finalizado — lê ledger do evento; busca `client.eventPlayerStats(eventId)`; para player prop casa jogador (preferir `player_id`, cair p/ nome normalizado) e lê `MARKETS[market_type].stat_field` (**desarme = `won_tackle`**); `resultado = valorReal > linha ? 1 : 0`; para mercado de partida deriva do placar/escanteios (`/events/{id}/stats/`). Grava via `settleResult`.

### 5.3 Snapshot de fechamento (CLV)
- **CLI `snapshot-closing`** (`src/cli/snapshotClosing.ts`): mercado de partida → lê `client.eventOdds` e chama `snapshotClosing(...)` (CLV automático). Player prop → recebe a odd colada manual (última vista) e chama `snapshotClosing(...)`. Não inventar fechamento.

### 5.4 Relatório de calibração/CLV
- **CLI `report`** (`src/cli/report.ts` ou função pura + thin CLI): lê `paper_ledger` com `resultado != null`; por `market_type` imprime `n`, **Brier**, **ECE**, **CLV médio**, **BrierSkill**. **Reusa `src/backtest/calibration.ts`** (não reimplementar). Lógica pura testável com `InMemoryRepo`.

### 5.5 Ports & Adapters
Settle/relatório são puros sobre dados já buscados; I/O (BSD, Supabase) entra por `client`/`repo` injetados. Testes com `InMemoryRepo` + fakes, offline.

---

## 6. Arquitetura e isolamento

- **Domínio puro inalterado em forma** (só valores de params do desarme mudam): `model/`, `value/`, `candidates/`.
- **Novos artefatos isolados:** `src/cli/settle.ts`, `src/cli/snapshotClosing.ts`, `src/cli/report.ts` (thin, orquestram repo+client+funções puras); função pura de relatório em `src/backtest/` (ou `src/store/`), testável sem I/O.
- **Repo** ganha 1 método (`settleResult`) — interface + 2 impls.
- **Contrato no fio** (snake_case PT, novos): `pendente_lineup`, `pronto_para_apostar`. Ledger/relatório usam as chaves já existentes do schema.

## 7. Plano de validação (por frente)

| Frente | Como provar | Critério de aceite |
|---|---|---|
| I8 | backtest leave-one-out won_tackle na seleção (harness existente) | BrierSkill>0 e ECE ≤ +5% rel. vs total_tackle; senão selar desarme |
| I8 | paridade | `test/parity` **verde sem mudança** (prova que stat_field não toca a golden) |
| N1 | testes comportamentais (`test/manualAnalyze.test.ts`) | pré-lineup: `pendente_lineup=true`, nenhum `recomendado`; pós-confirmação: só confirmado é recomendado, fora-do-XI cortado por "titular"; `prob_modelo`/`edge`/`ev` inalterados |
| I7 | unit settle + relatório com fakes | `resultado` = `valorReal>linha`; Brier/ECE/CLV batem com cálculo à mão; upsert idempotente (re-análise não duplica) |
| I7 | e2e | análise real de jogo da Copa → ledger recebe linhas; settle pós-jogo preenche `resultado`; relatório imprime métricas |

## 8. Riscos & armadilhas

- **I8 recalibração pode reprovar** won_tackle na seleção → desarme não vai a dinheiro real (decisão honesta, não forçar).
- **Eixo de concessão won:** team `tackles_won` é %, não conta → derivar de player won_tackle; validar que a soma faz sentido (não dobrar contagem).
- **Idempotência do ledger:** `insert`→`upsert`, senão re-análise quebra no `unique`.
- **CLV de player prop é manual** (BSD não dá odd de prop) — explícito, não inventar fechamento.
- **N1 quebra testes existentes** (muda recomendado/cortado) → atualizar `test/manualAnalyze.test.ts` e testes de `rank`/`filter`.
- **Casamento de jogador no settle:** preferir `player_id`, cair p/ nome normalizado (fail-closed).
- **`won_tackle ≤ total_tackle`** sempre; sanity-check no settle.

## 9. Sequência e checkpoints

1. **I8** — verificar empírico → trocar stat → eixo de concessão won → recalibrar+validar → paridade verde → commit. (Decide o stat que o settle do I7 lê.)
2. **N1** — rank/flag/Cuts + testes comportamentais → commit. (Define "apostado" = confirmado.)
3. **I7** — saveLedger no manual (upsert) → settleResult → CLIs settle/snapshot/report → testes → commit. (Consome N1/I8.)
4. **Fechamento** — marcar check no `docs/proximos-passos/README.md` (Tier 0); atualizar `docs/ROADMAP.md` + `docs/PITCH.md` (loop forward ativo, desarme=won_tackle, recalibração documentada). Atualizar `src/store/schema.sql` se mudar algo.

N1 e I7 podem sobrepor; I8 antes (decide o stat do settle).

## 10. Fora de escopo (não fazer agora)

Tier 1/2 (de-vig honesto one-sided I1, dossiê IA enriquecido I5, odds BSD de partida N4, matchup direcional I2, novos mercados I3, mismatch N5, prior por força de liga N2, 2ª chamada IA I6). Validação offline de seleção como item próprio (a recalibração do I8 já faz um recorte disso para desarme; generalizar fica para depois).
