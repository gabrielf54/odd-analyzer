// Liquida o paper_ledger de um jogo finalizado. PLAYER PROP: lê /player-stats/, casa
// por player_id (stats-id) e usa o settle_field do mercado (desarme = won_tackle).
// MERCADO DE PARTIDA (gols/vitória): lê o PLACAR de /events/{id}/. Sem arg → liquida
// TODOS os jogos com linhas pendentes (resultado nulo) no ledger.
// Uso: npx tsx src/cli/settle.ts [event_id]
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { settlePlayerRows, settleMatchRows } from "../backtest/settle.js";

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const repo = await createSupabaseRepo();

// quais eventos liquidar: o arg, ou todos com linha pendente (resultado nulo)
const arg = process.argv[2];
let eventIds: string[];
if (arg) eventIds = [arg];
else {
  const all = await repo.allLedger();
  eventIds = [...new Set(all.filter((r: any) => r.resultado == null).map((r: any) => String(r.event_id)))];
  console.log(`sem arg → ${eventIds.length} evento(s) com linha pendente no ledger`);
}

let totalP = 0, totalM = 0;
for (const eventId of eventIds) {
  const ledger = await repo.getLedger(eventId);
  if (!ledger.length) { console.log(`ledger vazio p/ evento ${eventId}`); continue; }

  // player prop (via player-stats) + mercado de partida (via placar do evento)
  let playerStats: any[] = [];
  try { playerStats = (await client.eventPlayerStats(eventId))?.player_stats ?? []; } catch { /* sem stats */ }
  let ev: any = {};
  try { ev = await client.getEvent(eventId); } catch { /* sem evento */ }
  const finished = ev?.home_score != null && ev?.away_score != null;
  if (!finished) { console.log(`evento ${eventId} ainda sem placar — pula (não finalizado)`); continue; }

  const instr = [...settlePlayerRows(ledger, playerStats), ...settleMatchRows(ledger, ev)];
  for (const i of instr) {
    await repo.settleResult(i.event_id, i.jogador, i.linha, i.market_type, i.resultado);
    console.log(`[${eventId}] ${i.jogador} ${i.market_type} ${i.linha} → resultado=${i.resultado}`);
  }
  totalP += settlePlayerRows(ledger, playerStats).length;
  totalM += settleMatchRows(ledger, ev).length;
}
console.log(`\nliquidadas ${totalP} linhas de player prop + ${totalM} de partida (gols/vitória).`);
