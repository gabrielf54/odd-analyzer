// Calibra SOT e FINALIZAÇÕES na população de SELEÇÃO (ligas 31,58-67: AFCON/
// amistoso/quali — único dado de seleção com player-stats; Copa passada é vazia).
// Espelha o money-path real: μ = forma do jogador (majoritariamente clube) ×
// home/away, leave-one-out anti-espiada. Roda os params ATUAIS (base EPL) e varre
// o dispersion R p/ ver se a seleção quer outro R (igual o desarme quis 2.0).
// Uso: npx tsx scripts/recalibrate-sot-fin-selecao.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 12, TARGET = 2200;
const LINES = [0.5, 1.5, 2.5];
const R_SWEEP = [2.0, 2.5, 3.0, 3.5, 4.0]; // 3.0 = base atual (EPL)
const PRIOR_STRENGTH = 12;
const MARKETS = [
  { name: "sot", field: "shots_on_target", prior: 0.4 },
  { name: "finalizacoes", field: "total_shots", prior: 1.2 },
];
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

type Sample = { games: any[]; isHome: boolean; actual: Record<string, number> };
const samples: Sample[] = [];

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
      samples.push({
        games, isHome,
        actual: { shots_on_target: Number(r.shots_on_target ?? 0), total_shots: Number(r.total_shots ?? 0) },
      });
    }
    console.error(`liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}
console.log(`\namostra total=${samples.length} (ligas de seleção 31,58-67)\n`);

function rep(tag: string, p: number[], a: number[]) {
  if (!p.length) { console.log(`    ${tag}: sem dados`); return; }
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`    ${tag}: base=${base.toFixed(3)} Brier=${brierScore(p, a).toFixed(4)} ECE=${expectedCalibrationError(p, a).toFixed(4)} BrierSkill=${brierSkillScore(p, a).toFixed(4)}`);
}

for (const mk of MARKETS) {
  console.log(`\n========== ${mk.name.toUpperCase()} (campo=${mk.field}, prior=${mk.prior}) ==========`);
  // μ neutro (oppMult=1.0) — testa o modelo de FORMA base, não matchup
  const mus = samples.map((s) => {
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, mk.field, mk.prior, PRIOR_STRENGTH, 1.0, ha, 90);
    return { mu: m?.mu ?? null, actual: s.actual[mk.field]! };
  }).filter((x) => x.mu != null) as { mu: number; actual: number }[];

  for (const L of LINES) {
    console.log(`  over ${L} (n=${mus.length}):`);
    for (const R of R_SWEEP) {
      const p: number[] = [], a: number[] = [];
      for (const x of mus) { p.push(probOverLine(x.mu, L, R)); a.push(x.actual > L ? 1 : 0); }
      rep(`R=${R.toFixed(1)}${R === 3.0 ? " (base EPL atual)" : ""}`, p, a);
    }
  }
}
