// Varredura de nb_dispersion (R) POR LINHA p/ o mercado de FALTAS (over 1.5 e 2.5),
// nas DUAS populações (seleção|clube), p/ RESOLVER a contradição do doc
// docs/features/mercados-nao-validados/README.md (frente D):
//   "tabela diz R-por-linha NÃO testado" × "exp posição diz GLOBAL-BEST já cobriu".
//
// O GLOBAL-BEST de recalibrate-position-conditioned.mts varreu R por banda SÓ p/
// faltas lines:[0.5, 1.5] — NUNCA over 2.5. Este script fecha o buraco: varre
// R∈{1.5,2.0,2.5,3.0,4.0} p/ faltas over 1.5 E 2.5, medindo NO PONTO DE APOSTA
// (banda prob∈[0.35,0.65]) + FULL, leave-one-out anti-espiada, settleField=fouls.
//
// Espelha audit-player-markets.mts (playerMuFromGames + probOverLine + oppMult
// neutro=1.0 → forma base; homeAway; PRIOR_STRENGTH=12; prior_rate=1.0 da config).
// NÃO edita src/. Usa o cache de disco compartilhado (scripts/.cache/bsd).
//
// GRADUA se algum (linha, R) tem BANDA BrierSkill>0 E ECE≤~0.05.
// Uso: npx tsx scripts/recalibrate-faltas-dispersion.mts <selecao|clube>
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
const PRIOR_RATE = 1.0;          // = config faltas (markets.ts)
const LINES = [0.5, 1.5, 2.5];    // 0.5 = controle (estrela viva); 1.5/2.5 = alvo
const R_SWEEP = [1.5, 2.0, 2.5, 3.0, 4.0];

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Game = Record<string, number>;
type Sample = { games: Game[]; isHome: boolean; actual: number };
const samples: Sample[] = [];

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
        .map((g: any) => ({ minutes_played: Number(g.minutes_played ?? 0), fouls: Number(g.fouls ?? 0) }) as Game);
      if (games.length < 10) return null;
      const isHome = String(r.team_id) === String(ev.home_team_id);
      return { games, isHome, actual: Number(r.fouls ?? 0) } as Sample;
    });
    for (const s of built) { if (s) samples.push(s); }
    console.error(`[${POP}] liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}

const cs = cacheStats();
console.log(`\n############ FALTAS · R POR LINHA · POP=${POP} ############`);
console.log(`amostra=${samples.length} · prior_rate=${PRIOR_RATE} · PRIOR_STRENGTH=${PRIOR_STRENGTH} · cache ${cs.hits}h/${cs.misses}m\n`);

// μ por amostra (forma base, oppMult=1.0, minutos=90) — idêntico ao money-path
const mus = samples.map((s) => {
  const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
  const m = playerMuFromGames(s.games, "fouls", PRIOR_RATE, PRIOR_STRENGTH, 1.0, ha, 90);
  return { mu: m?.mu ?? null, actual: s.actual };
}).filter((x) => x.mu != null) as { mu: number; actual: number }[];

function metrics(p: number[], a: number[]) {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  const bss = base > 0 && base < 1 ? brierSkillScore(p, a) : NaN;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss };
}
function fmt(m: { n: number; base: number; brier: number; ece: number; bss: number } | null): string {
  if (!m) return "banda rala (n<30)";
  return `n=${String(m.n).padStart(4)} base=${m.base.toFixed(3)} Brier=${m.brier.toFixed(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${Number.isNaN(m.bss) ? "  n/a  " : (m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}`;
}
function evalLine(L: number, R: number) {
  const pF: number[] = [], aF: number[] = [], pB: number[] = [], aB: number[] = [];
  for (const x of mus) {
    const prob = probOverLine(x.mu, L, R);
    const a = x.actual > L ? 1 : 0;
    pF.push(prob); aF.push(a);
    if (prob >= 0.35 && prob <= 0.65) { pB.push(prob); aB.push(a); }
  }
  const band = pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null;
  return { full: metrics(pF, aF), band };
}

for (const L of LINES) {
  const tag = L === 0.5 ? "  [linha viva — controle]" : "  [alvo]";
  console.log(`\n========== FALTAS over ${L}${tag} ==========`);
  let bestBand: { R: number; bss: number; ece: number } | null = null;
  for (const R of R_SWEEP) {
    const { full, band } = evalLine(L, R);
    console.log(`  R=${R.toFixed(1)}  FULL  ${fmt(full)}`);
    console.log(`  R=${R.toFixed(1)}  BANDA ${fmt(band)}`);
    if (band && !Number.isNaN(band.bss) && (!bestBand || band.bss > bestBand.bss)) {
      bestBand = { R, bss: band.bss, ece: band.ece };
    }
  }
  if (bestBand) {
    const grad = bestBand.bss > 0 && bestBand.ece <= 0.05;
    console.log(`  >>> MELHOR R por banda: R=${bestBand.R} BrierSkill=${(bestBand.bss >= 0 ? "+" : "") + bestBand.bss.toFixed(4)} ECE=${bestBand.ece.toFixed(4)} → ${grad ? "GRADUA (BrierSkill>0 E ECE≤0.05)" : "NÃO gradua"}`);
  } else {
    console.log(`  >>> banda rala em todo R — sem veredito de banda`);
  }
}

console.log(`\n############ FIM ${POP} (amostra=${samples.length}, cache ${cacheStats().hits}h/${cacheStats().misses}m) ############`);
