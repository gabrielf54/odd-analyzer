// TENTATIVA: calibrar SOT 1.5 (linha morta) via DECOMPOSIÇÃO, igual ao desarme.
// A casa liquida shots_on_target. Hipótese: total_shots (o mercado mais FORTE, bem
// previsto) prevê a cauda melhor que o SOT direto → μ_sot = μ_finalizações(total_shots)
// × taxa-no-alvo(sot/total_shots, encolhida p/ a média da liga).
// Compara DIRETO (modelo SOT atual, prior 0.4 R 2.0) vs DECOMP, na banda de aposta.
// Espelha audit-player-markets.mts (leave-one-out, settle=shots_on_target, oppMult neutro).
// Uso: npx tsx scripts/recalibrate-sot-decomp.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "selecao") as "selecao" | "clube";
const LEAGUES = POP === "selecao"
  ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]
  : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const EVENTS_PER_LEAGUE = POP === "selecao" ? 16 : 18;
const TARGET = POP === "selecao" ? 2400 : 2800;
const PRIOR_STRENGTH = 12, MIN_MIN = 60;
const GAME_FIELDS = ["minutes_played", "shots_on_target", "total_shots"] as const;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Game = Record<string, number>;
type Sample = { games: Game[]; isHome: boolean; actual: Record<string, number> };
const samples: Sample[] = [];
let sumSot = 0, sumShots = 0;

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

outer:
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const elig = rows.filter((r) => r.player_id != null && Number(r.minutes_played ?? 0) >= MIN_MIN);
    const built = await mapPool(elig, 8, async (r) => {
      let hist: any;
      try { hist = await client.playerStats(r.player_id); } catch { return null; }
      const games = [...(hist?.results ?? [])].reverse()
        .filter((g: any) => String(g.event_id) !== String(ev.id))
        .map((g: any) => { const o: Game = {}; for (const f of GAME_FIELDS) o[f] = Number(g[f] ?? 0); return o; });
      if (games.length < 10) return null;
      const isHome = String(r.team_id) === String(ev.home_team_id);
      const actual: Record<string, number> = {};
      for (const f of GAME_FIELDS) actual[f] = Number(r[f] ?? 0);
      return { games, isHome, actual } as Sample;
    });
    for (const s of built) { if (!s) continue; sumSot += s.actual.shots_on_target!; sumShots += s.actual.total_shots!; samples.push(s); }
    console.error(`[${POP}] liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}
const otLeague = sumShots > 0 ? sumSot / sumShots : 0.34;
const cs = cacheStats();
console.log(`\n############ SOT DECOMP · POP=${POP} ############`);
console.log(`amostra=${samples.length} · taxa-no-alvo média liga=${otLeague.toFixed(3)} · cache ${cs.hits}h/${cs.misses}m\n`);

type M = { n: number; base: number; brier: number; ece: number; bss: number };
function metrics(p: number[], a: number[]): M {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss: base > 0 && base < 1 ? brierSkillScore(p, a) : NaN };
}
function fmt(m: M | null): string {
  if (!m) return "banda rala (n<30)";
  return `n=${String(m.n).padStart(4)} base=${m.base.toFixed(3)} Brier=${m.brier.toFixed(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${Number.isNaN(m.bss) ? "  n/a  " : (m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}`;
}
function evalLine(items: { mu: number; actual: number }[], L: number, R: number) {
  const pF: number[] = [], aF: number[] = [], pB: number[] = [], aB: number[] = [];
  for (const x of items) {
    const prob = probOverLine(x.mu, L, R);
    const a = x.actual > L ? 1 : 0;
    pF.push(prob); aF.push(a);
    if (prob >= 0.35 && prob <= 0.65) { pB.push(prob); aB.push(a); }
  }
  const band = pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null;
  return { full: metrics(pF, aF), band };
}

// μ DIRETO (modelo SOT atual): forma de shots_on_target, prior 0.4
function muDirect(): { mu: number; actual: number }[] {
  const out: { mu: number; actual: number }[] = [];
  for (const s of samples) {
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, "shots_on_target", 0.4, PRIOR_STRENGTH, 1.0, ha, 90);
    if (m?.mu != null) out.push({ mu: m.mu, actual: s.actual.shots_on_target! });
  }
  return out;
}
// μ DECOMP: forma de total_shots (prior 1.2) × taxa-no-alvo encolhida (k)
function muDecomp(k: number): { mu: number; actual: number }[] {
  const out: { mu: number; actual: number }[] = [];
  for (const s of samples) {
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, "total_shots", 1.2, PRIOR_STRENGTH, 1.0, ha, 90);
    if (m?.mu == null) continue;
    let ss = 0, st = 0;
    for (const g of s.games) { ss += g.shots_on_target!; st += g.total_shots!; }
    const ot = (ss + k * otLeague) / (st + k);
    out.push({ mu: m.mu * ot, actual: s.actual.shots_on_target! });
  }
  return out;
}

const Rs = [1.5, 2.0, 2.5, 3.0];
const dir = muDirect();
for (const L of [0.5, 1.5]) {
  const dead = L === 1.5;
  console.log(`\n===== over ${L}${dead ? "  [LINHA MORTA — alvo]" : "  [controle]"} (settle=shots_on_target) =====`);
  console.log(`  -- DIRETO (forma SOT, prior 0.4) --`);
  for (const R of Rs) {
    const { full, band } = evalLine(dir, L, R);
    console.log(`    R=${R.toFixed(1)}${R === 2.0 ? " (shipped)" : ""}  FULL ${fmt(full)}`);
    console.log(`              BANDA ${fmt(band)}`);
  }
  console.log(`  -- DECOMP (μ_finalizações × taxa-no-alvo) --`);
  for (const k of [20, 40]) for (const R of Rs) {
    const items = muDecomp(k);
    const { full, band } = evalLine(items, L, R);
    console.log(`    k=${k} R=${R.toFixed(1)}  FULL ${fmt(full)}`);
    console.log(`              BANDA ${fmt(band)}`);
  }
}
console.log(`\n############ FIM SOT DECOMP ${POP} (amostra=${samples.length}) ############`);
