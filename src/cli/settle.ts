// Liquida o paper_ledger de um jogo finalizado. PLAYER PROP: lê /player-stats/, casa
// por player_id (stats-id) e usa o settle_field do mercado (desarme = won_tackle).
// MERCADO DE PARTIDA (gols/vitória): lê o PLACAR de /events/{id}/. Sem arg → liquida
// TODOS os jogos com linhas pendentes (resultado nulo) no ledger.
// CASCA FINA: o miolo vive em src/scheduler/jobs.ts (o agendador 24h chama a mesma função).
// Uso: npx tsx src/cli/settle.ts [event_id]
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { runSettle } from "../scheduler/jobs.js";

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const repo = await createSupabaseRepo();

const arg = process.argv[2];
const out = await runSettle(client, repo, arg ? [arg] : undefined, (m) => console.log(m));
console.log(`\nliquidadas ${out.liquidadas_player} linhas de player prop + ${out.liquidadas_partida} de partida (gols/vitória) em ${out.eventos} evento(s).`);
