// Mede a participação típica de cada posição (D/M/F) no total CONCEDIDO por
// jogo, por mercado, em jogos de seleção. Saída vira constante em params.ts.
// Uso: npx tsx scripts/measure-positional-baseline.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 12;
const STAT_FIELDS = ["total_tackle", "shots_on_target", "total_shots"] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const posCache = new Map<string, string>();

async function positionOf(pid: unknown): Promise<string> {
  const key = String(pid);
  const hit = posCache.get(key);
  if (hit) return hit;
  let pos = "?";
  try { pos = String((await client.player(pid))?.position ?? "?"); } catch { /* sem posição */ }
  posCache.set(key, pos);
  await sleep(100);
  return pos;
}

const totals: Record<string, Record<string, number>> = {};
for (const f of STAT_FIELDS) totals[f] = { D: 0, M: 0, F: 0 };
let gamesUsed = 0;
let droppedRows = 0;

for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); }
  catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let ps: any;
    try { ps = await client.eventPlayerStats(ev.id); } catch { continue; }
    const rows: any[] = Array.isArray(ps?.player_stats) ? ps.player_stats : [];
    if (rows.length === 0) continue;
    gamesUsed++;
    for (const r of rows) {
      let pos: string | null = null;
      for (const f of STAT_FIELDS) {
        const v = Number(r[f] ?? 0);
        if (!(v > 0)) continue;
        pos = pos ?? await positionOf(r.player_id);
        if (pos === "D" || pos === "M" || pos === "F") {
          totals[f]![pos] = (totals[f]![pos] ?? 0) + v;
        } else {
          droppedRows++;
        }
      }
    }
    console.error(`liga ${lg} evento ${ev.id} ok (${gamesUsed} jogos acumulados)`);
  }
}

if (gamesUsed < 50) {
  console.error(`ABORTADO: só ${gamesUsed} jogos com player-stats (mínimo 50) — baseline não confiável.`);
  process.exit(1);
}

console.error(`linhas com posição fora de D/M/F (descartadas): ${droppedRows}`);

console.log(`\n// Medido em ${gamesUsed} jogos de seleção (ligas ${LEAGUES.join("/")}), ${new Date().toISOString().slice(0, 10)}:`);
for (const f of STAT_FIELDS) {
  const t = totals[f]!;
  const sum = t.D! + t.M! + t.F!;
  const share = (x: number) => (sum > 0 ? (x / sum).toFixed(3) : "0");
  console.log(`  ${f}: { D: ${share(t.D!)}, M: ${share(t.M!)}, F: ${share(t.F!)} },`);
}
