// Snapshot da odd de FECHAMENTO p/ CLV. Mercado de partida: lê a odd da BSD
// automaticamente. Player prop: a BSD não dá odd → passe a odd colada manual.
// Uso:
//   partida: npx tsx src/cli/snapshotClosing.ts <event_id> partida <jogador> <linha> <market_type> [book]
//   prop:    npx tsx src/cli/snapshotClosing.ts <event_id> prop    <jogador> <linha> <market_type> <odd_fechamento>
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { matchClosingOdd } from "./snapshotClosingLib.js";

const [eventId, modo, jogador, linhaStr, marketType, extra] = process.argv.slice(2);
if (!eventId || !modo || !jogador || !linhaStr || !marketType) {
  console.error("uso: snapshotClosing <event_id> <partida|prop> <jogador> <linha> <market_type> [book|odd]");
  process.exit(1);
}
const linha = Number(linhaStr);
const repo = await createSupabaseRepo();

let closing: number | null = null;
if (modo === "prop") {
  closing = Number(extra);
  if (!Number.isFinite(closing)) { console.error("prop exige odd_fechamento numérica"); process.exit(1); }
} else {
  const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
  const odds = await client.eventOdds(eventId);
  closing = matchClosingOdd(odds, marketType!, linha, extra);
  if (closing == null) { console.error("não achei a odd de fechamento p/ esse mercado/linha na BSD"); process.exit(1); }
}

await repo.snapshotClosing(eventId, jogador!, linha, marketType!, closing!);
console.log(`fechamento ${jogador} ${marketType} ${linha} = ${closing} (CLV gravado)`);
