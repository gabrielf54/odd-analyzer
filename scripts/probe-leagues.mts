// Confirma os ids das ligas de CLUBE (Brasileirão, La Liga, Bundesliga, Ligue 1,
// Liga Portugal, Eredivisie, EPL) e checa se têm eventos finished com player-stats.
// Uso: npx tsx scripts/probe-leagues.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { diskCachedGet } from "./lib/diskCache.mts";

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

const WANT = /brasileir|la liga|laliga|bundesliga|ligue 1|primeira|liga portugal|eredivisie|premier/i;

const data = await client.leagues({});
const rows: any[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
console.log(`total ligas: ${rows.length}`);
for (const lg of rows) {
  const name = String(lg.name ?? lg.league_name ?? "");
  if (WANT.test(name)) {
    console.log(`id=${lg.id}  name="${name}"  country=${lg.country ?? lg.country_name ?? "?"}  season=${lg.season_id ?? lg.current_season_id ?? "?"}`);
  }
}

// Para alguns candidatos, conta eventos finished + se o 1º tem player-stats.
const CANDIDATES = [9, 3, 5, 6, 2, 10, 1, 4, 7, 8];
console.log(`\n--- sanidade de eventos finished + player-stats por id candidato ---`);
for (const id of CANDIDATES) {
  let evs: any;
  try { evs = await client.events({ league_id: id, status: "finished", limit: 5 }); } catch (e) { console.log(`id=${id}: erro ${e}`); continue; }
  const results: any[] = evs?.results ?? [];
  let psCount = 0;
  if (results[0]) {
    try { psCount = ((await client.eventPlayerStats(results[0].id))?.player_stats ?? []).length; } catch { /* */ }
  }
  const sample = results[0] ? `${results[0].home_team_name ?? results[0].home_team_id} x ${results[0].away_team_name ?? results[0].away_team_id}` : "—";
  console.log(`id=${id}: finished=${results.length}  player_stats_no_1o=${psCount}  ex="${sample}"`);
}
