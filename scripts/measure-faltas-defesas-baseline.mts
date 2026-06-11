// Mede prior_rate (mediana taxa/90), concede_baseline_nacional (média do eixo de
// concessão/jogo) e o r da NB2 (variância/média) p/ fouls, saves, was_fouled, em
// jogos de seleção. Saída = constantes prontas pra colar nos specs de markets.ts.
// Uso: npx tsx scripts/measure-faltas-defesas-baseline.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 14;
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

const per90: Record<string, number[]> = { fouls: [], saves: [] };
const wasFouledPerGame: number[] = [];
const sotProducedPerGame: number[] = [];
let games = 0;

for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); }
  catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    if (rows.length === 0) continue;
    games++;
    const byTeam: Record<string, { wasFouled: number; sot: number }> = {};
    for (const r of rows) {
      const tid = String(r.team_id);
      byTeam[tid] ??= { wasFouled: 0, sot: 0 };
      byTeam[tid].wasFouled += Number(r.was_fouled ?? 0);
      byTeam[tid].sot += Number(r.shots_on_target ?? 0);
      const mins = Number(r.minutes_played ?? 0);
      if (mins >= 60) {
        per90.fouls.push(Number(r.fouls ?? 0) * 90 / mins);
        if (Number(r.saves ?? 0) > 0) per90.saves.push(Number(r.saves ?? 0) * 90 / mins);
      }
    }
    for (const t of Object.values(byTeam)) { wasFouledPerGame.push(t.wasFouled); sotProducedPerGame.push(t.sot); }
    console.error(`liga ${lg} ev ${ev.id} — ${games} jogos`);
  }
}

if (games < 50) { console.error(`ABORTADO: só ${games} jogos (mín 50)`); process.exit(1); }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const rOf = (xs: number[]) => { const m = mean(xs); const v = mean(xs.map((x) => (x - m) ** 2)); return v > m ? (m * m) / (v - m) : 999; };

console.log(`\n// Medido em ${games} jogos de seleção (ligas ${LEAGUES.join("/")}), ${new Date().toISOString().slice(0, 10)}:`);
console.log(`// FALTAS  prior_rate(mediana/90)=${median(per90.fouls).toFixed(3)}  r(var/média)=${rOf(per90.fouls).toFixed(2)}  concede_baseline_nacional(was_fouled/time/jogo)=${mean(wasFouledPerGame).toFixed(2)}`);
console.log(`// DEFESAS prior_rate(mediana/90)=${median(per90.saves).toFixed(3)}  r(var/média)=${rOf(per90.saves).toFixed(2)}  baseline_producao_sot(sot/time/jogo)=${mean(sotProducedPerGame).toFixed(2)}  (n_goleiros=${per90.saves.length})`);
