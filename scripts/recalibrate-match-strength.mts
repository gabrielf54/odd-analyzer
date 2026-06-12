// TENTATIVA de calibrar os MERCADOS DE PARTIDA (gols, vitória/1X2, escanteios) que
// reprovaram com λ = média-gols-crua (auditoria 2026-06-11). Alavancas testadas:
//   (A) RATINGS de força ataque/defesa estilo Elo, atualizados CRONOLOGICAMENTE
//       (causal — só usa o passado), vs o baseline de média-crua.
//   (B) MANDO explícito populacional (clube>0, seleção≈0 campo neutro) — o baseline
//       atual não tem termo de mando nenhum (por isso o 1X2 de clube sub-prevê o
//       mandante). Ablação "baseline+mando" isola esse efeito no 1X2.
//   (C) ESCANTEIOS com eixo de CONCESSÃO (multiplicador de escanteios concedidos
//       pelo adversário), hoje neutralizado. Só clube tem corner_kicks (seleção=data-dead).
//
// Espelha audit-match-markets.mts no baseline e nas métricas (banda prob∈[0.35,0.65]).
// Leave-one-out natural: o passe cronológico só usa jogos ANTERIORES ao alvo.
// Uso: npx tsx scripts/recalibrate-match-strength.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { shrinkRate } from "../src/model/shrinkage.js";
import { probOverLine } from "../src/model/sotModel.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "selecao") as "selecao" | "clube";
const LEAGUES = POP === "selecao"
  ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]
  : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const EVENTS_PER_LEAGUE = 150;
const LEAGUE = 1.3;            // média-gols/time (baseline, igual à auditoria)
const MU0 = 1.3;              // base dos ratings
const LR = 0.08;             // learning rate do Elo de gols
const CLAMP = 0.6;           // limite |att|,|def|
const H_ADV = POP === "clube" ? 0.18 : 0.0; // mando em log (clube>0; seleção neutro)
const MIN_HIST = 5;          // jogos anteriores p/ entrar no eval
const CORNER_PRIOR = 5.0, CORNER_PS = 10, MIN_CORNER_HIST = 3;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });
const dateOf = (e: any) => String(e?.event_date ?? e?.date ?? e?.start_time ?? "");

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

// ---- coleta de eventos (pool cronológico) ----
type Ev = { id: string; date: string; home: string; away: string; hs: number; as: number; ch: number | null; ca: number | null };
const pool: Ev[] = [];
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  const rows: any[] = (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE);
  const built = await mapPool(rows, 6, async (ev: any) => {
    if (ev.home_score == null || ev.away_score == null) return null;
    let ch: number | null = null, ca: number | null = null;
    if (POP === "clube") {
      try {
        const st = (await client.eventStats(ev.id))?.stats ?? {};
        const h = st.home?.corner_kicks, a = st.away?.corner_kicks;
        ch = h == null ? null : Number(h); ca = a == null ? null : Number(a);
      } catch { /* sem corner */ }
    }
    return { id: String(ev.id), date: dateOf(ev), home: String(ev.home_team_id), away: String(ev.away_team_id), hs: Number(ev.home_score), as: Number(ev.away_score), ch, ca } as Ev;
  });
  for (const e of built) if (e) pool.push(e);
  console.error(`[${POP}] liga ${lg} — pool=${pool.length}`);
}
pool.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// ---- passe cronológico: ratings Elo + histórico rolante (gols e corners) ----
const att = new Map<string, number>(), def = new Map<string, number>();
const gf = new Map<string, number[]>(), ga = new Map<string, number[]>();
const cf = new Map<string, number[]>(), ca = new Map<string, number[]>();
const g = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
const push10 = (m: Map<string, number[]>, k: string, v: number) => { const a = m.get(k) ?? []; a.push(v); if (a.length > 10) a.shift(); m.set(k, a); };
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const clamp = (x: number) => Math.max(-CLAMP, Math.min(CLAMP, x));

type S = {
  // baseline
  bLh: number; bLa: number;
  // ratings
  rLh: number; rLa: number;
  totGoals: number; homeWin: number; draw: number; awayWin: number;
  // corners (clube)
  corn: { muBaseH: number; muBaseA: number; muConcH: number; muConcA: number; tot: number } | null;
};
const samples: S[] = [];
let cornerLeagueSum = 0, cornerLeagueN = 0;

for (const e of pool) {
  const hGF = gf.get(e.home) ?? [], hGA = ga.get(e.home) ?? [];
  const aGF = gf.get(e.away) ?? [], aGA = ga.get(e.away) ?? [];
  const eligible = hGF.length >= MIN_HIST && aGF.length >= MIN_HIST;

  if (eligible) {
    // baseline (igual auditoria): λ = ataque_próprio × defesa_adversário/liga, SEM mando
    const lfH = mean(hGF)!, laH = mean(hGA)!, lfA = mean(aGF)!, laA = mean(aGA)!;
    const bLh = lfH * (laA / LEAGUE), bLa = lfA * (laH / LEAGUE);
    // ratings: λ = μ0 · exp(att_próprio + def_adv + mando)
    const rLh = MU0 * Math.exp(g(att, e.home) + g(def, e.away) + H_ADV);
    const rLa = MU0 * Math.exp(g(att, e.away) + g(def, e.home));

    let corn: S["corn"] = null;
    if (POP === "clube") {
      const hCF = cf.get(e.home) ?? [], aCF = cf.get(e.away) ?? [];
      const hCA = ca.get(e.home) ?? [], aCA = ca.get(e.away) ?? [];
      if (e.ch != null && e.ca != null && hCF.length >= MIN_CORNER_HIST && aCF.length >= MIN_CORNER_HIST) {
        const cornAvg = cornerLeagueN > 0 ? cornerLeagueSum / cornerLeagueN : CORNER_PRIOR;
        const muBaseH = shrinkRate(mean(hCF)!, hCF.length, CORNER_PRIOR, CORNER_PS);
        const muBaseA = shrinkRate(mean(aCF)!, aCF.length, CORNER_PRIOR, CORNER_PS);
        // concessão: × (escanteios concedidos pelo adversário / média da liga)
        const concAvgAwayAgainst = mean(aCA), concAvgHomeAgainst = mean(hCA);
        const multH = concAvgAwayAgainst != null && cornAvg > 0 ? concAvgAwayAgainst / cornAvg : 1.0;
        const multA = concAvgHomeAgainst != null && cornAvg > 0 ? concAvgHomeAgainst / cornAvg : 1.0;
        corn = { muBaseH, muBaseA, muConcH: muBaseH * multH, muConcA: muBaseA * multA, tot: e.ch + e.ca };
      }
    }
    samples.push({
      bLh, bLa, rLh, rLa,
      totGoals: e.hs + e.as, homeWin: e.hs > e.as ? 1 : 0, draw: e.hs === e.as ? 1 : 0, awayWin: e.as > e.hs ? 1 : 0,
      corn,
    });
  }

  // ---- update DEPOIS de snapshot (causal) ----
  const lh = MU0 * Math.exp(g(att, e.home) + g(def, e.away) + H_ADV);
  const la = MU0 * Math.exp(g(att, e.away) + g(def, e.home));
  const eH = (e.hs - lh) / MU0, eA = (e.as - la) / MU0;
  att.set(e.home, clamp(g(att, e.home) + LR * eH)); def.set(e.away, clamp(g(def, e.away) + LR * eH));
  att.set(e.away, clamp(g(att, e.away) + LR * eA)); def.set(e.home, clamp(g(def, e.home) + LR * eA));
  push10(gf, e.home, e.hs); push10(ga, e.home, e.as);
  push10(gf, e.away, e.as); push10(ga, e.away, e.hs);
  if (POP === "clube" && e.ch != null && e.ca != null) {
    push10(cf, e.home, e.ch); push10(ca, e.home, e.ca);
    push10(cf, e.away, e.ca); push10(ca, e.away, e.ch);
    cornerLeagueSum += e.ch + e.ca; cornerLeagueN += 2;
  }
}

const cs = cacheStats();
console.log(`\n############ PARTIDA · RATINGS · POP=${POP} ############`);
console.log(`pool=${pool.length} · eval (hist≥${MIN_HIST})=${samples.length} · mando(log)=${H_ADV} · cache ${cs.hits}h/${cs.misses}m\n`);

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

// matrizes Dixon-Coles por modelo
const matB = samples.map((s) => scoreMatrix(s.bLh, s.bLa));
const matR = samples.map((s) => scoreMatrix(s.rLh, s.rLa));
// ablação 1X2: baseline + mando (só aplica exp(H_ADV) no mandante)
const matBmando = samples.map((s) => scoreMatrix(s.bLh * Math.exp(H_ADV), s.bLa));

// ----- GOLS -----
console.log(`========== GOLS (totais) ==========`);
for (const L of [1.5, 2.5, 3.5]) {
  const a = samples.map((s) => (s.totGoals > L ? 1 : 0));
  line(`over ${L} · BASELINE`, matB.map((m) => probTotalOver(m, L)), a);
  line(`over ${L} · RATINGS `, matR.map((m) => probTotalOver(m, L)), a);
}

// ----- VITÓRIA (1X2) -----
console.log(`\n========== VITÓRIA (1X2) ==========`);
{
  const ah = samples.map((s) => s.homeWin), ad = samples.map((s) => s.draw), aa = samples.map((s) => s.awayWin);
  line("mandante · BASELINE", matB.map((m) => probs1x2(m).home), ah);
  line("mandante · +MANDO  ", matBmando.map((m) => probs1x2(m).home), ah);
  line("mandante · RATINGS ", matR.map((m) => probs1x2(m).home), ah);
  line("visitante · BASELINE", matB.map((m) => probs1x2(m).away), aa);
  line("visitante · RATINGS ", matR.map((m) => probs1x2(m).away), aa);
  line("empate · RATINGS    ", matR.map((m) => probs1x2(m).draw), ad);
}

// ----- ESCANTEIOS (clube) -----
if (POP === "clube") {
  console.log(`\n========== ESCANTEIOS (total; concessão vs baseline) ==========`);
  const have = samples.filter((s) => s.corn != null);
  console.log(`    (amostras com corner: ${have.length}/${samples.length})`);
  for (const R of [2.5, 3.0, 3.5]) {
    for (const L of [8.5, 9.5, 10.5]) {
      const a = have.map((s) => (s.corn!.tot > L ? 1 : 0));
      const pBase = have.map((s) => probOverLine(s.corn!.muBaseH + s.corn!.muBaseA, L, R));
      const pConc = have.map((s) => probOverLine(s.corn!.muConcH + s.corn!.muConcA, L, R));
      line(`R=${R} over ${L} · BASELINE  `, pBase, a);
      line(`R=${R} over ${L} · CONCESSÃO `, pConc, a);
    }
  }
}

console.log(`\n############ FIM PARTIDA ${POP} (eval=${samples.length}, cache ${cacheStats().hits}h/${cacheStats().misses}m) ############`);
