// Backtest FINO do desarme ganho no over 2.5 (3+): varre dispersão NB (R),
// encolhimento (k) e amostra maior. Tese: o 2.5 é cauda; a dispersão calibrada
// p/ tentativas pode não servir p/ ganhos. Mede se algum (R,k) sobe o 2.5 SEM
// estragar 0.5/1.5. Decomposição: μ_ganhos = μ_tentativas × aproveitamento.
// Uso: npx tsx scripts/backtest-desarme-25-fino.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 16, TARGET = 3000, PRIOR_ATT = 1.3, PRIOR_STRENGTH = 12;
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

type Sample = { attemptsMu: number; games: any[]; won: number; isHome: boolean };
const samples: Sample[] = [];
let sumWon = 0, sumTot = 0;

outer:
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    for (const r of rows) {
      if (r.player_id == null || !(Number(r.minutes_played ?? 0) >= 60)) continue;
      const isHome = String(r.team_id) === String(ev.home_team_id);
      let hist: any;
      try { hist = await client.playerStats(r.player_id); } catch { continue; }
      const games = [...(hist?.results ?? [])].reverse().filter((g: any) => String(g.event_id) !== String(ev.id));
      if (games.length < 10) continue;
      const ha = homeAwayMultiplier(isHome, 1.08, 0.92);
      const att = playerMuFromGames(games, "total_tackle", PRIOR_ATT, PRIOR_STRENGTH, 1.0, ha, 90);
      if (!att) continue;
      sumWon += Number(r.won_tackle ?? 0); sumTot += Number(r.total_tackle ?? 0);
      samples.push({ attemptsMu: att.mu, games, won: Number(r.won_tackle ?? 0), isHome });
    }
    console.error(`liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}
const wrLeague = sumTot > 0 ? sumWon / sumTot : 0.62;
console.log(`\namostra=${samples.length}  aproveitamento médio da liga=${wrLeague.toFixed(3)}\n`);

function winRate(games: any[], k: number): number {
  let sw = 0, st = 0;
  for (const g of games) { sw += Number(g.won_tackle ?? 0); st += Number(g.total_tackle ?? 0); }
  return (sw + k * wrLeague) / (st + k);
}
function metrics(line: number, k: number, R: number) {
  const p: number[] = [], a: number[] = [];
  for (const s of samples) {
    p.push(probOverLine(s.attemptsMu * winRate(s.games, k), line, R));
    a.push(s.won > line ? 1 : 0);
  }
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  return { base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bs: brierSkillScore(p, a) };
}
function row(line: number, k: number, R: number) {
  const m = metrics(line, k, R);
  console.log(`  over ${line} k=${String(k).padStart(3)} R=${R.toFixed(1)}: base=${m.base.toFixed(3)} Brier=${m.brier.toFixed(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${m.bs.toFixed(4)}`);
}

const RS = [1.5, 2.0, 2.5, 3.0, 4.0, 6.0];
const KS = [20, 40, 80];

console.log("=== OVER 2.5 (foco): varre R e k ===");
for (const k of KS) for (const R of RS) row(2.5, k, R);

console.log("\n=== controle: 0.5 e 1.5 com os mesmos R (k=40) — não pode piorar ===");
for (const L of [0.5, 1.5]) { for (const R of RS) row(L, 40, R); }
