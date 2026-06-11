// Testa a DECOMPOSIÇÃO p/ desarme ganho: won = tentativas (bem previstas) ×
// taxa de aproveitamento (won/total) encolhida p/ média da liga. Compara com o
// modelo "won direto" (que reprovou). Leave-one-out anti-espiada na seleção.
// Uso: npx tsx scripts/recalibrate-desarmes-decomp.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 10, TARGET = 2000, LINES = [0.5, 1.5, 2.5], R = 3.0, PRIOR_STRENGTH = 12;
const PRIOR_ATT = 1.3;            // prior de TENTATIVAS (modelo atual, calibrado)
const K_SHRINK = [10, 20, 40];    // pseudo-tentativas p/ encolher a taxa de aproveitamento
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

type Sample = { games: any[]; isHome: boolean; wonRawN: number };
const samples: Sample[] = [];
let sumWonAll = 0, sumTotAll = 0; // p/ média da liga da taxa de aproveitamento

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
      sumWonAll += Number(r.won_tackle ?? 0); sumTotAll += Number(r.total_tackle ?? 0);
      samples.push({ games, isHome, wonRawN: Number(r.won_tackle ?? 0) });
    }
    console.error(`liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}
const wrLeague = sumTotAll > 0 ? sumWonAll / sumTotAll : 0.6;
console.log(`\namostra=${samples.length}  taxa-aproveitamento média da liga=${wrLeague.toFixed(3)}\n`);

function winRate(games: any[], k: number): number {
  let sw = 0, st = 0;
  for (const g of games) { sw += Number(g.won_tackle ?? 0); st += Number(g.total_tackle ?? 0); }
  return (sw + k * wrLeague) / (st + k); // encolhida p/ a média da liga
}
function rep(tag: string, p: number[], a: number[]) {
  if (!p.length) { console.log(`  ${tag}: sem dados`); return; }
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`  ${tag}: base=${base.toFixed(3)} Brier=${brierScore(p, a).toFixed(4)} ECE=${expectedCalibrationError(p, a).toFixed(4)} BrierSkill=${brierSkillScore(p, a).toFixed(4)}`);
}

// pré-calcula μ de tentativas (neutro) e μ won-direto por amostra
const pre = samples.map((s) => {
  const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
  const att = playerMuFromGames(s.games, "total_tackle", PRIOR_ATT, PRIOR_STRENGTH, 1.0, ha, 90);
  const won = playerMuFromGames(s.games, "won_tackle", 0.78, PRIOR_STRENGTH, 1.0, ha, 90); // direto (ref)
  return { muAtt: att?.mu ?? null, muWonDireto: won?.mu ?? null, games: s.games, wonRawN: s.wonRawN };
});

for (const L of LINES) {
  console.log(`over ${L}:`);
  // won direto (referência — o que reprovou)
  const pd: number[] = [], ad: number[] = [];
  for (const r of pre) if (r.muWonDireto != null) { pd.push(probOverLine(r.muWonDireto, L, R)); ad.push(r.wonRawN > L ? 1 : 0); }
  rep("won DIRETO (ref)", pd, ad);
  // decomposição: μ_att × taxa-aproveitamento encolhida, p/ cada K
  for (const k of K_SHRINK) {
    const pk: number[] = [], ak: number[] = [];
    for (const r of pre) {
      if (r.muAtt == null) continue;
      const muWon = r.muAtt * winRate(r.games, k);
      pk.push(probOverLine(muWon, L, R)); ak.push(r.wonRawN > L ? 1 : 0);
    }
    rep(`DECOMP att×aprov (k=${k})`, pk, ak);
  }
}
