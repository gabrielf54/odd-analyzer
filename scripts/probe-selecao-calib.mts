// Sonda: (1) nomes das ligas nacionais usadas na calibração de desarme,
// (2) elas têm player-stats com won/total_tackle?, (3) Copa passada está vazia?
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const NAT = [27, 31, 58, 59, 60, 61, 62, 64, 65, 66, 67];

console.log("=== (1) NOMES DAS LIGAS NACIONAIS ===");
for (const id of NAT) {
  try {
    const lg = await client.leagues({ id });
    const r = (lg?.results ?? [])[0];
    console.log(`liga ${id}: ${r?.name ?? "?"}  country=${r?.country?.name ?? r?.country ?? "?"}`);
  } catch (e: any) { console.log(`liga ${id}: ERRO ${e.message}`); }
}

console.log("\n=== (2) TEM PLAYER-STATS COM TACKLE? (1 evento finished por liga) ===");
for (const id of NAT) {
  try {
    const evs = await client.events({ league_id: id, status: "finished", limit: 5 });
    const ev = (evs?.results ?? [])[0];
    if (!ev) { console.log(`liga ${id}: 0 jogos finished`); continue; }
    const ps = (await client.eventPlayerStats(ev.id))?.player_stats ?? [];
    const comTackle = ps.filter((p: any) => p.total_tackle != null).length;
    const comWon = ps.filter((p: any) => p.won_tackle != null).length;
    const comSot = ps.filter((p: any) => p.shots_on_target != null).length;
    console.log(`liga ${id}: ev ${ev.id} "${ev.name ?? ""}" — ${ps.length} jogadores · total_tackle=${comTackle} · won_tackle=${comWon} · sot=${comSot}`);
  } catch (e: any) { console.log(`liga ${id}: ERRO ${e.message}`); }
}

console.log("\n=== (3) COPA PASSADA (liga 27, seasons 189=2022, 382=2018) TEM PLAYER-STATS? ===");
for (const season of [189, 382, 188]) {
  try {
    const evs = await client.events({ league_id: 27, season_id: season, status: "finished", limit: 50 });
    const list = evs?.results ?? [];
    let comStats = 0, total = 0;
    for (const ev of list.slice(0, 8)) {
      total++;
      try {
        const ps = (await client.eventPlayerStats(ev.id))?.player_stats ?? [];
        if (ps.some((p: any) => p.total_tackle != null)) comStats++;
      } catch { /* 404 */ }
    }
    console.log(`season ${season}: ${list.length} jogos finished; dos ${total} testados, ${comStats} têm player-stats com tackle`);
  } catch (e: any) { console.log(`season ${season}: ERRO ${e.message}`); }
}
