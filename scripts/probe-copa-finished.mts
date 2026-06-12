// Lista os jogos da Copa 2026 (liga 27) JÁ FINALIZADOS — id, data, placar — pra
// logar a previsão retroativa + liquidar (sanidade do loop em dado real).
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { diskCachedGet } from "./lib/diskCache.mts";

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"), { get: diskCachedGet(getRequired("BZZOIRO_API_KEY")) });
const fin = await client.events({ league_id: 27, status: "finished", limit: 150 });
const copa2026 = (fin?.results ?? []).filter((e: any) => String(e.event_date ?? "").startsWith("2026") && e.home_score != null);
console.log(`Copa 2026 finalizados: ${copa2026.length}`);
for (const e of copa2026) {
  console.log(`id=${e.id} | ${String(e.event_date).slice(0, 16)} | ${e.home_team ?? e.home_team_id} ${e.home_score}x${e.away_score} ${e.away_team ?? e.away_team_id}`);
}
console.log(`\nIDs: ${copa2026.map((e: any) => e.id).join(" ")}`);
