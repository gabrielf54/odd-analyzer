// TENTATIVA: as linhas mortas melhoram com o EIXO DE MATCHUP (oppMult) LIGADO?
// A auditoria neutraliza oppMult (forma base). A tese do produto é CONFRONTO — então
// medimos as linhas mortas COM o multiplicador de concessão do adversário ligado
// (idêntico à produção: clamp [0.7,1.4]), vs sem. Se o confronto afiar a banda, gradua.
// μ escala linear no oppMult → basta multiplicar o μ_base por oppMult.
// settle: sot=shots_on_target, fin=total_shots, faltas=fouls, desarme=won_tackle(decomp).
// Uso: npx tsx scripts/recalibrate-matchup-axis.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { homeAwayMultiplier, opponentMultiplier } from "../src/model/adjustments.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "selecao") as "selecao" | "clube";
const SEL = POP === "selecao";
const LEAGUES = SEL ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67] : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const EVENTS_PER_LEAGUE = SEL ? 16 : 18;
const TARGET = SEL ? 2400 : 2800;
const PRIOR_STRENGTH = 12, MIN_MIN = 60;
const GAME_FIELDS = ["minutes_played", "shots_on_target", "total_shots", "total_tackle", "won_tackle", "fouls"] as const;
const TEAM_STAT_FIELD: Record<string, string> = { total_tackle: "total_tackles", shots_on_target: "shots_on_target", total_shots: "total_shots" };

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Game = Record<string, number>;
type Sample = { games: Game[]; isHome: boolean; oppTeamId: string; actual: Record<string, number> };
const samples: Sample[] = [];
let sumWon = 0, sumTot = 0;

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
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
      const oppTeamId = isHome ? String(ev.away_team_id) : String(ev.home_team_id);
      const actual: Record<string, number> = {};
      for (const f of GAME_FIELDS) actual[f] = Number(r[f] ?? 0);
      return { games, isHome, oppTeamId, actual } as Sample;
    });
    for (const s of built) { if (!s) continue; sumWon += s.actual.won_tackle!; sumTot += s.actual.total_tackle!; samples.push(s); }
    console.error(`[${POP}] liga ${lg} ev ${ev.id} — amostra=${samples.length}`);
    if (samples.length >= TARGET) break outer;
  }
}
const wrLeague = sumTot > 0 ? sumWon / sumTot : 0.62;

// teamConceded (replica a produção), cacheado por (oppTeamId|teamField|byPlayer)
const concCache = new Map<string, number | null>();
async function teamConceded(oppId: string, teamField: string, byPlayer: boolean): Promise<number | null> {
  const key = `${oppId}|${teamField}|${byPlayer}`;
  if (concCache.has(key)) return concCache.get(key)!;
  let val: number | null = null;
  try {
    const evs = await client.events({ team_id: oppId, status: "finished", limit: 10 });
    const results: any[] = evs?.results ?? [];
    if (byPlayer) {
      let total = 0, games = 0;
      for (const ev of results.slice(0, 10)) {
        let rows: any[]; try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
        const against = rows.filter((r) => r.player_id != null && String(r.team_id) !== oppId);
        if (against.length === 0) continue; games++;
        for (const r of against) total += Number(r[teamField] ?? 0);
      }
      val = games === 0 ? null : total / games;
    } else {
      const vals: number[] = [];
      for (const ev of results.slice(0, 10)) {
        const side = String(ev.home_team_id) === oppId ? "away" : "home";
        try { const st = (await client.eventStats(ev.id))?.stats ?? {}; const v = st[side]?.[teamField]; if (v != null) vals.push(Number(v)); } catch { /* skip */ }
      }
      val = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
  } catch { val = null; }
  concCache.set(key, val);
  return val;
}

const cs = cacheStats();
console.log(`\n############ MATCHUP AXIS · POP=${POP} ############`);
console.log(`amostra=${samples.length} · wr-liga=${wrLeague.toFixed(3)} · cache ${cs.hits}h/${cs.misses}m\n`);

type M = { n: number; base: number; brier: number; ece: number; bss: number };
function metrics(p: number[], a: number[]): M {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss: base > 0 && base < 1 ? brierSkillScore(p, a) : NaN };
}
function fmt(m: M | null): string {
  if (!m) return "banda rala (n<30)";
  return `n=${String(m.n).padStart(4)} base=${m.base.toFixed(3)} Brier=${m.brier.toFixed(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${Number.isNaN(m.bss) ? "  n/a  " : (m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}`;
}
function evalLine(items: { mu: number; actual: number }[], L: number, R: number) {
  const pB: number[] = [], aB: number[] = [], pF: number[] = [], aF: number[] = [];
  for (const x of items) {
    const prob = probOverLine(x.mu, L, R); const a = x.actual > L ? 1 : 0;
    pF.push(prob); aF.push(a);
    if (prob >= 0.35 && prob <= 0.65) { pB.push(prob); aB.push(a); }
  }
  return { full: metrics(pF, aF), band: pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null };
}

const MK = [
  { name: "sot", field: "shots_on_target", settle: "shots_on_target", prior: 0.4, R: 2.0, L: 1.5, concedeField: "shots_on_target", leagueAvg: SEL ? 4.28 : 4.55, decomp: false },
  { name: "finalizacoes", field: "total_shots", settle: "total_shots", prior: 1.2, R: 3.0, L: 2.5, concedeField: "total_shots", leagueAvg: SEL ? 12.22 : 13.46, decomp: false },
  { name: "faltas", field: "fouls", settle: "fouls", prior: 1.0, R: 2.5, L: 1.5, concedeField: "was_fouled", leagueAvg: 10.72, decomp: false },
  { name: "desarmes", field: "total_tackle", settle: "won_tackle", prior: 1.3, R: 2.0, L: 1.5, concedeField: "total_tackle", leagueAvg: SEL ? 13.97 : 14.64, decomp: true },
];

for (const mk of MK) {
  const teamField = TEAM_STAT_FIELD[mk.concedeField] ?? mk.concedeField;
  const byPlayer = !(mk.concedeField in TEAM_STAT_FIELD);
  const without: { mu: number; actual: number }[] = [];
  const withAxis: { mu: number; actual: number }[] = [];
  let nMult = 0, sumMult = 0;
  await mapPool(samples, 8, async (s) => {
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, mk.field, mk.prior, PRIOR_STRENGTH, 1.0, ha, 90);
    if (m?.mu == null) return null;
    let muBase = m.mu;
    if (mk.decomp) { let sw = 0, st = 0; for (const g of s.games) { sw += g.won_tackle!; st += g.total_tackle!; } muBase *= (sw + 40 * wrLeague) / (st + 40); }
    const oc = await teamConceded(s.oppTeamId, teamField, byPlayer);
    const mult = oc == null ? 1.0 : Math.max(0.7, Math.min(1.4, opponentMultiplier(oc, mk.leagueAvg)));
    nMult++; sumMult += mult;
    const actual = s.actual[mk.settle]!;
    without.push({ mu: muBase, actual });
    withAxis.push({ mu: muBase * mult, actual });
    return null;
  });
  console.log(`========== ${mk.name.toUpperCase()} over ${mk.L} (settle=${mk.settle}, mult médio=${(sumMult / Math.max(1, nMult)).toFixed(3)}) ==========`);
  const a = evalLine(without, mk.L, mk.R), b = evalLine(withAxis, mk.L, mk.R);
  console.log(`  SEM matchup:  FULL ${fmt(a.full)}`);
  console.log(`                BANDA ${fmt(a.band)}`);
  console.log(`  COM matchup:  FULL ${fmt(b.full)}`);
  console.log(`                BANDA ${fmt(b.band)}`);
  if (a.band && b.band) {
    const dB = b.band.bss - a.band.bss, dE = b.band.ece - a.band.ece;
    console.log(`  >>> BANDA Δ: BrierSkill ${(dB >= 0 ? "+" : "") + dB.toFixed(4)} · ECE ${(dE >= 0 ? "+" : "") + dE.toFixed(4)} → ${dB > 0 && dE < 0 ? "matchup AJUDA" : "sem ganho"}`);
  }
}
console.log(`\n############ FIM MATCHUP ${POP} (amostra=${samples.length}, cache ${cacheStats().hits}h/${cacheStats().misses}m) ############`);
