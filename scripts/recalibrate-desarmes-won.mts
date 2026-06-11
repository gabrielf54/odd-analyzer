// Recalibra o desarme para won_tackle na população de SELEÇÃO.
// Mede prior_rate (won/90), baseline (won concedido/jogo) e calibração
// (Brier/ECE/BrierSkill) com leave-one-out anti-espiada (exclui o jogo-alvo
// do histórico do jogador). Uso: npx tsx scripts/recalibrate-desarmes-won.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { opponentMultiplier, homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 10, TARGET = 2000, LINE = 1.5, R = 3.0, PRIOR_STRENGTH = 12;
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

async function concededWonBefore(oppId: string, beforeDate: string): Promise<number | null> {
  let evs: any;
  try { evs = await client.events({ team_id: oppId, status: "finished", limit: 30 }); } catch { return null; }
  const all = (evs?.results ?? []);
  const past = (beforeDate ? all.filter((e: any) => String(e.event_date ?? "") < beforeDate) : all).slice(0, 10);
  let total = 0, games = 0;
  for (const ev of past) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const against = rows.filter((r) => r.player_id != null && String(r.team_id) !== oppId);
    if (!against.length) continue;
    games++;
    for (const r of against) total += Number(r.won_tackle ?? 0);
  }
  return games ? total / games : null;
}

// 1ª passada: amostra + estimar prior_rate_won e baseline_won
let sumWon90 = 0, nWon = 0, sumBaseline = 0, nBaseline = 0;
const samples: { games: any[]; oppId: string; evDate: string; isHome: boolean; wonRawN: number; totRawN: number }[] = [];
outer:
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const evDate = String(ev.event_date ?? "");
    const bl = await concededWonBefore(String(ev.home_team_id), evDate);
    if (bl != null) { sumBaseline += bl; nBaseline++; }
    for (const r of rows) {
      if (r.player_id == null || !(Number(r.minutes_played ?? 0) >= 60)) continue;
      const won = Number(r.won_tackle ?? 0), tot = Number(r.total_tackle ?? 0), mins = Number(r.minutes_played ?? 90);
      sumWon90 += (won * 90) / mins; nWon++;
      const isHome = String(r.team_id) === String(ev.home_team_id);
      const oppId = String(isHome ? ev.away_team_id : ev.home_team_id);
      let hist: any;
      try { hist = await client.playerStats(r.player_id); } catch { continue; }
      const games = [...(hist?.results ?? [])].reverse().filter((g: any) => String(g.event_id) !== String(ev.id));
      if (games.length < 10) continue;
      samples.push({ games, oppId, evDate, isHome, wonRawN: won, totRawN: tot });
    }
    console.error(`liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}
const priorWon = nWon ? sumWon90 / nWon : 0.8;
const baselineWon = nBaseline ? sumBaseline / nBaseline : 10.0;
console.log(`\nprior_rate_won≈${priorWon.toFixed(3)}  baseline_won≈${baselineWon.toFixed(2)}  (nWon=${nWon}, nBaseline=${nBaseline})\n`);

// 2ª passada: calibração leave-one-out por LINHA (won precisa de linha menor).
// Guarda mu por amostra (1 cálculo) e mede várias linhas + base rate.
const LINES = [0.5, 1.5, 2.5];
type Row = { muW: number | null; muWn: number | null; muT: number | null };
const rows2: Row[] = [];
for (const s of samples) {
  const oppConcW = await concededWonBefore(s.oppId, s.evDate);
  const oppMultW = oppConcW != null ? Math.max(0.7, Math.min(1.4, opponentMultiplier(oppConcW, baselineWon))) : 1.0;
  const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
  const calcW = playerMuFromGames(s.games, "won_tackle", priorWon, PRIOR_STRENGTH, oppMultW, ha, 90);
  const calcWn = playerMuFromGames(s.games, "won_tackle", priorWon, PRIOR_STRENGTH, 1.0, ha, 90);
  const calcT = playerMuFromGames(s.games, "total_tackle", 1.3, PRIOR_STRENGTH, 1.0, ha, 90);
  rows2.push({ muW: calcW?.mu ?? null, muWn: calcWn?.mu ?? null, muT: calcT?.mu ?? null });
}
function rep(tag: string, p: number[], a: number[]) {
  if (!p.length) { console.log(`  ${tag}: sem dados`); return; }
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`  ${tag} (n=${p.length}): base=${base.toFixed(3)} Brier=${brierScore(p, a).toFixed(4)} ECE=${expectedCalibrationError(p, a).toFixed(4)} BrierSkill=${brierSkillScore(p, a).toFixed(4)}`);
}
console.log("");
for (const L of LINES) {
  console.log(`over ${L}:`);
  const pW: number[] = [], aW: number[] = [], pWn: number[] = [], aWn: number[] = [], pT: number[] = [], aT: number[] = [];
  for (let i = 0; i < rows2.length; i++) {
    const r = rows2[i]!, s = samples[i]!;
    if (r.muW != null) { pW.push(probOverLine(r.muW, L, R)); aW.push((s.wonRawN ?? 0) > L ? 1 : 0); }
    if (r.muWn != null) { pWn.push(probOverLine(r.muWn, L, R)); aWn.push((s.wonRawN ?? 0) > L ? 1 : 0); }
    if (r.muT != null) { pT.push(probOverLine(r.muT, L, R)); aT.push((s.totRawN ?? 0) > L ? 1 : 0); }
  }
  rep("won_tackle (oppMult real)", pW, aW);
  rep("won_tackle (oppMult NEUTRO)", pWn, aWn);
  rep("total_tackle(ref)", pT, aT);
}
