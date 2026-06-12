// VEREDITO do "COMBINADO DE ESTATÍSTICAS": combinar a forma do jogador com o
// contexto do jogo (posse, mismatch favorito×zebra, mando) com PESOS APRENDIDOS
// DO DADO deixa a análise mais inteligente — ou é redundância (dupla contagem)?
//
// Método (mirror da doutrina: leave-one-out via forma + fora-da-amostra p/ os pesos,
// settleField, banda de aposta prob∈[0.35,0.65], BrierSkill/ECE):
//   Regressão de POISSON com OFFSET = log(μ_forma) e covariáveis de contexto.
//   - MODELO 0 (FORMA): offset + intercepto                    → o que a forma sozinha dá
//   - MODELO 1 (COMBINADO): offset + intercepto + [posse, supremacia, mando]
//   Pesos fitados por 5-fold (treina em 4, prevê o 5º) → SEM vazar o jogo previsto.
//   μ → NB2 (R de produção por mercado) → P(X≥linha) → banda. Compara MODELO 1 vs 0.
//   O coeficiente exp(β) de cada contexto é o "quanto aquela estatística vale" —
//   impresso explicitamente (a inteligência fica visível).
//
// Veredito por mercado: COMBINADO vence se na BANDA o BrierSkill sobe E o ECE cai.
// Se empata → o contexto é redundante com a forma (não construir). Se vence →
// mapeia e implementa (fator calibrado no μ, atrás de flag, cuidado de paridade).
// Uso: npx tsx scripts/recalibrate-combined-context.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { DEFAULT_RATINGS, homeAdvFor } from "../src/model/ratings.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "clube") as "selecao" | "clube";
const LEAGUES = POP === "selecao"
  ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]
  : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const HIST_LIMIT = 200, MINE_RECENT = POP === "selecao" ? 60 : 55;
const MIN_MIN = 60, MIN_HIST = 8, MIN_RATING_HIST = 5, FOLDS = 5, STRENGTH = 12;
const { mu0 } = DEFAULT_RATINGS, HADV = homeAdvFor(POP);

// mercado: campo LIQUIDADO (settle) + prior da forma + R de produção + linhas
const MARKETS = [
  { field: "total_shots", label: "finalizações", prior: 1.2, R: 3.0, lines: [0.5, 1.5, 2.5] },
  { field: "shots_on_target", label: "SOT (chute no gol)", prior: 0.4, R: 2.0, lines: [0.5, 1.5] },
  { field: "won_tackle", label: "desarme ganho", prior: 0.6, R: 2.0, lines: [0.5, 1.5] },
  { field: "fouls", label: "faltas cometidas", prior: 0.9, R: 2.5, lines: [0.5, 1.5] },
] as const;
const FIELDS = ["minutes_played", ...MARKETS.map((m) => m.field)];

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Pre = { hAtt: number; hDef: number; aAtt: number; aDef: number; hN: number; aN: number; homeId: string; awayId: string };
type Sample = { mu: Record<string, number>; act: Record<string, number>; possC: number; sup: number; home: number };
const samples: Sample[] = [];

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

// 1) aquece ratings por liga, snapshot pré-jogo, escolhe eventos recentes a minerar
const mineList: { ev: any; pre: Pre }[] = [];
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: HIST_LIMIT }); } catch { continue; }
  const res: any[] = (evs?.results ?? []).filter((e: any) => e?.home_team_id != null && e?.away_team_id != null && e?.home_score != null && e?.away_score != null);
  const sorted = [...res].sort((a, b) => { const da = String(a.event_date ?? a.date ?? ""), db = String(b.event_date ?? b.date ?? ""); return da < db ? -1 : da > db ? 1 : 0; });
  const att = new Map<string, number>(), def = new Map<string, number>(), ng = new Map<string, number>();
  const ga = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
  const cl = (x: number) => Math.max(-DEFAULT_RATINGS.clamp, Math.min(DEFAULT_RATINGS.clamp, x));
  const pre = new Map<string, Pre>();
  for (const g of sorted) {
    const h = String(g.home_team_id), a = String(g.away_team_id);
    pre.set(String(g.id), { hAtt: ga(att, h), hDef: ga(def, h), aAtt: ga(att, a), aDef: ga(def, a), hN: ga(ng, h), aN: ga(ng, a), homeId: h, awayId: a });
    const lh = mu0 * Math.exp(ga(att, h) + ga(def, a) + HADV), la = mu0 * Math.exp(ga(att, a) + ga(def, h));
    const eH = (Number(g.home_score) - lh) / mu0, eA = (Number(g.away_score) - la) / mu0;
    att.set(h, cl(ga(att, h) + DEFAULT_RATINGS.lr * eH)); def.set(a, cl(ga(def, a) + DEFAULT_RATINGS.lr * eH));
    att.set(a, cl(ga(att, a) + DEFAULT_RATINGS.lr * eA)); def.set(h, cl(ga(def, h) + DEFAULT_RATINGS.lr * eA));
    ng.set(h, ga(ng, h) + 1); ng.set(a, ga(ng, a) + 1);
  }
  for (const g of sorted.slice(-MINE_RECENT)) {
    const p = pre.get(String(g.id))!;
    if (p.hN < MIN_RATING_HIST || p.aN < MIN_RATING_HIST) continue;
    mineList.push({ ev: g, pre: p });
  }
}
function supremacy(p: Pre, teamId: string): number | null {
  const isHome = teamId === p.homeId; if (!isHome && teamId !== p.awayId) return null;
  const myA = isHome ? p.hAtt : p.aAtt, myD = isHome ? p.hDef : p.aDef, opA = isHome ? p.aAtt : p.hAtt, opD = isHome ? p.aDef : p.hDef;
  return mu0 * Math.exp(myA + opD + (isHome ? HADV : 0)) - mu0 * Math.exp(opA + myD + (isHome ? 0 : HADV));
}
console.error(`[${POP}] minerando ${mineList.length} eventos (forma + posse + mismatch)...`);

// 2) por evento: posse (eventStats) + atuais (eventPlayerStats) + forma (playerStats hist)
let done = 0;
await mapPool(mineList, 6, async ({ ev, pre }) => {
  let stats: any, rows: any[];
  try { stats = (await client.eventStats(ev.id))?.stats ?? {}; } catch { return; }
  try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { return; }
  const pH = stats?.home?.ball_possession, pA = stats?.away?.ball_possession;
  if (pH == null || pA == null) return;
  const elig = rows.filter((r) => r.player_id != null && Number(r.minutes_played ?? 0) >= MIN_MIN);
  await mapPool(elig, 6, async (r) => {
    const isHome = String(r.team_id) === String(ev.home_team_id);
    const sup = supremacy(pre, String(r.team_id)); if (sup == null) return;
    let hist: any;
    try { hist = await client.playerStats(r.player_id); } catch { return; }
    const games = [...(hist?.results ?? [])].reverse()
      .filter((g: any) => String(g.event_id) !== String(ev.id))
      .map((g: any) => { const o: Record<string, number> = {}; for (const f of FIELDS) o[f] = Number(g[f] ?? 0); return o; });
    if (games.length < MIN_HIST) return;
    const mu: Record<string, number> = {}, act: Record<string, number> = {};
    let ok = false;
    for (const m of MARKETS) {
      const c = playerMuFromGames(games, m.field, m.prior, STRENGTH, 1.0, 1.0, 90);
      if (c?.mu != null && c.mu > 0) { mu[m.field] = c.mu; act[m.field] = Number(r[m.field] ?? 0); ok = true; }
    }
    if (!ok) return;
    samples.push({ mu, act, possC: (Number(isHome ? pH : pA) - 50) / 10, sup, home: isHome ? 1 : 0 });
  });
  if (++done % 50 === 0) console.error(`  ...${done}/${mineList.length}, amostra=${samples.length}`);
});

const cs = cacheStats();
console.log(`\n############ COMBINADO DE ESTATÍSTICAS · POP=${POP} ############`);
console.log(`amostra=${samples.length} · cache ${cs.hits}h/${cs.misses}m\n`);

// --- Poisson IRLS (Newton) com offset; X inclui coluna 1 (intercepto) ---
function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]! || 1e-9;
    for (let j = c; j <= n; j++) M[c]![j]! /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r]![c]!; for (let j = c; j <= n; j++) M[r]![j]! -= f * M[c]![j]!; }
  }
  return M.map((row) => row[n]!);
}
function fitPoisson(X: number[][], y: number[], offset: number[], p: number): number[] {
  let beta = new Array(p).fill(0);
  for (let it = 0; it < 30; it++) {
    const grad = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) {
      let eta = offset[i]!; for (let j = 0; j < p; j++) eta += X[i]![j]! * beta[j];
      const mu = Math.exp(Math.min(eta, 20)), res = y[i]! - mu;
      for (let j = 0; j < p; j++) { grad[j] += X[i]![j]! * res; for (let k = 0; k < p; k++) H[j]![k]! += X[i]![j]! * X[i]![k]! * mu; }
    }
    for (let j = 0; j < p; j++) H[j]![j]! += 1e-4; // ridge
    const step = solve(H, grad);
    let mx = 0; for (let j = 0; j < p; j++) { beta[j] += step[j]!; mx = Math.max(mx, Math.abs(step[j]!)); }
    if (mx < 1e-7) break;
  }
  return beta;
}

type M = { n: number; base: number; brier: number; ece: number; bss: number };
function metrics(p: number[], a: number[]): M {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss: base > 0 && base < 1 ? brierSkillScore(p, a) : NaN };
}
const fmt = (m: M | null) => !m ? "banda rala (n<30)" : `n=${String(m.n).padStart(4)} ECE=${m.ece.toFixed(3)} BrierSkill=${(m.bss >= 0 ? "+" : "") + (Number.isNaN(m.bss) ? NaN : m.bss).toFixed(4)}`;

for (const m of MARKETS) {
  const S = samples.filter((s) => s.mu[m.field] != null);
  if (S.length < 200) { console.log(`===== ${m.label}: amostra rala (${S.length})\n`); continue; }
  const offset = S.map((s) => Math.log(s.mu[m.field]!));
  const y = S.map((s) => s.act[m.field]!);
  const X0 = S.map(() => [1]);
  const X1 = S.map((s) => [1, s.possC, s.sup, s.home]);

  // coeficientes na amostra TODA (só p/ exibir a "inteligência": exp(β))
  const b1 = fitPoisson(X1, y, offset, 4);
  // predição FORA-DA-AMOSTRA (5-fold) p/ ambos os modelos
  const pred0 = new Array(S.length).fill(0), pred1 = new Array(S.length).fill(0);
  for (let f = 0; f < FOLDS; f++) {
    const tr = [...S.keys()].filter((i) => i % FOLDS !== f), te = [...S.keys()].filter((i) => i % FOLDS === f);
    const c0 = fitPoisson(tr.map((i) => X0[i]!), tr.map((i) => y[i]!), tr.map((i) => offset[i]!), 1);
    const c1 = fitPoisson(tr.map((i) => X1[i]!), tr.map((i) => y[i]!), tr.map((i) => offset[i]!), 4);
    for (const i of te) {
      pred0[i] = Math.exp(offset[i]! + c0[0]!);
      pred1[i] = Math.exp(offset[i]! + c1[0]! + c1[1]! * X1[i]![1]! + c1[2]! * X1[i]![2]! + c1[3]! * X1[i]![3]!);
    }
  }

  console.log(`===== ${m.label}  (amostra=${S.length}, R=${m.R}) =====`);
  console.log(`  pesos aprendidos (exp β): posse(+10%)=${Math.exp(b1[1]!).toFixed(3)}×  ·  favoritismo(+1 gol)=${Math.exp(b1[2]!).toFixed(3)}×  ·  mando=${Math.exp(b1[3]!).toFixed(3)}×`);
  for (const L of m.lines) {
    const a = y.map((v) => (v > L ? 1 : 0));
    const band = (pred: number[]) => {
      const pB: number[] = [], aB: number[] = [];
      for (let i = 0; i < pred.length; i++) { const p = probOverLine(pred[i]!, L, m.R); if (p >= 0.35 && p <= 0.65) { pB.push(p); aB.push(a[i]!); } }
      return pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null;
    };
    const b0 = band(pred0), bb1 = band(pred1);
    const verdict = b0 && bb1 ? (bb1.bss > b0.bss + 0.003 && bb1.ece < b0.ece + 0.002 ? "→ COMBINADO VENCE ✓" : bb1.bss < b0.bss - 0.003 ? "→ combinado PIOR" : "→ empate (redundante)") : "";
    console.log(`  over ${L}:`);
    console.log(`      FORMA      banda ${fmt(b0)}`);
    console.log(`      COMBINADO  banda ${fmt(bb1)}   ${verdict}`);
  }
  console.log("");
}
console.log(`############ FIM COMBINADO ${POP} (amostra=${samples.length}) ############`);
