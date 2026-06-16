// INVESTIGAÇÃO FUNDA: por que a VITÓRIA (1X2) calibra pior que GOLS na população de
// seleção? Hipótese-mãe: a amostra de eliminatórias é casa/fora (mando real forte:
// mandante vence ~49% vs visitante ~26%), mas o modelo de seleção usa homeAdv=0 (campo
// neutro, correto p/ a Copa) → o 1X2 medido em eliminatória é ARTEFATO de venue, não erro
// do modelo. Gols (total) não sente mando → calibra e transfere; 1X2 (split) sente.
//
// Roda a engrenagem de PRODUÇÃO (mesmo Elo causal de ratings.ts + Dixon-Coles de
// matchModel.ts), configurável (homeAdv/shrinkK/rho), leave-one-out cronológico.
// Saídas: (1) curva de calibração do mandante por decil; (2) varredura de homeAdv,
// shrinkK e rho medindo 1X2 (FULL+BANDA) e gols (sanidade — não deve mexer).
// Uso: npx tsx scripts/investigate-vitoria-calibration.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]; // seleção (quali/AFCON/amistoso)
const EVENTS_PER_LEAGUE = 150;
const MU0 = 1.3, LR = 0.08, CLAMP = 0.6, MIN_HIST = 5;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });
const dateOf = (e: any) => String(e?.event_date ?? e?.date ?? e?.start_time ?? "");

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

type Ev = { date: string; home: string; away: string; hs: number; as: number };
const pool: Ev[] = [];
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    if (ev.home_score == null || ev.away_score == null) continue;
    pool.push({ date: dateOf(ev), home: String(ev.home_team_id), away: String(ev.away_team_id), hs: Number(ev.home_score), as: Number(ev.away_score) });
  }
}
pool.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
console.error(`pool seleção: ${pool.length} jogos`);

// Mando observado na amostra (prova do artefato de venue)
const hw = pool.filter((e) => e.hs > e.as).length, aw = pool.filter((e) => e.as > e.hs).length, dr = pool.length - hw - aw;
console.log(`\nMANDO OBSERVADO na amostra: mandante vence ${(100 * hw / pool.length).toFixed(1)}% · empate ${(100 * dr / pool.length).toFixed(1)}% · visitante ${(100 * aw / pool.length).toFixed(1)}%`);
console.log(`(se mandante >> visitante, a amostra TEM mando real — e homeAdv=0 vai subestimar o mandante)\n`);

type Pred = { pHome: number; pDraw: number; pAway: number; over25: number; hw: number; aw: number; dw: number; tot: number };

/** Passe causal incremental com Elo (att/def/games), prevendo cada jogo a partir do
 * passado, com homeAdv/shrinkK/rho configuráveis. Espelha computeRatings + lambdaFromRatings. */
function run(homeAdv: number, shrinkK: number, rho: number): Pred[] {
  const att = new Map<string, number>(), def = new Map<string, number>(), n = new Map<string, number>();
  const g = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
  const cl = (x: number) => Math.max(-CLAMP, Math.min(CLAMP, x));
  const preds: Pred[] = [];
  for (const e of pool) {
    const nh = g(n, e.home), na = g(n, e.away);
    if (nh >= MIN_HIST && na >= MIN_HIST) {
      const fh = shrinkK > 0 ? nh / (nh + shrinkK) : 1, fa = shrinkK > 0 ? na / (na + shrinkK) : 1;
      const lh = MU0 * Math.exp(g(att, e.home) * fh + g(def, e.away) * fa + homeAdv);
      const la = MU0 * Math.exp(g(att, e.away) * fa + g(def, e.home) * fh);
      const m = scoreMatrix(lh, la, rho);
      const p = probs1x2(m);
      preds.push({ pHome: p.home, pDraw: p.draw, pAway: p.away, over25: probTotalOver(m, 2.5), hw: e.hs > e.as ? 1 : 0, aw: e.as > e.hs ? 1 : 0, dw: e.hs === e.as ? 1 : 0, tot: e.hs + e.as });
    }
    // update causal (homeAdv no λ de treino, igual computeRatings)
    const lh = MU0 * Math.exp(g(att, e.home) + g(def, e.away) + homeAdv);
    const la = MU0 * Math.exp(g(att, e.away) + g(def, e.home));
    const eH = (e.hs - lh) / MU0, eA = (e.as - la) / MU0;
    att.set(e.home, cl(g(att, e.home) + LR * eH)); def.set(e.away, cl(g(def, e.away) + LR * eH));
    att.set(e.away, cl(g(att, e.away) + LR * eA)); def.set(e.home, cl(g(def, e.home) + LR * eA));
    n.set(e.home, nh + 1); n.set(e.away, na + 1);
  }
  return preds;
}

function band(p: number[], a: number[]) {
  const pB: number[] = [], aB: number[] = [];
  for (let i = 0; i < p.length; i++) if (p[i]! >= 0.35 && p[i]! <= 0.65) { pB.push(p[i]!); aB.push(a[i]!); }
  if (pB.length < 30 || !aB.some((v) => v === 1) || !aB.some((v) => v === 0)) return null;
  return { n: pB.length, ece: expectedCalibrationError(pB, aB), bss: brierSkillScore(pB, aB) };
}
const full = (p: number[], a: number[]) => ({ n: p.length, ece: expectedCalibrationError(p, a), bss: brierSkillScore(p, a), mean: p.reduce((x, y) => x + y, 0) / p.length, base: a.reduce((x, y) => x + y, 0) / a.length });

// ---- (1) curva de calibração do mandante (config de PRODUÇÃO: homeAdv=0, shrinkK=3) ----
console.log(`===== CURVA DE CALIBRAÇÃO — mandante, config PRODUÇÃO (homeAdv=0, shrinkK=3, rho=-0.05) =====`);
const prod = run(0, 3, -0.05);
{
  const ph = prod.map((x) => x.pHome), ah = prod.map((x) => x.hw);
  console.log(`  prev. média mandante = ${(100 * ph.reduce((a, b) => a + b, 0) / ph.length).toFixed(1)}%  vs  real = ${(100 * ah.reduce((a, b) => a + b, 0) / ah.length).toFixed(1)}%  (gap = modelo prevê MENOS mandante do que acontece?)`);
  console.log(`  decil  | prev.méd | real  | n`);
  const idx = ph.map((_, i) => i).sort((a, b) => ph[a]! - ph[b]!);
  for (let d = 0; d < 10; d++) {
    const slice = idx.slice(Math.floor(d * idx.length / 10), Math.floor((d + 1) * idx.length / 10));
    if (!slice.length) continue;
    const pm = slice.reduce((s, i) => s + ph[i]!, 0) / slice.length;
    const rm = slice.reduce((s, i) => s + ah[i]!, 0) / slice.length;
    console.log(`   ${String(d + 1).padStart(2)}    |  ${(100 * pm).toFixed(1).padStart(5)}% | ${(100 * rm).toFixed(1).padStart(5)}% | ${slice.length}`);
  }
}

// ---- (2) varredura homeAdv × shrinkK × rho ----
console.log(`\n===== VARREDURA — 1X2 (mandante) FULL/BANDA + gols2.5 (sanidade) =====`);
console.log(`config                        | 1X2 FULL ece/bss | 1X2 BANDA ece/bss | gols2.5 FULL ece/bss`);
const fnum = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);
for (const homeAdv of [0.0, 0.15, 0.25, 0.35]) {
  for (const shrinkK of [0, 3]) {
    const rho = -0.05;
    const r = run(homeAdv, shrinkK, rho);
    const ph = r.map((x) => x.pHome), ah = r.map((x) => x.hw);
    const fH = full(ph, ah), bH = band(ph, ah);
    const og = r.map((x) => x.over25), ag = r.map((x) => (x.tot > 2.5 ? 1 : 0));
    const fG = full(og, ag);
    const bStr = bH ? `${bH.ece.toFixed(3)}/${fnum(bH.bss)} (n${bH.n})` : "—(rala)";
    console.log(`hAdv=${homeAdv.toFixed(2)} shrK=${shrinkK} rho=${rho}      | ${fH.ece.toFixed(3)}/${fnum(fH.bss)}    | ${bStr.padEnd(17)} | ${fG.ece.toFixed(3)}/${fnum(fG.bss)}`);
  }
}
console.log(`\n(homeAdv só p/ ENTENDER a amostra de eliminatória; a Copa é NEUTRA → produção fica homeAdv=0.`);
console.log(` Se 1X2 melhora MUITO com homeAdv>0, a "fraqueza" era artefato de venue, não erro do modelo.)`);

// ---- (3) rho sweep (config produção) ----
console.log(`\n===== rho (Dixon-Coles) — homeAdv=0, shrinkK=3 =====`);
for (const rho of [0.0, -0.05, -0.10, -0.15]) {
  const r = run(0, 3, rho);
  const ph = r.map((x) => x.pHome), ah = r.map((x) => x.hw);
  const pd = r.map((x) => x.pDraw), ad = r.map((x) => x.dw);
  const fH = full(ph, ah), fD = full(pd, ad);
  console.log(`rho=${rho.toFixed(2)} | mandante ece=${fH.ece.toFixed(3)} bss=${fnum(fH.bss)} | empate prev=${(100 * fD.mean).toFixed(1)}% real=${(100 * fD.base).toFixed(1)}% ece=${fD.ece.toFixed(3)}`);
}
console.error(`\ncache ${cacheStats().hits}h/${cacheStats().misses}m`);
