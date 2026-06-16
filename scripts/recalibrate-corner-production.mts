// FRENTE C (escanteios) — RATINGS de PRODUÇÃO de escanteio estilo Elo vs BASELINE.
//
// Hipótese (nunca testada): o MESMO motor de ratings de força que VENCEU em gols
// (src/model/ratings.ts, exp 2026-06-12b) aplicado à PRODUÇÃO de escanteio do time
// bate o baseline (μ = média recente de corner) no PONTO DE APOSTA. NÃO é o eixo de
// concessão (exp 12c, REPROVADO, n=917) — concessão multiplica μ_base pelo corner
// concedido do adversário; AQUI o rating modela ATAQUE (time gera corner) × DEFESA
// (time concede corner) de forma acoplada e causal, igual ao Elo de gols.
//
// Modelo Elo de corner (espelha computeRatings, trocando "gol" por "corner"):
//   λ_corner_home = μ0 · exp(att_home + def_away + mando)
//   λ_corner_away = μ0 · exp(att_away + def_home)
//   att/def atualizados CRONOLOGICAMENTE pelo erro (corner_observado − λ)/μ0.
//   μ_total = λ_corner_home + λ_corner_away → P(total > linha) via NB2 (probOverLine).
//
// Baseline (idêntico ao audit/recalibrate-match-strength): μ = média rolante de
// corner pró (encolhida p/ prior da liga), home+away, SEM mando, SEM concessão.
//
// Leave-one-out natural: o passe cronológico só usa jogos ANTERIORES ao alvo (snapshot
// ANTES do update). Métricas na banda prob∈[0.35,0.65] (ponto de aposta), settle =
// corner_total observado (corner_kicks home+away do eventStats). Reusa o cache em disco
// da BSD (custo $0). Uso: npx tsx scripts/recalibrate-corner-production.mts <clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { shrinkRate } from "../src/model/shrinkage.js";
import { probOverLine } from "../src/model/sotModel.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "clube") as "selecao" | "clube";
// Só clube tem corner_kicks no eventStats (seleção = data-dead, confirmado nos
// experimentos anteriores). Espelha as ligas de clube de recalibrate-match-strength.
const LEAGUES = POP === "selecao"
  ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]
  : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const EVENTS_PER_LEAGUE = 150;

// --- params do baseline (idênticos ao audit-match-markets / recalibrate-match-strength) ---
const CORNER_PRIOR = 5.0;      // prior de corner/time/jogo
const CORNER_PS = 10;          // força do prior (shrink)
const MIN_CORNER_HIST = 3;     // jogos de corner no histórico p/ o baseline entrar

// --- params do Elo de corner (espelham o Elo de gols; mando recalibrado p/ a base do corner) ---
const MU0 = CORNER_PRIOR;      // base do rating = corner/time/jogo (~5), não 1.3 (gol)
const LR = 0.08;               // learning rate (default robusto do Elo de gols)
const CLAMP = 0.6;             // limite |att|,|def|
const H_ADV = POP === "clube" ? 0.10 : 0.0; // mando em log (corner tem mando menor que gol)
const MIN_HIST = 5;            // jogos no rating Elo p/ entrar no eval (causal)

// linhas de corner total e dispersões NB2 a varrer (iguais ao audit)
const LINES = [8.5, 9.5, 10.5];
const RS = [2.5, 3.0, 3.5];

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });
const dateOf = (e: any) => String(e?.event_date ?? e?.date ?? e?.start_time ?? "");

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

if (POP !== "clube") {
  console.error("Escanteios só tem dado de corner na população CLUBE (seleção = data-dead). Rode: npx tsx scripts/recalibrate-corner-production.mts clube");
  process.exit(1);
}

// ---- coleta de eventos (pool cronológico) com corner home/away ----
type Ev = { id: string; date: string; home: string; away: string; ch: number | null; ca: number | null };
const pool: Ev[] = [];
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  const rows: any[] = (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE);
  const built = await mapPool(rows, 6, async (ev: any) => {
    if (ev.home_team_id == null || ev.away_team_id == null) return null;
    let ch: number | null = null, ca: number | null = null;
    try {
      const st = (await client.eventStats(ev.id))?.stats ?? {};
      const h = st.home?.corner_kicks, a = st.away?.corner_kicks;
      ch = h == null ? null : Number(h); ca = a == null ? null : Number(a);
    } catch { /* sem corner */ }
    return { id: String(ev.id), date: dateOf(ev), home: String(ev.home_team_id), away: String(ev.away_team_id), ch, ca } as Ev;
  });
  for (const e of built) if (e) pool.push(e);
  console.error(`[${POP}] liga ${lg} — pool=${pool.length}`);
}
pool.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// ---- passe cronológico: Elo de corner (att/def) + histórico rolante de corner pró ----
const att = new Map<string, number>(), def = new Map<string, number>();
const cf = new Map<string, number[]>();   // corner pró rolante (baseline)
const g = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
const push10 = (m: Map<string, number[]>, k: string, v: number) => { const a = m.get(k) ?? []; a.push(v); if (a.length > 10) a.shift(); m.set(k, a); };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const cl = (x: number) => Math.max(-CLAMP, Math.min(CLAMP, x));
const nGames = new Map<string, number>(); // jogos de corner observados p/ elegibilidade do Elo

type S = {
  // baseline (média rolante encolhida, home+away)
  bMu: number;
  // ratings Elo de produção de corner
  rMu: number;
  tot: number;
};
const samples: S[] = [];
let cornerLeagueSum = 0, cornerLeagueN = 0;

for (const e of pool) {
  const hasCorner = e.ch != null && e.ca != null;

  // elegibilidade: ambos os times com histórico suficiente de corner
  const hN = nGames.get(e.home) ?? 0, aN = nGames.get(e.away) ?? 0;
  const hCF = cf.get(e.home) ?? [], aCF = cf.get(e.away) ?? [];
  const eligibleElo = hN >= MIN_HIST && aN >= MIN_HIST;
  const eligibleBase = hCF.length >= MIN_CORNER_HIST && aCF.length >= MIN_CORNER_HIST;

  if (hasCorner && eligibleElo && eligibleBase) {
    // ---- baseline: μ = média rolante de corner pró (encolhida p/ prior), home+away, SEM mando ----
    const muBaseH = shrinkRate(mean(hCF)!, hCF.length, CORNER_PRIOR, CORNER_PS);
    const muBaseA = shrinkRate(mean(aCF)!, aCF.length, CORNER_PRIOR, CORNER_PS);
    const bMu = muBaseH + muBaseA;

    // ---- ratings: λ_corner = μ0 · exp(att_próprio + def_adv + mando) ----
    const rLh = MU0 * Math.exp(g(att, e.home) + g(def, e.away) + H_ADV);
    const rLa = MU0 * Math.exp(g(att, e.away) + g(def, e.home));
    const rMu = rLh + rLa;

    samples.push({ bMu, rMu, tot: e.ch! + e.ca! });
  }

  // ---- update DEPOIS do snapshot (causal) — só quando há corner observado ----
  if (hasCorner) {
    const lh = MU0 * Math.exp(g(att, e.home) + g(def, e.away) + H_ADV);
    const la = MU0 * Math.exp(g(att, e.away) + g(def, e.home));
    const eH = (e.ch! - lh) / MU0, eA = (e.ca! - la) / MU0;
    att.set(e.home, cl(g(att, e.home) + LR * eH)); def.set(e.away, cl(g(def, e.away) + LR * eH));
    att.set(e.away, cl(g(att, e.away) + LR * eA)); def.set(e.home, cl(g(def, e.home) + LR * eA));
    push10(cf, e.home, e.ch!); push10(cf, e.away, e.ca!);
    nGames.set(e.home, (nGames.get(e.home) ?? 0) + 1);
    nGames.set(e.away, (nGames.get(e.away) ?? 0) + 1);
    cornerLeagueSum += e.ch! + e.ca!; cornerLeagueN += 2;
  }
}

const cs = cacheStats();
const cornAvg = cornerLeagueN > 0 ? cornerLeagueSum / cornerLeagueN : CORNER_PRIOR;
console.log(`\n############ ESCANTEIOS · RATINGS de PRODUÇÃO · POP=${POP} ############`);
console.log(`pool=${pool.length} · eval (hist≥${MIN_HIST}, corner)=${samples.length} · corner médio/time=${cornAvg.toFixed(2)} · mando(log)=${H_ADV} · cache ${cs.hits}h/${cs.misses}m`);
if (samples.length) {
  const bMu = samples.reduce((a, s) => a + s.bMu, 0) / samples.length;
  const rMu = samples.reduce((a, s) => a + s.rMu, 0) / samples.length;
  const tot = samples.reduce((a, s) => a + s.tot, 0) / samples.length;
  console.log(`μ_total médio — baseline=${bMu.toFixed(2)} · ratings=${rMu.toFixed(2)} · observado=${tot.toFixed(2)}\n`);
}

type M = { n: number; base: number; brier: number; ece: number; bss: number };
function metrics(p: number[], a: number[]): M {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  const bss = base > 0 && base < 1 ? brierSkillScore(p, a) : NaN;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss };
}
function fmt(m: M | null): string {
  if (!m || m.n < 20) return `n=${m?.n ?? 0} (rala)`;
  return `n=${String(m.n).padStart(4)} base=${m.base.toFixed(3)} Brier=${m.brier.toFixed(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${Number.isNaN(m.bss) ? "  n/a  " : (m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}`;
}
function band(p: number[], a: number[]): M | null {
  const pB: number[] = [], aB: number[] = [];
  for (let i = 0; i < p.length; i++) if (p[i]! >= 0.35 && p[i]! <= 0.65) { pB.push(p[i]!); aB.push(a[i]!); }
  return pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null;
}
function line(tag: string, p: number[], a: number[]) {
  console.log(`    ${tag}`);
  console.log(`        FULL  ${fmt(metrics(p, a))}`);
  console.log(`        BANDA ${fmt(band(p, a))}`);
}

// ----- ESCANTEIOS: BASELINE vs RATINGS DE PRODUÇÃO, por linha × R -----
console.log(`========== ESCANTEIOS (total; BASELINE-média vs RATINGS-produção) ==========`);
for (const R of RS) {
  for (const L of LINES) {
    const a = samples.map((s) => (s.tot > L ? 1 : 0));
    const pBase = samples.map((s) => probOverLine(s.bMu, L, R));
    const pRat = samples.map((s) => probOverLine(s.rMu, L, R));
    line(`R=${R} over ${L} · BASELINE `, pBase, a);
    line(`R=${R} over ${L} · RATINGS  `, pRat, a);
  }
}

console.log(`\n############ FIM ESCANTEIOS ${POP} (eval=${samples.length}, cache ${cacheStats().hits}h/${cacheStats().misses}m) ############`);
