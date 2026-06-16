// CALIBRAÇÃO do shrinkK (encolhimento de rating de seleção) — fix do bug `Iran×NZ` 2026-06-15.
// Diferente de recalibrate-match-strength.mts (que tem MIN_HIST=5 → EXCLUI os times rasos
// onde a shrinkage atua): aqui INCLUI times de pouco histórico (floor=1, igual à produção
// pós-fix) e VARRE k ∈ {0,3,6,9,12}, medindo ECE/BrierSkill em gols+vitória (full + banda).
// Mostra qual k melhor calibra quando os rasos entram (era onde o fallback dava lixo).
// Leave-one-out cronológico (causal). Uso: npx tsx scripts/sweep-shrink-selecao.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 150;
const MU0 = 1.3, LR = 0.08, CLAMP = 0.6, H_ADV = 0.0;
const MIN_HIST = 1;            // floor=1 (igual à produção pós-fix) — INCLUI os rasos
const KS = [0, 3, 6, 9, 12];

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });
const dateOf = (e: any) => String(e?.event_date ?? "");

type Ev = { date: string; home: string; away: string; hs: number; as: number };
const pool: Ev[] = [];
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? [])) {
    if (ev.home_score == null || ev.away_score == null) continue;
    pool.push({ date: dateOf(ev), home: String(ev.home_team_id), away: String(ev.away_team_id), hs: Number(ev.home_score), as: Number(ev.away_score) });
  }
}
pool.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const att = new Map<string, number>(), def = new Map<string, number>(), n = new Map<string, number>();
const g = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
const clamp = (x: number) => Math.max(-CLAMP, Math.min(CLAMP, x));
type Snap = { ha: number; hd: number; hg: number; aa: number; ad: number; ag: number; tot: number; hw: number; aw: number };
const snaps: Snap[] = [];
for (const e of pool) {
  const hg = g(n, e.home), ag = g(n, e.away);
  if (hg >= MIN_HIST && ag >= MIN_HIST) {
    snaps.push({ ha: g(att, e.home), hd: g(def, e.home), hg, aa: g(att, e.away), ad: g(def, e.away), ag, tot: e.hs + e.as, hw: e.hs > e.as ? 1 : 0, aw: e.as > e.hs ? 1 : 0 });
  }
  const lh = MU0 * Math.exp(g(att, e.home) + g(def, e.away) + H_ADV), la = MU0 * Math.exp(g(att, e.away) + g(def, e.home));
  const eH = (e.hs - lh) / MU0, eA = (e.as - la) / MU0;
  att.set(e.home, clamp(g(att, e.home) + LR * eH)); def.set(e.away, clamp(g(def, e.away) + LR * eH));
  att.set(e.away, clamp(g(att, e.away) + LR * eA)); def.set(e.home, clamp(g(def, e.home) + LR * eA));
  n.set(e.home, hg + 1); n.set(e.away, ag + 1);
}

const metrics = (p: number[], a: number[]) => { const base = a.reduce((x, y) => x + y, 0) / a.length; return { n: p.length, base, ece: expectedCalibrationError(p, a), bss: base > 0 && base < 1 ? brierSkillScore(p, a) : NaN }; };
const band = (p: number[], a: number[]) => { const pB: number[] = [], aB: number[] = []; for (let i = 0; i < p.length; i++) if (p[i]! >= 0.35 && p[i]! <= 0.65) { pB.push(p[i]!); aB.push(a[i]!); } return pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null; };
const fmt = (m: any) => m ? `n=${String(m.n).padStart(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${Number.isNaN(m.bss) ? " n/a " : (m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}` : "rala";
const lam = (s: Snap, k: number) => { const f = (gg: number) => k > 0 ? gg / (gg + k) : 1; return { lh: MU0 * Math.exp(s.ha * f(s.hg) + s.ad * f(s.ag) + H_ADV), la: MU0 * Math.exp(s.aa * f(s.ag) + s.hd * f(s.hg)) }; };

console.log(`pool=${pool.length} · eval(hist>=${MIN_HIST})=${snaps.length} · cache ${cacheStats().hits}h/${cacheStats().misses}m\n`);
for (const k of KS) {
  const mats = snaps.map((s) => { const { lh, la } = lam(s, k); return scoreMatrix(lh, la); });
  console.log(`===== k=${k} =====`);
  for (const L of [1.5, 2.5, 3.5]) { const a = snaps.map((s) => (s.tot > L ? 1 : 0)); const p = mats.map((m) => probTotalOver(m, L)); console.log(`  gols over ${L}: FULL ${fmt(metrics(p, a))} · BANDA ${fmt(band(p, a))}`); }
  const ah = snaps.map((s) => s.hw), aa = snaps.map((s) => s.aw);
  console.log(`  vitória mandante : FULL ${fmt(metrics(mats.map((m) => probs1x2(m).home), ah))} · BANDA ${fmt(band(mats.map((m) => probs1x2(m).home), ah))}`);
  console.log(`  vitória visitante: FULL ${fmt(metrics(mats.map((m) => probs1x2(m).away), aa))} · BANDA ${fmt(band(mats.map((m) => probs1x2(m).away), aa))}`);
  console.log();
}
