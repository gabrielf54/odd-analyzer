// Calibra FALTAS e DEFESAS na população de SELEÇÃO (ligas 31,58-67), leave-one-out
// anti-espiada (prediz o jogo-alvo só com jogos < alvo). Espelha o money-path: μ =
// forma do jogador × home/away (oppMult neutro = testa o modelo de FORMA base).
// Defesas usa o eixo de produção fora deste script (aqui mede só forma+linha).
// Uso: npx tsx scripts/recalibrate-faltas-defesas.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 14, TARGET = 1800;
const R_SWEEP = [2.0, 2.5, 3.0, 3.5, 4.0];
const PRIOR_STRENGTH = 12;
const MARKETS = [
  { name: "faltas", field: "fouls", prior: 1.0, lines: [0.5, 1.5, 2.5], minMin: 60 },
  { name: "defesas", field: "saves", prior: 3.0, lines: [1.5, 2.5, 3.5, 4.5], minMin: 60 },
];
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

type Sample = { games: any[]; isHome: boolean; field: string; actual: number };
const samplesByMarket: Record<string, Sample[]> = { faltas: [], defesas: [] };

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
      const isGK = games.some((g: any) => Number(g.saves ?? 0) > 0);
      samplesByMarket.faltas.push({ games, isHome, field: "fouls", actual: Number(r.fouls ?? 0) });
      if (isGK) samplesByMarket.defesas.push({ games, isHome, field: "saves", actual: Number(r.saves ?? 0) });
    }
    console.error(`liga ${lg} ev ${ev.id} — faltas=${samplesByMarket.faltas.length} defesas=${samplesByMarket.defesas.length}`);
    if (samplesByMarket.faltas.length >= TARGET) break outer;
  }
}

function rep(tag: string, p: number[], a: number[]) {
  if (!p.length) { console.log(`    ${tag}: sem dados`); return; }
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`    ${tag}: base=${base.toFixed(3)} Brier=${brierScore(p, a).toFixed(4)} ECE=${expectedCalibrationError(p, a).toFixed(4)} BrierSkill=${brierSkillScore(p, a).toFixed(4)}`);
}

for (const mk of MARKETS) {
  const samples = samplesByMarket[mk.name]!;
  console.log(`\n========== ${mk.name.toUpperCase()} (campo=${mk.field}, prior=${mk.prior}, n=${samples.length}) ==========`);
  const mus = samples.map((s) => {
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, mk.field, mk.prior, PRIOR_STRENGTH, 1.0, ha, 90);
    return { mu: m?.mu ?? null, actual: s.actual };
  }).filter((x) => x.mu != null) as { mu: number; actual: number }[];
  for (const L of mk.lines) {
    console.log(`  over ${L} (n=${mus.length}):`);
    for (const R of R_SWEEP) {
      const p: number[] = [], a: number[] = [];
      for (const x of mus) { p.push(probOverLine(x.mu, L, R)); a.push(x.actual > L ? 1 : 0); }
      rep(`R=${R.toFixed(1)}`, p, a);
    }
  }
}
