// Bootstrap do servidor: lê env, monta deps reais (BSD + Supabase) e sobe a API. Se
// SCHEDULER_ENABLED != "false", também sobe o agendador 24h (in-process) — coleta odds
// nos marcos do jogo + forwardLog + settle, sem Claude e sem OpenRouter.
import { createApp } from "./app.js";
import { getRequired } from "../config.js";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { BSDStatsProvider } from "../providers/stats.js";
import { SchedulerRunner, withTimeout, type RunnerDeps } from "../scheduler/runner.js";
import { upcomingGames } from "../scheduler/plan.js";
import { runForwardLog, runSettle } from "../scheduler/jobs.js";
import { coletarOddsService, lineupStatusFromLineups } from "../service.js";

function buildScheduler(client: any, repo: any): SchedulerRunner {
  const leagues = (process.env["SCHEDULER_LEAGUES"] ?? "27").split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  const horizonH = Number(process.env["SCHEDULER_HORIZON_H"] ?? 30);
  const sp = new BSDStatsProvider(client);

  const deps: RunnerDeps = {
    discover: async () => {
      const all: any[] = [];
      for (const lg of leagues) {
        const data = await client.events({ league_id: lg, status: "notstarted", limit: 200 });
        all.push(...(data?.results ?? []));
      }
      const upcoming = upcomingGames(all, new Date(), horizonH, leagues);
      // Gatilho "após a 1ª busca": só rastreia odds dos jogos que o dono JÁ BUSCOU (têm
      // linhas em `odds`). Checagem DIRECIONADA por jogo (hasOdds, indexada) — não usar
      // listOddsEvents, que estoura o cap de 1000 do PostgREST com 56k+ linhas e some com
      // os jogos (bug do França 8328). São poucos jogos na janela → poucas queries baratas.
      // forwardLog/settle (gols/vitória, $0) seguem GLOBAIS, fora deste filtro.
      const engaged: typeof upcoming = [];
      for (const g of upcoming) if (await repo.hasOdds(g.event_id)) engaged.push(g);
      return engaged;
    },
    collect: async (eventId, mark) => {
      const { makeFetchers } = await import("../cli/fetchers.js");
      const fetchers = await makeFetchers();
      try {
        // timeout MENOR que o do runner (180s) → no hang, abortamos aqui e o finally FECHA o
        // browser (evita Chromium zumbi acumulando em dias de execução).
        const res = await withTimeout(
          coletarOddsService(client, repo, eventId, fetchers, {
            snapshotOrigem: "scheduler", snapshotMark: mark,
            log: (m: string) => console.log(`[sched ${eventId}/${mark}] ${m}`),
          }),
          150_000, `coletar ${eventId}/${mark}`,
        );
        return { retratos: res.snapshot?.retratos ?? 0, lineup_status: res.snapshot?.lineup_status ?? "unknown" };
      } finally {
        try { await fetchers.close(); } catch (e) { console.error(`[sched ${eventId}] fechar headless falhou:`, e); }
      }
    },
    lineupStatus: async (eventId) => lineupStatusFromLineups(await client.lineups(eventId)),
    forwardLog: () => runForwardLog(client, repo, sp),
    settle: () => runSettle(client, repo),
    logRun: (row) => repo.appendSchedulerRun(row),
    alreadyCollected: (eventId, mark) => repo.hasSchedulerRun(eventId, mark, "collect", "ok"),
    now: () => Date.now(),
  };
  return new SchedulerRunner(deps);
}

async function main() {
  const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
  const repo = await createSupabaseRepo();

  const schedulerOn = process.env["SCHEDULER_ENABLED"] !== "false";
  const scheduler = schedulerOn ? buildScheduler(client, repo) : undefined;

  const app = createApp({ client, repo, scheduler });
  const port = Number(process.env["PORT"] ?? 5926);
  app.listen(port, () => console.log(`odd-analyzer API ouvindo em http://localhost:${port}`));

  if (scheduler) {
    scheduler.start();
    console.log("agendador 24h LIGADO (coleta/forwardLog/settle automáticos da Copa). SCHEDULER_ENABLED=false desliga.");
  } else {
    console.log("agendador 24h DESLIGADO (SCHEDULER_ENABLED=false).");
  }
}

main().catch((e) => {
  console.error("falha ao subir a API:", e);
  process.exit(1);
});
