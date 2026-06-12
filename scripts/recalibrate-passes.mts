// Calibra PASSES (campo total_pass) na população de SELEÇÃO (ligas 31,58-67),
// leave-one-out anti-espiada (prediz o jogo-alvo só com jogos != alvo). Espelha o
// money-path: μ = forma do jogador (no MINUTO REAL, isolando o erro de previsão de
// minutos) × home/away. oppMult neutro = passe não tem eixo de concessão.
// Gate: decide se o mercado de passes vira aposta com estrela na seleção.
// Uso: npx tsx scripts/recalibrate-passes.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 16, TARGET = 1600;
const PRIOR_STRENGTH_SWEEP = [3, 5, 8, 12];
const R_SWEEP: (number | null)[] = [20, 40, 80, 160, 320, null];
const OFFSETS = [-10, -5, 0, 5, 10];

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

type Sample = {
  games: any[];
  isHome: boolean;
  actualMin: number;
  actual: number;
  total_cross: number;
};
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
        games,
        isHome,
        actualMin: Number(r.minutes_played),
        actual: Number(r.total_pass ?? 0),
        total_cross: Number(r.total_cross ?? 0),
      });
    }
    console.error(`liga ${lg} ev ${ev.id} — passes amostras=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}

console.log(`\n========== PASSES (campo=total_pass, população=seleção) ==========`);
console.log(`n total de amostras = ${samples.length}`);

// ---- (2) prior_rate: mediana de (actual/actualMin)*90 sobre todas as amostras ----
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const rate90 = samples.map((s) => (s.actual / s.actualMin) * 90);
const prior_rate = median(rate90);
console.log(`\nprior_rate (mediana total_pass/90) = ${prior_rate.toFixed(4)}`);

// ---- (3) r empírico sobre os actual (total_pass no minuto real) ----
const actuals = samples.map((s) => s.actual);
const muBar = actuals.reduce((a, b) => a + b, 0) / actuals.length;
const variance = actuals.reduce((a, x) => a + (x - muBar) ** 2, 0) / actuals.length;
console.log(`μ̄ (média total_pass no minuto real) = ${muBar.toFixed(4)}`);
console.log(`Var = ${variance.toFixed(4)}`);
if (variance > muBar) {
  const r_emp = (muBar * muBar) / (variance - muBar);
  console.log(`r_emp = μ̄²/(Var − μ̄) = ${r_emp.toFixed(4)}`);
} else {
  console.log(`r_emp: Var (${variance.toFixed(4)}) ≤ μ̄ (${muBar.toFixed(4)}) → subdisperso → Poisson`);
}

// ---- (7) settlement check: total_pass vs total_cross nas primeiras 30 amostras ----
console.log(`\n---------- SETTLEMENT CHECK (primeiras 30 amostras) ----------`);
console.log(`idx  total_pass  total_cross  pass-cross   cross/pass`);
let ratioSum = 0, ratioN = 0;
for (let i = 0; i < Math.min(30, samples.length); i++) {
  const s = samples[i]!;
  const ratio = s.actual > 0 ? s.total_cross / s.actual : 0;
  if (s.actual > 0) { ratioSum += ratio; ratioN++; }
  console.log(
    `${String(i).padStart(3)}  ${String(s.actual).padStart(10)}  ${String(s.total_cross).padStart(11)}  ` +
    `${String(s.actual - s.total_cross).padStart(10)}   ${ratio.toFixed(4)}`,
  );
}
// média global de cross/pass sobre todas as amostras com pass>0
let gRatioSum = 0, gRatioN = 0;
for (const s of samples) { if (s.actual > 0) { gRatioSum += s.total_cross / s.actual; gRatioN++; } }
console.log(`média total_cross/total_pass (primeiras 30) = ${ratioN ? (ratioSum / ratioN).toFixed(4) : "n/a"}`);
console.log(`média total_cross/total_pass (todas n=${gRatioN}) = ${gRatioN ? (gRatioSum / gRatioN).toFixed(4) : "n/a"}`);

// ---- relatório por banda ----
function rep(tag: string, p: number[], a: number[]) {
  if (!p.length) { console.log(`      ${tag}: sem dados`); return; }
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  // brierSkillScore lança se base==0 ou base==1 (variância nula); proteja
  let bss = "n/a";
  if (base > 0 && base < 1) bss = brierSkillScore(p, a).toFixed(4);
  console.log(
    `      ${tag}: n=${String(p.length).padStart(4)} base=${base.toFixed(3)} ` +
    `Brier=${brierScore(p, a).toFixed(4)} ECE=${expectedCalibrationError(p, a).toFixed(4)} BrierSkill=${bss}`,
  );
}

// melhor (PS,R) por BrierSkill na região de aposta (off ∈ {-5,0,5})
type Best = { ps: number; r: number | null; bss: number; ece: number; brier: number; base: number };
let bestOff0: Best | null = null;
let bestBetRegion: Best | null = null;

for (const PS of PRIOR_STRENGTH_SWEEP) {
  // pré-computa μ no minuto real para esse PS (independe de R)
  const musWithSample = samples.map((s) => {
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, "total_pass", prior_rate, PS, 1.0, ha, s.actualMin);
    return { mu: m?.mu ?? null, actual: s.actual };
  }).filter((x) => x.mu != null) as { mu: number; actual: number }[];

  console.log(`\n========== PRIOR_STRENGTH=${PS} (μ válido em ${musWithSample.length}/${samples.length}) ==========`);
  for (const R of R_SWEEP) {
    const Rlabel = R === null ? "Poisson" : `R=${R}`;
    console.log(`\n  --- ${Rlabel} ---`);

    // pools por banda + pool região de aposta {-5,0,5} + pool geral
    const byOff: Record<number, { p: number[]; a: number[] }> = {};
    for (const off of OFFSETS) byOff[off] = { p: [], a: [] };
    const betP: number[] = [], betA: number[] = [];
    const allP: number[] = [], allA: number[] = [];

    for (const x of musWithSample) {
      for (const off of OFFSETS) {
        const k = Math.round(x.mu) + off;
        if (k < 1) continue;
        const prob = probOverLine(x.mu, k - 0.5, R); // P(X ≥ k)
        const a = x.actual >= k ? 1 : 0;
        byOff[off]!.p.push(prob); byOff[off]!.a.push(a);
        allP.push(prob); allA.push(a);
        if (off === -5 || off === 0 || off === 5) { betP.push(prob); betA.push(a); }
      }
    }

    for (const off of OFFSETS) {
      rep(`off=${off >= 0 ? "+" : ""}${off} (k≈round(μ)${off >= 0 ? "+" : ""}${off})`, byOff[off]!.p, byOff[off]!.a);
    }
    rep(`REGIÃO APOSTA {-5,0,+5}`, betP, betA);
    rep(`GERAL (todas bandas)`, allP, allA);

    // rastreia melhor por BrierSkill (off=0 e região de aposta)
    const off0 = byOff[0]!;
    if (off0.p.length) {
      const b0 = off0.a.reduce((x, y) => x + y, 0) / off0.a.length;
      if (b0 > 0 && b0 < 1) {
        const s0 = brierSkillScore(off0.p, off0.a);
        if (!bestOff0 || s0 > bestOff0.bss) {
          bestOff0 = { ps: PS, r: R, bss: s0, ece: expectedCalibrationError(off0.p, off0.a), brier: brierScore(off0.p, off0.a), base: b0 };
        }
      }
    }
    if (betP.length) {
      const bb = betA.reduce((x, y) => x + y, 0) / betA.length;
      if (bb > 0 && bb < 1) {
        const sb = brierSkillScore(betP, betA);
        if (!bestBetRegion || sb > bestBetRegion.bss) {
          bestBetRegion = { ps: PS, r: R, bss: sb, ece: expectedCalibrationError(betP, betA), brier: brierScore(betP, betA), base: bb };
        }
      }
    }
  }
}

console.log(`\n========== MELHOR (PRIOR_STRENGTH, R) POR BrierSkill ==========`);
const fmtR = (r: number | null) => (r === null ? "Poisson" : `R=${r}`);
if (bestOff0) {
  console.log(`  off=0 (linha ≈ μ): PRIOR_STRENGTH=${bestOff0.ps} ${fmtR(bestOff0.r)} → BrierSkill=${bestOff0.bss.toFixed(4)} ECE=${bestOff0.ece.toFixed(4)} Brier=${bestOff0.brier.toFixed(4)} base=${bestOff0.base.toFixed(3)}`);
} else console.log(`  off=0: sem candidato (base degenerada)`);
if (bestBetRegion) {
  console.log(`  região aposta {-5,0,+5}: PRIOR_STRENGTH=${bestBetRegion.ps} ${fmtR(bestBetRegion.r)} → BrierSkill=${bestBetRegion.bss.toFixed(4)} ECE=${bestBetRegion.ece.toFixed(4)} Brier=${bestBetRegion.brier.toFixed(4)} base=${bestBetRegion.base.toFixed(3)}`);
} else console.log(`  região aposta: sem candidato (base degenerada)`);
