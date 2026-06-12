// SCREEN do MECANISMO #2: a contagem do jogador varia com o MISMATCH DE FORÇA
// (favorito × zebra) do jogo? É a alavanca que a web mais ligou a tackles/fouls/
// shots/corners (multi-mercado) e é a espinha da doutrina N5. Mesmo molde do
// probe-posse-conditional (transversal + intra-jogador), trocando posse por
// SUPREMACIA = λ_meu_time − λ_adversário, calculada com os RATINGS de força tipo
// Elo de produção (model/ratings) snapshotados ANTES de cada jogo (causal — só
// passado). Funciona até em seleção (é do TIME, não do histórico fino do jogador).
//
// Direção esperada (web + N5):
//   desarme (won/total_tackle): supremacia↑ (favorito) → desarma MENOS → sinal −1
//   chutes  (sot/total_shots):  supremacia↑ → chuta MAIS                → sinal +1
//   faltas COMETIDAS (fouls):   zebra/perseguidor faz falta tática     → sinal −1
//   faltas SOFRIDAS (was_fouled): favorito ataca mais → sofre mais?     → sinal +1 (ambíguo)
//
// Uso: npx tsx scripts/probe-mismatch-conditional.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { DEFAULT_RATINGS, homeAdvFor } from "../src/model/ratings.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "clube") as "selecao" | "clube";
const LEAGUES = POP === "selecao"
  ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]
  : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const HIST_LIMIT = 200;        // jogos p/ aquecer os ratings (1 chamada/liga, cacheada)
const MINE_RECENT = POP === "selecao" ? 60 : 60; // eventos recentes a minerar stats
const MIN_MIN = 60;
const MIN_HIST = 5;            // ratings só confiáveis com ≥5 jogos de cada time (igual prod)
const WITHIN_MIN_GAMES = 8, WITHIN_MIN_SIDE = 3;
const { mu0 } = DEFAULT_RATINGS;
const HADV = homeAdvFor(POP);

const METRICS = [
  { field: "won_tackle", label: "desarme GANHO (settle)", expect: -1 },
  { field: "total_tackle", label: "desarme tentado", expect: -1 },
  { field: "shots_on_target", label: "SOT (settle)", expect: +1 },
  { field: "total_shots", label: "finalizações", expect: +1 },
  { field: "fouls", label: "faltas COMETIDAS", expect: -1 },
  { field: "was_fouled", label: "faltas SOFRIDAS", expect: +1 },
] as const;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Obs = { pid: string; sup: number; min: number; v: Record<string, number> };
const obs: Obs[] = [];

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

type Pre = { hAtt: number; hDef: number; aAtt: number; aDef: number; hN: number; aN: number; homeId: string; awayId: string };

// Por liga: aquece ratings cronologicamente, snapshot pré-jogo por event_id, e
// escolhe os MINE_RECENT eventos mais recentes (mais história atrás) p/ minerar.
const mineList: { ev: any; pre: Pre }[] = [];
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: HIST_LIMIT }); } catch { continue; }
  const results: any[] = (evs?.results ?? []).filter((e: any) => e?.home_team_id != null && e?.away_team_id != null && e?.home_score != null && e?.away_score != null);
  const sorted = [...results].sort((a, b) => {
    const da = String(a.event_date ?? a.date ?? ""), db = String(b.event_date ?? b.date ?? "");
    return da < db ? -1 : da > db ? 1 : 0;
  });
  const att = new Map<string, number>(), def = new Map<string, number>(), ng = new Map<string, number>();
  const ga = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
  const cl = (x: number) => Math.max(-DEFAULT_RATINGS.clamp, Math.min(DEFAULT_RATINGS.clamp, x));
  const pre = new Map<string, Pre>();
  for (const g of sorted) {
    const h = String(g.home_team_id), a = String(g.away_team_id);
    pre.set(String(g.id), { hAtt: ga(att, h), hDef: ga(def, h), aAtt: ga(att, a), aDef: ga(def, a), hN: ga(ng, h), aN: ga(ng, a), homeId: h, awayId: a });
    const lh = mu0 * Math.exp(ga(att, h) + ga(def, a) + HADV);
    const la = mu0 * Math.exp(ga(att, a) + ga(def, h));
    const eH = (Number(g.home_score) - lh) / mu0, eA = (Number(g.away_score) - la) / mu0;
    att.set(h, cl(ga(att, h) + DEFAULT_RATINGS.lr * eH)); def.set(a, cl(ga(def, a) + DEFAULT_RATINGS.lr * eH));
    att.set(a, cl(ga(att, a) + DEFAULT_RATINGS.lr * eA)); def.set(h, cl(ga(def, h) + DEFAULT_RATINGS.lr * eA));
    ng.set(h, ga(ng, h) + 1); ng.set(a, ga(ng, a) + 1);
  }
  // minerar os mais recentes (fim da lista cronológica) com história suficiente
  for (const g of sorted.slice(-MINE_RECENT)) {
    const p = pre.get(String(g.id))!;
    if (p.hN < MIN_HIST || p.aN < MIN_HIST) continue;
    mineList.push({ ev: g, pre: p });
  }
}
console.error(`[${POP}] ${mineList.length} eventos a minerar (ratings aquecidos)...`);

function supremacy(pre: Pre, teamId: string): number | null {
  const isHome = teamId === pre.homeId;
  if (!isHome && teamId !== pre.awayId) return null;
  const myAtt = isHome ? pre.hAtt : pre.aAtt, myDef = isHome ? pre.hDef : pre.aDef;
  const opAtt = isHome ? pre.aAtt : pre.hAtt, opDef = isHome ? pre.aDef : pre.hDef;
  const myL = mu0 * Math.exp(myAtt + opDef + (isHome ? HADV : 0));
  const opL = mu0 * Math.exp(opAtt + myDef + (isHome ? 0 : HADV));
  return myL - opL;
}

let done = 0;
await mapPool(mineList, 6, async ({ ev, pre }) => {
  let rows: any[];
  try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { return; }
  for (const r of rows) {
    const min = Number(r.minutes_played ?? 0);
    if (r.player_id == null || min < MIN_MIN) continue;
    const sup = supremacy(pre, String(r.team_id));
    if (sup == null) continue;
    const v: Record<string, number> = {};
    for (const m of METRICS) v[m.field] = Number(r[m.field] ?? 0);
    obs.push({ pid: String(r.player_id), sup, min, v });
  }
  if (++done % 50 === 0) console.error(`  ...${done}/${mineList.length}, obs=${obs.length}`);
});

const cs = cacheStats();
console.log(`\n############ MISMATCH × CONTAGEM · POP=${POP} ############`);
console.log(`obs=${obs.length} · jogadores distintos=${new Set(obs.map((o) => o.pid)).size} · cache ${cs.hits}h/${cs.misses}m`);
const sups = obs.map((o) => o.sup);
console.log(`supremacia (λ_meu−λ_adv): min=${Math.min(...sups).toFixed(2)} mediana=${median(sups).toFixed(2)} max=${Math.max(...sups).toFixed(2)}\n`);

function median(xs: number[]): number { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; }
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length; if (n < 3) return NaN;
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
const per90 = (o: Obs, f: string) => (o.v[f]! / o.min) * 90;
const BINS: [number, number, string][] = [
  [-99, -1, "zebrão  (<−1)"], [-1, -0.4, "zebra (−1..−0.4)"], [-0.4, 0.4, "parelho(−0.4..0.4)"],
  [0.4, 1, "favorito(0.4..1)"], [1, 99, "favoritão(>1)"],
];

for (const m of METRICS) {
  const dir = m.expect < 0 ? "↓ esperado (favorito→menos)" : "↑ esperado (favorito→mais)";
  console.log(`===== ${m.label}  [${dir}] =====`);
  const xs = obs.map((o) => o.sup), ys = obs.map((o) => per90(o, m.field));
  const r = pearson(xs, ys);
  console.log(`  (1) TRANSVERSAL  Pearson(supremacia, taxa/90) = ${(r >= 0 ? "+" : "") + r.toFixed(3)}  ${signVerdict(r, m.expect)}`);
  for (const [lo, hi, lab] of BINS) {
    const sub = obs.filter((o) => o.sup >= lo && o.sup < hi);
    if (sub.length < 20) { console.log(`        ${lab}: n=${sub.length} (rala)`); continue; }
    console.log(`        ${lab}: n=${String(sub.length).padStart(4)}  taxa/90=${mean(sub.map((o) => per90(o, m.field))).toFixed(3)}`);
  }
  const byPlayer = new Map<string, Obs[]>();
  for (const o of obs) { const a = byPlayer.get(o.pid) ?? []; a.push(o); byPlayer.set(o.pid, a); }
  const deltas: number[] = []; let agree = 0, qualified = 0;
  for (const [, gs] of byPlayer) {
    if (gs.length < WITHIN_MIN_GAMES) continue;
    const med = median(gs.map((g) => g.sup));
    const hi = gs.filter((g) => g.sup > med), lo = gs.filter((g) => g.sup < med);
    if (hi.length < WITHIN_MIN_SIDE || lo.length < WITHIN_MIN_SIDE) continue;
    qualified++;
    const d = mean(hi.map((g) => per90(g, m.field))) - mean(lo.map((g) => per90(g, m.field)));
    deltas.push(d);
    if (Math.sign(d) === Math.sign(m.expect)) agree++;
  }
  if (qualified < 15) { console.log(`  (2) INTRA-JOGADOR  só ${qualified} jogadores (rala — sem poder)\n`); continue; }
  const md = mean(deltas), medd = median(deltas), frac = agree / qualified, base = mean(ys);
  console.log(`  (2) INTRA-JOGADOR  n=${qualified}  delta(favorito−zebra)/90: média=${(md >= 0 ? "+" : "") + md.toFixed(3)} mediana=${(medd >= 0 ? "+" : "") + medd.toFixed(3)}`);
  console.log(`        ${(frac * 100).toFixed(0)}% na direção esperada (${agree}/${qualified})  ·  swing≈${(Math.abs(md) / base * 100).toFixed(0)}% da taxa média (${base.toFixed(2)}/90)  ${withinVerdict(md, frac, m.expect)}\n`);
}

function signVerdict(r: number, expect: number): string {
  if (Number.isNaN(r)) return "";
  if (Math.abs(r) < 0.03) return "→ ~zero (sem sinal)";
  return Math.sign(r) === Math.sign(expect) ? "→ sinal ESPERADO ✓" : "→ sinal CONTRÁRIO ✗";
}
function withinVerdict(md: number, frac: number, expect: number): string {
  const dirOk = Math.sign(md) === Math.sign(expect);
  if (dirOk && frac >= 0.60) return "→ SINAL ✓";
  if (dirOk && frac >= 0.55) return "→ fraco";
  return "→ sem sinal claro";
}
console.log(`############ FIM MISMATCH × CONTAGEM ${POP} (obs=${obs.length}) ############`);
