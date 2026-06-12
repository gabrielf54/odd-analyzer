// AUDITORIA dos mercados de PARTIDA (gols, vitória/1X2, escanteios) numa POPULAÇÃO.
// Espelha o money-path real (src/pipeline.ts):
//  - gols/vitória: λ_home = forma_gols_pró(home) × (gols_sofridos(away)/liga); idem
//    away; Dixon-Coles scoreMatrix → probTotalOver (gols) / probs1x2 (vitória).
//  - escanteios: μ_total = teamRate(home corners) + teamRate(away corners) (NB2).
// Leave-one-out: usa só jogos ANTES do alvo (por event_date), exclui o alvo.
// oppMult neutro (forma base — mesmo critério dos mercados de jogador).
// Uso: npx tsx scripts/audit-match-markets.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { windowedRate } from "../src/model/assemble.js";
import { shrinkRate } from "../src/model/shrinkage.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier } from "../src/model/adjustments.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "selecao") as "selecao" | "clube";
const LEAGUES = POP === "selecao"
  ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]
  : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const EVENTS_PER_LEAGUE = POP === "selecao" ? 40 : 50;
const TARGET = POP === "selecao" ? 800 : 1000;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

const dateOf = (e: any) => String(e?.event_date ?? e?.date ?? e?.start_time ?? "");
async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

// histórico finished do time ANTES de `beforeDate` (exclui o alvo), até 10 jogos
async function teamHistBefore(teamId: string, beforeDate: string, targetId: string) {
  let evs: any;
  try { evs = await client.events({ team_id: teamId, status: "finished", limit: 50 }); } catch { return []; }
  const all: any[] = evs?.results ?? [];
  return all.filter((e) => String(e.id) !== targetId && dateOf(e) < beforeDate).slice(0, 10);
}
async function cornersOwnSide(ev: any, teamId: string): Promise<number | null> {
  const side = String(ev.home_team_id) === teamId ? "home" : "away";
  try { const st = (await client.eventStats(ev.id))?.stats ?? {}; const v = st[side]?.corner_kicks; return v == null ? null : Number(v); }
  catch { return null; }
}

type Sample = {
  // gols/vitória
  lForHome: number; lAgHome: number; lForAway: number; lAgAway: number;
  totGoals: number; homeWin: 0 | 1; draw: 0 | 1; awayWin: 0 | 1;
  // escanteios (null se sem dado de corner)
  muCornHome: number | null; muCornAway: number | null; totCorners: number | null;
};
const samples: Sample[] = [];

const CORNER_PRIOR = 5.0, CORNER_PS = 10;
function cornerMu(hist: any[], teamId: string, isHome: boolean): Promise<number | null> {
  return (async () => {
    const games: Record<string, number>[] = [];
    for (const ev of hist) {
      const c = await cornersOwnSide(ev, teamId);
      if (c != null) games.push({ corner_kicks: c });
    }
    if (games.length < 3) return null;
    const rates = windowedRate(games, "corner_kicks");
    const raw = rates["w5"] ?? rates["w3"] ?? rates["w10"];
    if (raw == null) return null;
    const shrunk = shrinkRate(raw as number, games.length, CORNER_PRIOR, CORNER_PS);
    return shrunk * homeAwayMultiplier(isHome, 1.08, 0.92); // 90' já é a base do corner/jogo
  })();
}

outer:
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  const targets = (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE);
  const built = await mapPool(targets, 6, async (ev: any) => {
    if (ev.home_score == null || ev.away_score == null) return null;
    const hid = String(ev.home_team_id), aid = String(ev.away_team_id), d = dateOf(ev);
    const [hh, ah] = await Promise.all([teamHistBefore(hid, d, String(ev.id)), teamHistBefore(aid, d, String(ev.id))]);
    if (hh.length < 5 || ah.length < 5) return null;
    const goalsForAgainst = (hist: any[], tid: string) => {
      const f: number[] = [], a: number[] = [];
      for (const e of hist) {
        const isH = String(e.home_team_id) === tid;
        const g = isH ? e.home_score : e.away_score, c = isH ? e.away_score : e.home_score;
        if (g != null) f.push(Number(g)); if (c != null) a.push(Number(c));
      }
      const avg = (xs: number[]) => xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : null;
      return { lf: avg(f), la: avg(a) };
    };
    const gh = goalsForAgainst(hh, hid), ga = goalsForAgainst(aid === hid ? hh : ah, aid);
    if (gh.lf == null || ga.lf == null) return null;
    const [muCH, muCA] = await Promise.all([cornerMu(hh, hid, true), cornerMu(ah, aid, false)]);
    let totCorners: number | null = null;
    const ch = await cornersOwnSide(ev, hid), ca = await cornersOwnSide(ev, aid);
    if (ch != null && ca != null) totCorners = ch + ca;
    const hs = Number(ev.home_score), as = Number(ev.away_score);
    return {
      lForHome: gh.lf!, lAgHome: gh.la ?? gh.lf!, lForAway: ga.lf!, lAgAway: ga.la ?? ga.lf!,
      totGoals: hs + as, homeWin: hs > as ? 1 : 0, draw: hs === as ? 1 : 0, awayWin: as > hs ? 1 : 0,
      muCornHome: muCH, muCornAway: muCA, totCorners,
    } as Sample;
  });
  for (const s of built) if (s) samples.push(s);
  console.error(`[${POP}] liga ${lg} — partidas=${samples.length}`);
  if (samples.length >= TARGET) break outer;
}

const cs = cacheStats();
console.log(`\n############ PARTIDA · POPULAÇÃO=${POP} ############`);
console.log(`partidas=${samples.length} · ligas=${LEAGUES.join(",")} · cache ${cs.hits}h/${cs.misses}m\n`);

function rep(tag: string, p: number[], a: number[]) {
  if (p.length < 20) { console.log(`    ${tag}: n=${p.length} (pouco)`); return; }
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  const bss = base > 0 && base < 1 ? brierSkillScore(p, a) : NaN;
  console.log(`    ${tag}: n=${String(p.length).padStart(4)} base=${base.toFixed(3)} Brier=${brierScore(p, a).toFixed(4)} ECE=${expectedCalibrationError(p, a).toFixed(4)} BrierSkill=${Number.isNaN(bss) ? "n/a" : (bss >= 0 ? "+" : "") + bss.toFixed(4)}`);
}

const LEAGUE = 1.3;
// pré-computa λ e matriz por amostra
const mat = samples.map((s) => {
  const lh = s.lForHome * (s.lAgAway / LEAGUE);
  const la = s.lForAway * (s.lAgHome / LEAGUE);
  return scoreMatrix(lh, la);
});

// ----- GOLS (totais) -----
console.log(`========== GOLS (totais; Dixon-Coles) ==========`);
for (const L of [1.5, 2.5, 3.5]) {
  const p = mat.map((m) => probTotalOver(m, L));
  const a = samples.map((s) => (s.totGoals > L ? 1 : 0));
  rep(`over ${L}`, p, a);
}

// ----- VITÓRIA (1X2) -----
console.log(`\n========== VITÓRIA (1X2; calibração das 3 saídas) ==========`);
{
  const ph = mat.map((m) => probs1x2(m).home), ah = samples.map((s) => s.homeWin);
  const pd = mat.map((m) => probs1x2(m).draw), ad = samples.map((s) => s.draw);
  const pa = mat.map((m) => probs1x2(m).away), aa = samples.map((s) => s.awayWin);
  rep("mandante vence", ph, ah);
  rep("empate        ", pd, ad);
  rep("visitante vence", pa, aa);
}

// ----- ESCANTEIOS (NB2 total) -----
console.log(`\n========== ESCANTEIOS (total; NB2 μ=home+away, forma base) ==========`);
{
  const have = samples.filter((s) => s.muCornHome != null && s.muCornAway != null && s.totCorners != null);
  console.log(`    (amostras com dado de corner: ${have.length}/${samples.length})`);
  for (const R of [2.5, 3.0, 3.5]) {
    for (const L of [8.5, 9.5, 10.5]) {
      const p: number[] = [], a: number[] = [];
      for (const s of have) {
        const mu = (s.muCornHome! + s.muCornAway!);
        p.push(probOverLine(mu, L, R)); a.push(s.totCorners! > L ? 1 : 0);
      }
      rep(`R=${R} over ${L}`, p, a);
    }
  }
}
console.log(`\n############ FIM PARTIDA ${POP} ############`);
