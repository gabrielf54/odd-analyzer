// Liquida o paper_ledger de um jogo finalizado lendo /events/{id}/player-stats/.
// Player prop casa por player_id (stats-id) e usa o settle_field do mercado
// (desarme = won_tackle, o que a casa paga). Uso: npx tsx src/cli/settle.ts <event_id>
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { settlePlayerRows } from "../backtest/settle.js";

const eventId = process.argv[2];
if (!eventId) { console.error("uso: npx tsx src/cli/settle.ts <event_id>"); process.exit(1); }

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const repo = await createSupabaseRepo();

const ledger = await repo.getLedger(eventId);
if (!ledger.length) { console.log(`ledger vazio p/ evento ${eventId}`); process.exit(0); }

const playerStats = (await client.eventPlayerStats(eventId))?.player_stats ?? [];
const instr = settlePlayerRows(ledger, playerStats);

for (const i of instr) {
  await repo.settleResult(i.event_id, i.jogador, i.linha, i.market_type, i.resultado);
  console.log(`${i.jogador} ${i.market_type} ${i.linha} → resultado=${i.resultado}`);
}
const playerRows = ledger.filter((r: any) => r.player_id != null).length;
console.log(`\nliquidadas ${instr.length}/${playerRows} linhas de player prop (mercados de partida ficam de fora deste CLI).`);
