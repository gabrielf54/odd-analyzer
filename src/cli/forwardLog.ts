// LOOP FORWARD (passo 1 — calibração): loga a PREVISÃO do modelo (gols/vitória, via
// ratings de força) dos jogos QUE VÊM no paper_ledger, ANTES de serem jogados. Sem
// odds → mede só calibração (Brier/ECE). CLV vem quando as odds entrarem (fase 2).
// Liquidação depois: `src/cli/settle.ts`. Relatório: `src/cli/report.ts`.
//
// Sem arg → jogos da Copa (liga 27) que começam nas próximas 72h. Com args → esses
// event_ids. CASCA FINA: o miolo vive em src/scheduler/jobs.ts (o agendador 24h chama a
// mesma função). Uso: npx tsx src/cli/forwardLog.ts [event_id...]
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { BSDStatsProvider } from "../providers/stats.js";
import { runForwardLog } from "../scheduler/jobs.js";

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const repo = await createSupabaseRepo();
const sp = new BSDStatsProvider(client);

const ids = process.argv.slice(2);
console.log(`forwardLog: ${ids.length ? `${ids.length} jogo(s) explícito(s)` : "Copa, próximas 72h"}`);
const { logged } = await runForwardLog(client, repo, sp, ids.length ? ids : undefined, (m) => console.log(`  ${m}`));
console.log(`\ntotal: ${logged} previsões logadas (upsert idempotente). Sem odds → calibração; rode settle.ts após os jogos e report.ts p/ o veredito.`);
