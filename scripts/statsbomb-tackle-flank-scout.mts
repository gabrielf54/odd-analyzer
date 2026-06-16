/**
 * SCOUT (de-risk, NÃO build) — eixo DIRECIONAL no DESARME.
 *
 * Hipótese (exemplo canônico do CLAUDE.md):
 *   "Time A ataca muito pela esquerda + lateral-direito do Time B desarma muito
 *    → over desarmes do lateral-direito tem valor."
 *
 * Teste decisivo, OUT-OF-SAMPLE (leave-one-out por defensor):
 *   Para cada (lateral × jogo) prever a contagem de desarmes do lateral com:
 *     A (não-direcional): só a média do próprio lateral (forma) + ajuste de minutos.
 *     B (direcional):     A + tendência-de-ataque-por-flanco do adversário daquele
 *                          jogo, atribuída ao FLANCO do defensor.
 *   Compara MAE / Poisson-deviance / Brier(over0.5, over1.5) de B vs A.
 *
 * Dado: StatsBomb Open Data (grátis). População SELEÇÃO:
 *   WC2022 (43/106), Euro2024 (55/282), CopaAmerica2024 (223/282), AFCON2023 (1267/107).
 *
 * NÃO integra em src/. Cache em tmp/statsbomb/ (não commitar).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CACHE = "tmp/statsbomb";
mkdirSync(CACHE, { recursive: true });
const BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";

const COMPS: Array<[number, number, string]> = [
  [43, 106, "WC2022"],
  [55, 282, "Euro2024"],
  [223, 282, "CopaAmerica2024"],
  [1267, 107, "AFCON2023"],
];

async function getJson(url: string, cachePath: string): Promise<any> {
  const full = join(CACHE, cachePath);
  if (existsSync(full)) {
    try {
      return JSON.parse(readFileSync(full, "utf8"));
    } catch {
      /* re-fetch if corrupt */
    }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const txt = await r.text();
  writeFileSync(full, txt);
  return JSON.parse(txt);
}

// ---- field geometry (StatsBomb 120x80, in-possession team attacks left->right) ----
const FINAL_THIRD_X = 80; // x>=80 = attacking final third
const Y_LEFT = 80 / 3; // ~26.67  -> attacker's LEFT flank
const Y_RIGHT = (80 * 2) / 3; // ~53.33 -> attacker's RIGHT flank

const BACK_POSITIONS = new Set([
  "Right Back",
  "Left Back",
  "Right Wing Back",
  "Left Wing Back",
]);
function flankOfBack(pos: string): "L" | "R" | null {
  if (pos === "Left Back" || pos === "Left Wing Back") return "L";
  if (pos === "Right Back" || pos === "Right Wing Back") return "R";
  return null;
}

interface DefenderGame {
  comp: string;
  matchId: number;
  defenderId: number;
  defenderName: string;
  teamId: number;
  oppTeamId: number;
  flank: "L" | "R"; // defender's flank
  minutes: number; // minutes the player held a back position
  tackles: number; // tackle-duels by this player while in a back position
  // opponent attack tendency (share of opp final-third actions by attacker flank)
  oppLeftShare: number;
  oppRightShare: number;
  // signal attributed to THIS defender:
  //   right back faces opponent's LEFT-flank attack; left back faces opp's RIGHT-flank attack
  facedFlankShare: number;
  oppFinalThirdActions: number;
}

function parseClock(s: string | null): number {
  // "MM:SS" -> minutes (float). null/undefined handled by caller.
  if (!s) return NaN;
  const [mm, ss] = s.split(":").map(Number);
  return mm + (ss || 0) / 60;
}

async function buildPanel(): Promise<DefenderGame[]> {
  const rows: DefenderGame[] = [];
  let matchesLoaded = 0;
  let matchesFailed = 0;

  const LIMIT = process.env.SCOUT_LIMIT ? parseInt(process.env.SCOUT_LIMIT, 10) : Infinity;
  for (const [c, s, name] of COMPS) {
    const matches: any[] = await getJson(
      `${BASE}/matches/${c}/${s}.json`,
      `matches_${c}_${s}.json`,
    );
    for (const m of matches) {
      if (matchesLoaded >= LIMIT) break;
      const matchId = m.match_id;
      let events: any[];
      let lineups: any[];
      try {
        events = await getJson(
          `${BASE}/events/${matchId}.json`,
          `events_${matchId}.json`,
        );
        lineups = await getJson(
          `${BASE}/lineups/${matchId}.json`,
          `lineups_${matchId}.json`,
        );
      } catch (e) {
        matchesFailed++;
        continue;
      }
      matchesLoaded++;

      const teamIds = lineups.map((t) => t.team_id);
      if (teamIds.length !== 2) continue;

      // --- opponent attack tendency: final-third actions (passes + carries) by attacker flank ---
      // share per team of its OWN final-third actions falling on left vs right flank.
      const ftCount: Record<number, { L: number; C: number; R: number; total: number }> = {};
      for (const t of teamIds) ftCount[t] = { L: 0, C: 0, R: 0, total: 0 };
      for (const e of events) {
        const tn = e.type && e.type.name;
        if (tn !== "Pass" && tn !== "Carry") continue;
        const loc = e.location;
        if (!loc || loc.length < 2) continue;
        if (loc[0] < FINAL_THIRD_X) continue;
        const teamId = e.team && e.team.id;
        if (ftCount[teamId] === undefined) continue;
        const y = loc[1];
        if (y < Y_LEFT) ftCount[teamId].L++;
        else if (y > Y_RIGHT) ftCount[teamId].R++;
        else ftCount[teamId].C++;
        ftCount[teamId].total++;
      }

      // --- tackles per player while in a back position, with minutes in that position ---
      // Build per-player back-position intervals from lineups.
      interface BackPlayer {
        id: number;
        name: string;
        teamId: number;
        flank: "L" | "R";
        minutes: number;
      }
      const backPlayers: BackPlayer[] = [];
      for (const t of lineups) {
        for (const p of t.lineup) {
          let mins = 0;
          let flank: "L" | "R" | null = null;
          for (const pos of p.positions || []) {
            if (!BACK_POSITIONS.has(pos.position)) continue;
            const fk = flankOfBack(pos.position);
            const from = parseClock(pos.from);
            // 'to' null = played to the end; approximate end at 95'
            const to = pos.to ? parseClock(pos.to) : 95;
            const dur = isFinite(from) && isFinite(to) ? Math.max(0, to - from) : 0;
            // account second-period offsets crudely: StatsBomb 'from'/'to' are absolute match clock already.
            mins += dur;
            if (flank === null) flank = fk; // first back flank seen
          }
          if (mins > 0 && flank) {
            backPlayers.push({
              id: p.player_id,
              name: p.player_name,
              teamId: t.team_id,
              flank,
              minutes: mins,
            });
          }
        }
      }

      // count tackle-duels per player while their event position is a back slot
      const tackleByPlayer: Record<number, number> = {};
      for (const e of events) {
        if (!(e.type && e.type.name === "Duel")) continue;
        if (!(e.duel && e.duel.type && e.duel.type.name === "Tackle")) continue;
        const pos = e.position && e.position.name;
        if (!pos || !BACK_POSITIONS.has(pos)) continue;
        const pid = e.player && e.player.id;
        if (pid == null) continue;
        tackleByPlayer[pid] = (tackleByPlayer[pid] || 0) + 1;
      }

      for (const bp of backPlayers) {
        const oppId = teamIds.find((x) => x !== bp.teamId)!;
        const opp = ftCount[oppId];
        if (!opp || opp.total < 20) continue; // need enough opp final-third actions to estimate tendency
        const oppLeftShare = opp.L / opp.total;
        const oppRightShare = opp.R / opp.total;
        // right back faces opp's LEFT attack; left back faces opp's RIGHT attack
        const faced = bp.flank === "R" ? oppLeftShare : oppRightShare;
        rows.push({
          comp: name,
          matchId,
          defenderId: bp.id,
          defenderName: bp.name,
          teamId: bp.teamId,
          oppTeamId: oppId,
          flank: bp.flank,
          minutes: bp.minutes,
          tackles: tackleByPlayer[bp.id] || 0,
          oppLeftShare,
          oppRightShare,
          facedFlankShare: faced,
          oppFinalThirdActions: opp.total,
        });
      }
    }
    console.error(`[${name}] cumulative matches loaded=${matchesLoaded} failed=${matchesFailed}`);
  }
  console.error(`PANEL: ${rows.length} (defender x game) rows; matches loaded=${matchesLoaded} failed=${matchesFailed}`);
  return rows;
}

// ---------------- modelling ----------------

function mean(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}

/**
 * Leave-one-out per defender.
 * For each row i of defender d:
 *   - history = d's OTHER games (j != i).
 *   - A: predicted tackles = mean(history tackles) * (minutes_i / mean(history minutes))
 *        (minutes-adjusted form). If <2 history games -> fall back to global mean rate.
 *   - B: A, then add a directional term fit on the SAME history:
 *        within history, regress (tackles - A_baseline_for_that_game) on
 *        centered facedFlankShare; apply coefficient to row i's centered facedFlankShare.
 *        Coefficient is shrunk toward 0 and clipped to keep it honest with small N.
 */
interface Eval {
  n: number;
  maeA: number;
  maeB: number;
  pdevA: number;
  pdevB: number;
  brierA05: number;
  brierB05: number;
  brierA15: number;
  brierB15: number;
  bWinsRowPct: number; // % rows where |B err| < |A err|
}

function poissonDev(y: number, mu: number): number {
  mu = Math.max(mu, 1e-6);
  const t = y > 0 ? y * Math.log(y / mu) : 0;
  return 2 * (t - (y - mu));
}

function evaluate(rows: DefenderGame[], shrink: number, dirClip: number): Eval {
  // group by defender
  const byDef = new Map<number, DefenderGame[]>();
  for (const r of rows) {
    if (!byDef.has(r.defenderId)) byDef.set(r.defenderId, []);
    byDef.get(r.defenderId)!.push(r);
  }
  const globalRate = mean(rows.map((r) => r.tackles / Math.max(r.minutes, 1))); // tackles per minute
  const globalFaced = mean(rows.map((r) => r.facedFlankShare));

  let n = 0;
  let seA = 0,
    seB = 0,
    pdA = 0,
    pdB = 0;
  let br05A = 0,
    br05B = 0,
    br15A = 0,
    br15B = 0;
  let bWins = 0;

  for (const [, games] of byDef) {
    if (games.length < 3) continue; // need >=2 history + 1 held-out
    for (let i = 0; i < games.length; i++) {
      const test = games[i];
      const hist = games.filter((_, j) => j !== i);
      if (hist.length < 2) continue;

      const histMinutes = mean(hist.map((g) => g.minutes));
      const histTackles = mean(hist.map((g) => g.tackles));
      const histRate = histTackles / Math.max(histMinutes, 1);
      // minutes-adjusted baseline (shrunk toward global rate by sample size)
      const w = hist.length / (hist.length + 3);
      const rate = w * histRate + (1 - w) * globalRate;
      const muA = Math.max(rate * test.minutes, 0.05);

      // directional fit on history: residual vs centered facedFlankShare
      // residual_j = tackles_j - baseline_j (baseline_j uses same rate * minutes_j)
      let num = 0,
        den = 0;
      for (const g of hist) {
        const base = rate * g.minutes;
        const xc = g.facedFlankShare - globalFaced;
        num += xc * (g.tackles - base);
        den += xc * xc;
      }
      let beta = den > 1e-9 ? num / den : 0;
      // shrink toward 0 (honest with small N) and clip
      beta = beta * (hist.length / (hist.length + shrink));
      beta = Math.max(-dirClip, Math.min(dirClip, beta));
      const xcTest = test.facedFlankShare - globalFaced;
      const muB = Math.max(muA + beta * xcTest, 0.05);

      const y = test.tackles;
      const eA = Math.abs(y - muA);
      const eB = Math.abs(y - muB);
      seA += eA;
      seB += eB;
      pdA += poissonDev(y, muA);
      pdB += poissonDev(y, muB);
      // Brier over 0.5 and over 1.5 via Poisson P(>=1), P(>=2)
      const pA1 = 1 - Math.exp(-muA);
      const pB1 = 1 - Math.exp(-muB);
      const pA2 = 1 - Math.exp(-muA) * (1 + muA);
      const pB2 = 1 - Math.exp(-muB) * (1 + muB);
      const o1 = y >= 1 ? 1 : 0;
      const o2 = y >= 2 ? 1 : 0;
      br05A += (pA1 - o1) ** 2;
      br05B += (pB1 - o1) ** 2;
      br15A += (pA2 - o2) ** 2;
      br15B += (pB2 - o2) ** 2;
      if (eB < eA - 1e-9) bWins++;
      n++;
    }
  }
  return {
    n,
    maeA: seA / n,
    maeB: seB / n,
    pdevA: pdA / n,
    pdevB: pdB / n,
    brierA05: br05A / n,
    brierB05: br05B / n,
    brierA15: br15A / n,
    brierB15: br15B / n,
    bWinsRowPct: (100 * bWins) / n,
  };
}

function report(label: string, e: Eval) {
  console.log(`\n=== ${label} (n=${e.n}) ===`);
  console.log(`  MAE        A=${e.maeA.toFixed(4)}  B=${e.maeB.toFixed(4)}  Δ=${(e.maeB - e.maeA).toFixed(4)} ${e.maeB < e.maeA ? "(B better)" : "(A better/=)"}`);
  console.log(`  PoissonDev A=${e.pdevA.toFixed(4)}  B=${e.pdevB.toFixed(4)}  Δ=${(e.pdevB - e.pdevA).toFixed(4)} ${e.pdevB < e.pdevA ? "(B better)" : "(A better/=)"}`);
  console.log(`  Brier o0.5 A=${e.brierA05.toFixed(4)}  B=${e.brierB05.toFixed(4)}  Δ=${(e.brierB05 - e.brierA05).toFixed(4)} ${e.brierB05 < e.brierA05 ? "(B better)" : "(A better/=)"}`);
  console.log(`  Brier o1.5 A=${e.brierA15.toFixed(4)}  B=${e.brierB15.toFixed(4)}  Δ=${(e.brierB15 - e.brierA15).toFixed(4)} ${e.brierB15 < e.brierA15 ? "(B better)" : "(A better/=)"}`);
  console.log(`  B wins per-row: ${e.bWinsRowPct.toFixed(1)}%`);
}

// diagnostic: is facedFlankShare even correlated with tackles raw?
function rawCorr(rows: DefenderGame[]) {
  const x = rows.map((r) => r.facedFlankShare);
  const y = rows.map((r) => r.tackles);
  const mx = mean(x),
    my = mean(y);
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const r = num / Math.sqrt(dx * dy);
  console.log(`\n[diag] raw corr(facedFlankShare, tackles) = ${r.toFixed(4)} (r²=${(r * r).toFixed(4)})  n=${rows.length}`);
  // also corr of tackles with minutes (sanity: minutes should correlate)
  const ym = rows.map((r) => r.minutes);
  const mm = mean(ym);
  let n2 = 0,
    dm = 0;
  for (let i = 0; i < ym.length; i++) {
    n2 += (ym[i] - mm) * (y[i] - my);
    dm += (ym[i] - mm) ** 2;
  }
  console.log(`[diag] raw corr(minutes, tackles) = ${(n2 / Math.sqrt(dm * dy)).toFixed(4)}`);
  console.log(`[diag] facedFlankShare mean=${mean(x).toFixed(3)} min=${Math.min(...x).toFixed(3)} max=${Math.max(...x).toFixed(3)}`);
  console.log(`[diag] tackles mean=${my.toFixed(3)} max=${Math.max(...y)}`);
}

// robustness: split sample in half deterministically, re-run, see if direction holds
function robustnessHalves(rows: DefenderGame[]) {
  const sorted = [...rows].sort((a, b) => a.matchId - b.matchId);
  const half1 = sorted.filter((_, i) => i % 2 === 0);
  const half2 = sorted.filter((_, i) => i % 2 === 1);
  console.log("\n----- ROBUSTNESS: split-half (does B's edge survive less data?) -----");
  report("HALF 1", evaluate(half1, 6, 0.5));
  report("HALF 2", evaluate(half2, 6, 0.5));
}

async function main() {
  const panel = await buildPanel();
  // coverage summary
  const byComp: Record<string, number> = {};
  for (const r of panel) byComp[r.comp] = (byComp[r.comp] || 0) + 1;
  console.log("\nCoverage (defender-games) by comp:", JSON.stringify(byComp));
  const defs = new Set(panel.map((r) => r.defenderId));
  console.log(`Distinct defenders: ${defs.size}, total defender-games: ${panel.length}`);
  const multi = [...new Set(panel.map((r) => r.defenderId))].filter(
    (d) => panel.filter((r) => r.defenderId === d).length >= 3,
  );
  console.log(`Defenders with >=3 games (usable in LOO): ${multi.length}`);
  const usableRows = panel.filter((r) =>
    multi.includes(r.defenderId),
  ).length;
  console.log(`Defender-games usable in LOO: ${usableRows}`);

  rawCorr(panel);

  console.log("\n======== FULL SAMPLE: A (non-directional) vs B (directional) ========");
  // try a couple of shrink/clip settings to be fair to B
  report("B shrink=6 clip=0.5", evaluate(panel, 6, 0.5));
  report("B shrink=3 clip=1.0 (more aggressive)", evaluate(panel, 3, 1.0));
  report("B shrink=12 clip=0.3 (conservative)", evaluate(panel, 12, 0.3));

  robustnessHalves(panel);

  // also report with a SIMPLE pooled directional model (cross-defender), not per-defender LOO,
  // to check if the signal exists at all population-level out-of-fold.
  pooledDirectional(panel);

  // PLACEBO: shuffle facedFlankShare across rows (destroys any real matchup link),
  // re-run B. If real B doesn't clearly beat placebo B, the "edge" is noise.
  placeboTest(panel);
}

function placeboTest(rows: DefenderGame[]) {
  console.log("\n----- PLACEBO: shuffle facedFlankShare (does real beat random?) -----");
  const realEval = evaluate(rows, 6, 0.5);
  // seeded shuffle of facedFlankShare values across rows
  function mulberry32(a: number) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const deltas: number[] = [];
  for (let trial = 0; trial < 20; trial++) {
    const rng = mulberry32(1000 + trial);
    const shares = rows.map((r) => r.facedFlankShare);
    // Fisher-Yates
    for (let i = shares.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shares[i], shares[j]] = [shares[j], shares[i]];
    }
    const shuffled = rows.map((r, i) => ({ ...r, facedFlankShare: shares[i] }));
    const e = evaluate(shuffled, 6, 0.5);
    deltas.push(e.maeB - e.maeA); // negative = placebo "improved" too (=noise)
  }
  const realDelta = realEval.maeB - realEval.maeA;
  const placeboMean = mean(deltas);
  const placeboMin = Math.min(...deltas);
  console.log(`  REAL    MAE Δ(B-A) = ${realDelta.toFixed(5)}`);
  console.log(`  PLACEBO MAE Δ(B-A): mean=${placeboMean.toFixed(5)} best(min)=${placeboMin.toFixed(5)} over 20 shuffles`);
  const betterThanPlacebo = realDelta < placeboMin;
  console.log(`  Real edge beats EVERY placebo shuffle? ${betterThanPlacebo ? "YES (signal)" : "NO (indistinguishable from noise)"}`);
}

/**
 * Population-level out-of-fold check: 5-fold CV. Predict tackles from
 * (minutes-rate baseline per defender computed on train) + global directional beta (fit on train).
 * If even the pooled beta has the right sign AND improves held-out fit, that's a weak GO signal.
 */
function pooledDirectional(rows: DefenderGame[]) {
  console.log("\n----- POOLED 5-fold directional (population-level) -----");
  const k = 5;
  const sorted = [...rows].sort((a, b) => a.matchId - b.matchId);
  let seA = 0,
    seB = 0,
    n = 0;
  let betas: number[] = [];
  const globalFaced = mean(rows.map((r) => r.facedFlankShare));
  for (let fold = 0; fold < k; fold++) {
    const train = sorted.filter((_, i) => i % k !== fold);
    const test = sorted.filter((_, i) => i % k === fold);
    // per-defender rate on train
    const rateByDef = new Map<number, number>();
    const gRate = mean(train.map((r) => r.tackles / Math.max(r.minutes, 1)));
    const byDef = new Map<number, DefenderGame[]>();
    for (const r of train) {
      if (!byDef.has(r.defenderId)) byDef.set(r.defenderId, []);
      byDef.get(r.defenderId)!.push(r);
    }
    for (const [d, g] of byDef) {
      const w = g.length / (g.length + 3);
      const r = w * mean(g.map((x) => x.tackles / Math.max(x.minutes, 1))) + (1 - w) * gRate;
      rateByDef.set(d, r);
    }
    // global directional beta on train residuals
    let num = 0,
      den = 0;
    for (const r of train) {
      const rate = rateByDef.get(r.defenderId) ?? gRate;
      const base = rate * r.minutes;
      const xc = r.facedFlankShare - globalFaced;
      num += xc * (r.tackles - base);
      den += xc * xc;
    }
    const beta = den > 1e-9 ? num / den : 0;
    betas.push(beta);
    for (const r of test) {
      const rate = rateByDef.get(r.defenderId) ?? gRate;
      const muA = Math.max(rate * r.minutes, 0.05);
      const muB = Math.max(muA + beta * (r.facedFlankShare - globalFaced), 0.05);
      seA += Math.abs(r.tackles - muA);
      seB += Math.abs(r.tackles - muB);
      n++;
    }
  }
  console.log(`  pooled betas per fold: [${betas.map((b) => b.toFixed(3)).join(", ")}]  (sign consistency matters)`);
  console.log(`  MAE A=${(seA / n).toFixed(4)}  B=${(seB / n).toFixed(4)}  Δ=${((seB - seA) / 1).toFixed(4)}/${n}  ${seB < seA ? "(B better)" : "(A better/=)"}  n=${n}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
