# Spec — Agendador 24h de coleta/validação (Copa 2026)

**Data:** 2026-06-22 · **Status:** aprovado (dono autorizou seguir até a implementação) · **Arena:** Copa (liga 27)

## Objetivo

Deixar o backend rodando local 24h e, **sozinho**, acumular o máximo de dado de validação
**limpo** (enriquecer ≠ poluir): fotografar odds nos momentos que movem a linha, logar previsões
de gols/vitória (forward, $0), liquidar jogos terminados — tudo **timed ao kickoff de cada jogo**.
Sem gastar tokens de Claude e sem gastar OpenRouter (IA segue manual). Money-path e gate de
paridade **intactos** — o agendador só orquestra chamadas a serviços que já existem.

## Doutrina respeitada

- A IA **não** roda automática (sem custo, e recomendação fica presa à escalação confirmada).
- O agendador **não calcula probabilidade** nem grava aposta de valor; só coleta dado e roda
  forwardLog/settle (papel, sem dinheiro). CLV/validação seguem **derivados na leitura**.
- Só Copa por enquanto (foco do dono). Ligas de clube depois, via config.

## Arquitetura (Ports & Adapters)

Módulo novo `src/scheduler/`, núcleo **PURO** (testável) + casca **ADAPTER** (timers/rede):

- **`plan.ts` (PURO)**
  - `upcomingGames(events, now, horizonH, leagueIds)` → jogos elegíveis (Copa, sem placeholder,
    kickoff em `[now, now+horizon]`), com `{ event_id, jogo, kickoff }`.
  - `computeSchedule(games, now, config)` → lista de `Job` com horário-de-disparo **absoluto**.
    Pula marcos já passados (jogo descoberto < 6h do kickoff agenda só os marcos futuros).
- **`lineupWatch.ts` (PURO)** — `detectFlip(prev, curr)` → `true` quando vira `predicted→confirmed`
  (a foto do salto). `prev` vem do diário/estado em memória.
- **`runner.ts` (ADAPTER)** — o daemon. Tudo injetado (`collectFn`, `forwardLogFn`, `settleFn`,
  `discoverFn`, `lineupStatusFn`, `runLogger`, `clock`) → testável com fakes + fake timers.
  - **Fila serializada de 1 worker** p/ toda coleta (lição do headless: `page.goto` concorrente
    colidia). forwardLog/settle/discover não usam navegador → fora da fila de coleta.
  - **Sem dependência nova:** jobs one-shot em horário absoluto = `setTimeout`; varreduras
    periódicas = `setInterval`. (node-cron seria YAGNI.)

## Gatilho da coleta — "após a 1ª busca" (decisão do dono, 2026-06-22)

A coleta de odds só rastreia jogos que o dono **já buscou** (têm linhas em `odds`): a 1ª busca
manual = a entrada/CLV; daí o robô coleta os marcos restantes. `discover` = `upcomingGames ∩
filterEngaged(listOddsEvents)`; o `POST /coletar-odds` chama `scheduler.kick()` → o jogo entra no
rastreio na hora (sem esperar a varredura horária). Jogo nunca aberto = não coletado. **`forwardLog`
e `settle` (gols/vitória, $0) seguem GLOBAIS** (todos os jogos da Copa), fora deste filtro.

## Marcos por jogo (kickoff = K) — "enriquecer ≠ poluir"

| Marco (`mark`) | Quando | Ação |
|---|---|---|
| `base` | K−6h | `coletarOddsService` → snapshot (abertura) |
| `deriva` | K−3h | `coletarOddsService` → snapshot (drift pré-escalação) |
| `salto` | janela K−90min…K−15min | poll do **status** da escalação a cada ~10min (chamada BSD barata); na virada `predicted→confirmed` dispara **1 coleta** → captura o salto |
| `fechamento` | K−3min | `coletarOddsService` → snapshot (linha de fechamento) |

Varreduras periódicas (idempotentes, fora da fila de coleta):
- **forwardLog** (varredura 6h) — prevê gols/vitória dos jogos das próximas **72h** ($0; janela
  própria do `runForwardLog`, distinta do horizonte de coleta `SCHEDULER_HORIZON_H=30h`).
- **settle** de hora em hora — liquida qualquer jogo terminado (sem arg = todos pendentes).
- **discover** de hora em hora — re-descobre jogos da Copa e reprograma (restart-safe).

Anti-poluição: ~4–5 coletas/jogo (não contínuo) · só Copa · anti-trap + line-shop já filtram
armadilha · 1 só coleta no salto · dedup por `scheduler_runs` (não re-coleta marco já feito).

## Dado novo (migrações aplicadas 2026-06-22)

- `odds_snapshots.mark` (nullable) + `odds_snapshots.origem` (`'manual'`|`'scheduler'`, default
  `'manual'`). O agendador grava `mark` e `origem='scheduler'`; o botão segue `mark=null`,
  `origem='manual'`. CLV pode usar `mark='fechamento'`/`'base'` p/ ancorar fechamento/entrada
  **sem adivinhar**; cai na inferência por tempo quando ausente (retrocompatível).
- `scheduler_runs` (tabela nova): `{ event_id?, jogo?, job_type, mark?, status, detalhe jsonb,
  criado_em }`. Diário de bordo: auditoria + dedup restart-safe + fonte do `/scheduler/status`.

`odds` e `analises` ficam como estão (já completas; mexer = poluir).

## Refactor alvo (servir o agendador sem duplicar)

Extrair o miolo de `src/cli/forwardLog.ts` e `src/cli/settle.ts` p/ funções-lib reusáveis
(`runForwardLog(client, repo, sp, ids?)`, `runSettle(client, repo, ids?)`) em `src/backtest/`
(ou `src/scheduler/jobs.ts`). Os CLIs viram cascas finas que chamam a lib. O daemon **chama a
função** (mesma conexão/processo), não faz `npx` filho.

## Wiring & observabilidade

- Daemon sobe em `src/api/server.ts` **após** `listen` (vive enquanto o backend está no ar).
  Flag `SCHEDULER_ENABLED` (default ligado em `npm run dev`; **off** nos testes — não sobem server).
- `GET /scheduler/status` → próximos disparos (memória) + últimos N `scheduler_runs` (banco).
- **Painel "Agendador" no front** (pequeno, só-leitura) lendo esse endpoint — o dono é leigo e
  precisa **ver que está vivo** sem ler log. Mostra: jogos agendados, próximo marco, últimas
  execuções (verde/vermelho).
- Restart seguro: re-descobre + reprograma; snapshots append-only; dedup via `scheduler_runs`.

## Config (env, defaults sãos)

`SCHEDULER_ENABLED=true` · `SCHEDULER_LEAGUES=27` · `SCHEDULER_HORIZON_H=30` ·
offsets dos marcos = constantes no `plan.ts`.

## Portas (específicas, fora de 3000/3001/5173/8080)

- Backend **5926** (default novo no `server.ts`; `PORT` env ainda sobrepõe).
- Frontend **5927** (`next dev -p 5927`).
- `lib/api.ts` default → `http://localhost:5926`. Atualizar refs a 3001 em `CLAUDE.md`/`CORE.md`/docs.
- CORS já é `*`.

## Fora de escopo (honesto)

- **CLV de mercado de partida via odds da BSD** (Fase 2 do runbook) segue pendente (bloqueio de
  shape do `/events/{id}/odds/`). O agendador captura o que as **casas** dão; gols/vitória seguem
  em calibração $0 via forwardLog.
- Sem auto-IA, sem ligas de clube (ambos por env quando virar).

## Testes (TDD)

- `plan.ts`: `upcomingGames` (filtra placeholder/horizonte/liga), `computeSchedule` (marcos
  certos, pula passados, ordena por tempo). 100% unit.
- `lineupWatch.ts`: `detectFlip` (todas as transições). 100% unit.
- `jobs.ts` (runForwardLog/runSettle): com fakes (client/repo InMemory). Espelha os CLIs.
- `runner.ts`: fila serializada (2 coletas não concorrem), disparo por horário (fake timers),
  dedup via runLogger fake, erro em 1 job não derruba o daemon.
- Gate de paridade roda intacto (não toco model/value).

## Critério de pronto

`npm test` verde (backend) + `npm test` verde (front) + `npm run typecheck` + gate de paridade +
backend sobe em 5926 + front em 5927 + `GET /scheduler/status` responde + CORE/CLAUDE atualizados.
