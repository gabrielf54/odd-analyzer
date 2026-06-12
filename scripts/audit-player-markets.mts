// AUDITORIA de calibração dos mercados de JOGADOR (sot, finalizacoes, desarmes,
// faltas, passes) numa POPULAÇÃO (seleção|clube). Espelha o money-path real
// (playerMuFromGames + probOverLine + decomposição do desarme + opp_mode do passe),
// leave-one-out anti-espiada (exclui o jogo-alvo, exige ≥10 jogos), oppMult neutro
// (testa a FORMA base — mesmo critério que graduou os mercados atuais).
//
// MEDE NO CAMPO QUE A CASA LIQUIDA (settleField). Reporta por LINHA fixa (padrão de
// graduação) E na BANDA DE APOSTA (prob∈[0.35,0.65] — onde a casa põe a linha; pega
// o artefato de pooling). Passes usa o método de offset (linha≈μ) por μ ser grande.
//
// Uso: npx tsx scripts/audit-player-markets.mts <selecao|clube>
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
const PRIOR_STRENGTH = 12;
const MIN_MIN = 60;

const GAME_FIELDS = ["minutes_played", "shots_on_target", "total_shots", "total_tackle", "won_tackle", "fouls", "total_pass", "total_cross"] as const;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Game = Record<string, number>;
type Sample = { games: Game[]; isHome: boolean; actualMin: number; actual: Record<string, number> };
const samples: Sample[] = [];
let sumWonAll = 0, sumTotAll = 0; // p/ wr média da liga (desarme)

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
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
      sumWonAll += s.actual.won_tackle!; sumTotAll += s.actual.total_tackle!;
      samples.push(s);
    }
    console.error(`[${POP}] liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}

const wrLeague = sumTotAll > 0 ? sumWonAll / sumTotAll : 0.62;
const cs = cacheStats();
console.log(`\n############ POPULAÇÃO=${POP} ############`);
console.log(`amostra total=${samples.length} · ligas=${LEAGUES.join(",")} · wr-liga(desarme won/total)=${wrLeague.toFixed(3)} · cache ${cs.hits}h/${cs.misses}m\n`);

// ---------- métricas ----------
function metrics(p: number[], a: number[]) {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  const bss = base > 0 && base < 1 ? brierSkillScore(p, a) : NaN;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss };
}
function fmt(m: { n: number; base: number; brier: number; ece: number; bss: number }) {
  return `n=${String(m.n).padStart(4)} base=${m.base.toFixed(3)} Brier=${m.brier.toFixed(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${Number.isNaN(m.bss) ? "  n/a  " : (m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}`;
}

// μ por amostra p/ um campo (forma base, oppMult=1.0, minutos=90)
function musFor(field: string, prior: number): { mu: number; idx: number }[] {
  const out: { mu: number; idx: number }[] = [];
  samples.forEach((s, idx) => {
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, field, prior, PRIOR_STRENGTH, 1.0, ha, 90);
    if (m?.mu != null) out.push({ mu: m.mu, idx });
  });
  return out;
}

// avalia um conjunto de (mu, actual) por LINHA fixa + banda de aposta contestada
function evalLine(mus: { mu: number; actual: number }[], L: number, R: number) {
  const pFull: number[] = [], aFull: number[] = [], pBand: number[] = [], aBand: number[] = [];
  for (const x of mus) {
    const prob = probOverLine(x.mu, L, R);
    const a = x.actual > L ? 1 : 0;
    pFull.push(prob); aFull.push(a);
    if (prob >= 0.35 && prob <= 0.65) { pBand.push(prob); aBand.push(a); }
  }
  const full = metrics(pFull, aFull);
  const band = pBand.length >= 30 && aBand.some((v) => v === 1) && aBand.some((v) => v === 0)
    ? metrics(pBand, aBand) : null;
  return { full, band };
}

// ===== mercados de contagem com linha fixa =====
const COUNT = [
  { name: "sot", field: "shots_on_target", settle: "shots_on_target", prior: 0.4, lines: [0.5, 1.5, 2.5], Rs: [2.0, 2.5, 3.0, 3.5, 4.0], prod: 3.0 },
  { name: "finalizacoes", field: "total_shots", settle: "total_shots", prior: 1.2, lines: [0.5, 1.5, 2.5], Rs: [2.0, 2.5, 3.0, 3.5, 4.0], prod: 3.0 },
  { name: "faltas", field: "fouls", settle: "fouls", prior: 1.0, lines: [0.5, 1.5, 2.5], Rs: [2.0, 2.5, 3.0, 3.5], prod: 2.5 },
];

for (const mk of COUNT) {
  console.log(`\n========== ${mk.name.toUpperCase()} (campo=${mk.field}, settle=${mk.settle}, prior=${mk.prior}) ==========`);
  const mus0 = musFor(mk.field, mk.prior);
  const mus = mus0.map((x) => ({ mu: x.mu, actual: samples[x.idx]!.actual[mk.settle]! }));
  for (const L of mk.lines) {
    console.log(`  over ${L}:`);
    for (const R of mk.Rs) {
      const { full, band } = evalLine(mus, L, R);
      const tag = R === mk.prod ? " <PROD>" : "";
      console.log(`    R=${R.toFixed(1)}${tag}  FULL  ${fmt(full)}`);
      if (band) console.log(`    R=${R.toFixed(1)}${tag}  BANDA ${fmt(band)}`);
    }
  }
}

// ===== DESARME: decomposição μ_tentativas × aproveitamento(won/total shrink) =====
{
  console.log(`\n========== DESARMES (decomp: μ_total_tackle × winRate→won_tackle, settle=won_tackle) ==========`);
  const K_SHRINK = [20, 40, 80];
  const Rs = [1.5, 2.0, 2.5, 3.0];
  const PROD_R = 2.0, PROD_K = 40;
  const att = musFor("total_tackle", 1.3); // μ tentativas
  for (const L of [0.5, 1.5, 2.5]) {
    console.log(`  over ${L} (won_tackle):`);
    for (const R of Rs) for (const k of K_SHRINK) {
      const mus = att.map((x) => {
        const g = samples[x.idx]!.games;
        let sw = 0, st = 0;
        for (const gg of g) { sw += gg.won_tackle!; st += gg.total_tackle!; }
        const wr = (sw + k * wrLeague) / (st + k);
        return { mu: x.mu * wr, actual: samples[x.idx]!.actual.won_tackle! };
      });
      const { full, band } = evalLine(mus, L, R);
      const tag = R === PROD_R && k === PROD_K ? " <PROD>" : "";
      console.log(`    R=${R.toFixed(1)} k=${String(k).padStart(2)}${tag}  FULL  ${fmt(full)}`);
      if (band) console.log(`    R=${R.toFixed(1)} k=${String(k).padStart(2)}${tag}  BANDA ${fmt(band)}`);
    }
  }
}

// ===== PASSES: método de OFFSET (linha≈μ; μ grande, sem linha fixa) =====
{
  console.log(`\n========== PASSES (campo=total_pass, settle=total_pass, opp_mode=none) ==========`);
  const PS_SWEEP = [5, 8, 12];
  const R_SWEEP: (number | null)[] = [8, 12, 20, 40, null];
  const OFFSETS = [-5, 0, 5];
  // prior_rate = mediana total_pass/90
  const rate90 = samples.map((s) => (s.actual.total_pass! / s.actualMin) * 90).filter((x) => Number.isFinite(x));
  const sorted = [...rate90].sort((a, b) => a - b);
  const prior_rate = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  console.log(`  prior_rate(mediana total_pass/90)=${prior_rate.toFixed(2)} (n=${samples.length})`);
  let bestOff0: { ps: number; r: number | null; bss: number; ece: number } | null = null;
  for (const PS of PS_SWEEP) {
    const mus = samples.map((s) => {
      const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
      const m = playerMuFromGames(s.games, "total_pass", prior_rate, PS, 1.0, ha, s.actualMin);
      return { mu: m?.mu ?? null, actual: s.actual.total_pass! };
    }).filter((x) => x.mu != null) as { mu: number; actual: number }[];
    for (const R of R_SWEEP) {
      const byOff: Record<number, { p: number[]; a: number[] }> = {};
      for (const off of OFFSETS) byOff[off] = { p: [], a: [] };
      for (const x of mus) for (const off of OFFSETS) {
        const k = Math.round(x.mu) + off; if (k < 1) continue;
        byOff[off]!.p.push(probOverLine(x.mu, k - 0.5, R)); byOff[off]!.a.push(x.actual >= k ? 1 : 0);
      }
      const o0 = byOff[0]!;
      const m0 = (o0.a.some((v) => v === 1) && o0.a.some((v) => v === 0)) ? metrics(o0.p, o0.a) : null;
      const Rl = R === null ? "Poisson" : `R=${R}`;
      if (m0) {
        console.log(`  PS=${PS} ${Rl}  off=0(linha≈μ)  ${fmt(m0)}`);
        if (!bestOff0 || m0.bss > bestOff0.bss) bestOff0 = { ps: PS, r: R, bss: m0.bss, ece: m0.ece };
      }
    }
  }
  if (bestOff0) console.log(`  >>> MELHOR off=0: PS=${bestOff0.ps} ${bestOff0.r === null ? "Poisson" : "R=" + bestOff0.r} BrierSkill=${bestOff0.bss.toFixed(4)} ECE=${bestOff0.ece.toFixed(4)}`);
}

console.log(`\n############ FIM ${POP} (amostra=${samples.length}) ############`);
