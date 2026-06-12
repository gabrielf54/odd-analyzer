// TENTATIVA (passes, diagnóstico): bate o livro NO PONTO DA LINHA (off=0, linha≈μ)
// modelando accurate_pass em vez de total_pass, e/ou varrendo R<8? A auditoria achou
// off=0 ≈ 0 (posse-dominado). Aqui: 2 campos × varredura de R (incl. <8) × PS, método
// de offset (idêntico ao audit-player-markets). Gradua só se off=0 virar BrierSkill
// claramente >0 com ECE ≤ ~0.05. Uso: npx tsx scripts/recalibrate-passes-v2.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "selecao") as "selecao" | "clube";
const SEL = POP === "selecao";
const LEAGUES = SEL ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67] : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const EVENTS_PER_LEAGUE = SEL ? 16 : 18;
const TARGET = SEL ? 2400 : 2800;
const MIN_MIN = 60;
const FIELDS = ["total_pass", "accurate_pass"] as const;
const GAME_FIELDS = ["minutes_played", "total_pass", "accurate_pass"] as const;
const PS_SWEEP = [5, 8, 12];
const R_SWEEP: (number | null)[] = [3, 5, 8, 12, 20, null];

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Game = Record<string, number>;
type Sample = { games: Game[]; isHome: boolean; actualMin: number; actual: Record<string, number> };
const samples: Sample[] = [];
const fieldPresent: Record<string, number> = { total_pass: 0, accurate_pass: 0 };

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
      return { games, isHome, actualMin: Number(r.minutes_played), actual } as Sample;
    });
    for (const s of built) {
      if (!s) continue;
      for (const f of FIELDS) if (s.actual[f]! > 0) fieldPresent[f]!++;
      samples.push(s);
    }
    console.error(`[${POP}] liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}
const cs = cacheStats();
console.log(`\n############ PASSES v2 · POP=${POP} ############`);
console.log(`amostra=${samples.length} · presença: total_pass=${fieldPresent.total_pass} accurate_pass=${fieldPresent.accurate_pass} · cache ${cs.hits}h/${cs.misses}m\n`);

function metrics(p: number[], a: number[]) {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss: base > 0 && base < 1 ? brierSkillScore(p, a) : NaN };
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2; };

for (const field of FIELDS) {
  if (fieldPresent[field]! < 100) { console.log(`\n===== ${field}: presença ${fieldPresent[field]} < 100 → CAMPO AUSENTE/raro, pula =====`); continue; }
  const rate90 = samples.map((s) => (s.actual[field]! / s.actualMin) * 90).filter((x) => Number.isFinite(x) && x > 0);
  const prior = median(rate90);
  console.log(`\n===== ${field} (prior_rate=mediana per90=${prior.toFixed(2)}) =====`);
  let best: { ps: number; r: number | null; bss: number; ece: number } | null = null;
  for (const PS of PS_SWEEP) {
    const mus = samples.map((s) => {
      const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
      const m = playerMuFromGames(s.games, field, prior, PS, 1.0, ha, s.actualMin);
      return { mu: m?.mu ?? null, actual: s.actual[field]! };
    }).filter((x) => x.mu != null) as { mu: number; actual: number }[];
    for (const R of R_SWEEP) {
      const p: number[] = [], a: number[] = [];
      for (const x of mus) { const k = Math.round(x.mu); if (k < 1) continue; p.push(probOverLine(x.mu, k - 0.5, R)); a.push(x.actual >= k ? 1 : 0); }
      if (!(a.some((v) => v === 1) && a.some((v) => v === 0))) continue;
      const m = metrics(p, a);
      const Rl = R === null ? "Poisson" : `R=${String(R).padStart(2)}`;
      console.log(`  PS=${PS} ${Rl} off=0  n=${m.n} base=${m.base.toFixed(3)} ECE=${m.ece.toFixed(4)} BrierSkill=${(m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}`);
      if (!best || m.bss > best.bss) best = { ps: PS, r: R, bss: m.bss, ece: m.ece };
    }
  }
  if (best) console.log(`  >>> MELHOR ${field}: PS=${best.ps} ${best.r === null ? "Poisson" : "R=" + best.r} BrierSkill=${best.bss.toFixed(4)} ECE=${best.ece.toFixed(4)} → ${best.bss > 0.02 && best.ece <= 0.05 ? "GRADUA?" : "sem edge (segue diagnóstico)"}`);
}
console.log(`\n############ FIM PASSES v2 ${POP} (amostra=${samples.length}) ############`);
