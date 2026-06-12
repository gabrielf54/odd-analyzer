// Calibra prior + nb_dispersion POR POSIÇÃO (D/M/F) na população POP, p/ testar a
// HIPÓTESE: o pooling de posições num único prior/R infla a cauda (over 1.5/2.5) na
// BANDA DE APOSTA (prob∈[0.35,0.65]) — matando linhas que poderiam graduar
// (desarme 1.5, sot 1.5, finalizações 2.5, faltas 1.5).
//
// Espelha audit-player-markets.mts (leave-one-out anti-espiada, settleField, banda
// de aposta, oppMult neutro=1.0 → testa a FORMA base) e ADICIONA a posição do
// jogador (client.player().position). Compara 3 modelos por (mercado, linha):
//   SHIPPED     = prior+R atuais do código (global)         — o que roda hoje
//   GLOBAL-BEST = prior global + melhor R varrido            — teto SEM posição
//   COND        = prior por posição + melhor R por posição   — teto COM posição
// O prior por posição = mediana do per90 histórico daquela posição na população.
// O R por posição = o que maximiza o BrierSkill FULL da posição na linha (full, não
// banda, p/ reduzir overfit — a banda é pequena). Também imprime o breakdown por
// posição (o MECANISMO: se D quer R alto e F quer R baixo, o R global mente p/ os dois).
//
// VEREDITO: COND só "vence" (vira candidato a graduar) se na BANDA o BrierSkill subir
// E o ECE cair vs GLOBAL-BEST. Senão a linha é estrutural → Cemitério (CORE §5).
// Uso: npx tsx scripts/recalibrate-position-conditioned.mts <selecao|clube>
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
const R_SWEEP = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
const POSITIONS = ["D", "M", "F"] as const;

const GAME_FIELDS = ["minutes_played", "shots_on_target", "total_shots", "total_tackle", "won_tackle", "fouls"] as const;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Game = Record<string, number>;
type Sample = { games: Game[]; isHome: boolean; actualMin: number; actual: Record<string, number>; pos: string };
const samples: Sample[] = [];
let sumWonAll = 0, sumTotAll = 0;

const posCache = new Map<string, string>();
async function positionOf(pid: unknown): Promise<string> {
  const k = String(pid);
  const hit = posCache.get(k);
  if (hit) return hit;
  let pos = "?";
  try { pos = String((await client.player(pid))?.position ?? "?"); } catch { /* neutro */ }
  posCache.set(k, pos);
  return pos;
}

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
      const pos = await positionOf(r.player_id);
      return { games, isHome, actualMin: Number(r.minutes_played), actual, pos } as Sample;
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
const byPos = (p: string) => samples.filter((s) => s.pos === p).length;
console.log(`\n############ PRIOR+R POR POSIÇÃO · POP=${POP} ############`);
console.log(`amostra=${samples.length} (D=${byPos("D")} M=${byPos("M")} F=${byPos("F")} G/?=${samples.length - byPos("D") - byPos("M") - byPos("F")}) · wr-liga=${wrLeague.toFixed(3)} · cache ${cs.hits}h/${cs.misses}m\n`);

// ---------- métricas (idênticas à auditoria) ----------
type M = { n: number; base: number; brier: number; ece: number; bss: number };
function metrics(p: number[], a: number[]): M {
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  const bss = base > 0 && base < 1 ? brierSkillScore(p, a) : NaN;
  return { n: p.length, base, brier: brierScore(p, a), ece: expectedCalibrationError(p, a), bss };
}
function fmt(m: M | null): string {
  if (!m) return "banda rala (n<30)";
  return `n=${String(m.n).padStart(4)} base=${m.base.toFixed(3)} Brier=${m.brier.toFixed(4)} ECE=${m.ece.toFixed(4)} BrierSkill=${Number.isNaN(m.bss) ? "  n/a  " : (m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}`;
}

// per90 histórico de um campo p/ uma amostra (média ponderada por minutos)
function hist90(s: Sample, field: string): number {
  let st = 0, sm = 0;
  for (const g of s.games) { st += g[field] ?? 0; sm += g.minutes_played ?? 0; }
  return sm > 0 ? (st / sm) * 90 : 0;
}
function medianOf(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
}
// prior por posição = mediana do per90 histórico daquela posição
function priorByPosition(field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of POSITIONS) out[p] = medianOf(samples.filter((s) => s.pos === p).map((s) => hist90(s, field)));
  return out;
}

// winRate encolhido (desarme) — k=40, igual à auditoria
function winRateOf(s: Sample): number {
  let sw = 0, st = 0;
  for (const g of s.games) { sw += g.won_tackle!; st += g.total_tackle!; }
  return (sw + 40 * wrLeague) / (st + 40);
}

type Item = { mu: number; actual: number; pos: string };
// constrói μ por amostra; prior pode ser número (global) ou mapa por posição.
function buildItems(field: string, settle: string, prior: number | Record<string, number>, decomp: boolean): Item[] {
  const out: Item[] = [];
  for (const s of samples) {
    const pr = typeof prior === "number" ? prior : (prior[s.pos] ?? null);
    if (pr == null) continue; // posição sem prior (G/?) — fora do modelo condicionado
    const ha = homeAwayMultiplier(s.isHome, 1.08, 0.92);
    const m = playerMuFromGames(s.games, field, pr, PRIOR_STRENGTH, 1.0, ha, 90);
    if (m?.mu == null) continue;
    const mu = decomp ? m.mu * winRateOf(s) : m.mu;
    out.push({ mu, actual: s.actual[settle]!, pos: s.pos });
  }
  return out;
}

function evalScalar(items: Item[], L: number, R: number): { full: M; band: M | null } {
  const pF: number[] = [], aF: number[] = [], pB: number[] = [], aB: number[] = [];
  for (const x of items) {
    const prob = probOverLine(x.mu, L, R);
    const a = x.actual > L ? 1 : 0;
    pF.push(prob); aF.push(a);
    if (prob >= 0.35 && prob <= 0.65) { pB.push(prob); aB.push(a); }
  }
  const band = pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null;
  return { full: metrics(pF, aF), band };
}
// COND: cada amostra usa o R da SUA posição
function evalByPos(items: Item[], L: number, RByPos: Record<string, number>): { full: M; band: M | null } {
  const pF: number[] = [], aF: number[] = [], pB: number[] = [], aB: number[] = [];
  for (const x of items) {
    const R = RByPos[x.pos] ?? 2.5;
    const prob = probOverLine(x.mu, L, R);
    const a = x.actual > L ? 1 : 0;
    pF.push(prob); aF.push(a);
    if (prob >= 0.35 && prob <= 0.65) { pB.push(prob); aB.push(a); }
  }
  const band = pB.length >= 30 && aB.some((v) => v === 1) && aB.some((v) => v === 0) ? metrics(pB, aB) : null;
  return { full: metrics(pF, aF), band };
}
// melhor R global por banda (cai p/ full se banda rala), e melhor R por posição por full
function bestGlobalR(items: Item[], L: number): { R: number; res: { full: M; band: M | null } } {
  let best: { R: number; res: { full: M; band: M | null }; key: number } | null = null;
  for (const R of R_SWEEP) {
    const res = evalScalar(items, L, R);
    const key = res.band ? res.band.bss : res.full.bss - 1; // banda manda; sem banda, penaliza
    if (!best || key > best.key) best = { R, res, key };
  }
  return { R: best!.R, res: best!.res };
}
function bestRByPos(items: Item[], L: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of POSITIONS) {
    const sub = items.filter((x) => x.pos === p);
    if (sub.length < 30) { out[p] = 2.5; continue; }
    let best: { R: number; bss: number } | null = null;
    for (const R of R_SWEEP) {
      const res = evalScalar(sub, L, R);
      const bss = res.full.bss; // full por posição (banda por-posição é rala demais)
      if (!best || bss > best.bss) best = { R, bss };
    }
    out[p] = best!.R;
  }
  return out;
}

const MK = [
  { name: "sot", field: "shots_on_target", settle: "shots_on_target", prior: 0.4, R: 2.0, lines: [0.5, 1.5], decomp: false },
  { name: "finalizacoes", field: "total_shots", settle: "total_shots", prior: 1.2, R: 3.0, lines: [0.5, 1.5, 2.5], decomp: false },
  { name: "faltas", field: "fouls", settle: "fouls", prior: 1.0, R: 2.5, lines: [0.5, 1.5], decomp: false },
  { name: "desarmes", field: "total_tackle", settle: "won_tackle", prior: 1.3, R: 2.0, lines: [0.5, 1.5], decomp: true },
];

for (const mk of MK) {
  console.log(`\n========== ${mk.name.toUpperCase()} (campo=${mk.field}, settle=${mk.settle}${mk.decomp ? ", DECOMP won/total" : ""}) ==========`);
  const priorPos = priorByPosition(mk.field);
  console.log(`  prior global=${mk.prior} · prior por posição (mediana per90): D=${priorPos.D!.toFixed(2)} M=${priorPos.M!.toFixed(2)} F=${priorPos.F!.toFixed(2)}`);

  const itemsGlobal = buildItems(mk.field, mk.settle, mk.prior, mk.decomp);
  const itemsCond = buildItems(mk.field, mk.settle, priorPos, mk.decomp);

  for (const L of mk.lines) {
    const dead = (mk.name === "sot" && L === 1.5) || (mk.name === "finalizacoes" && L === 2.5) ||
      (mk.name === "faltas" && L === 1.5) || (mk.name === "desarmes" && L === 1.5);
    console.log(`\n  --- over ${L}${dead ? "  [LINHA MORTA — alvo]" : "  [linha viva — controle]"} ---`);

    // 1) SHIPPED (prior+R do código)
    const shipped = evalScalar(itemsGlobal, L, mk.R);
    console.log(`    SHIPPED     (prior ${mk.prior}, R=${mk.R}):  FULL ${fmt(shipped.full)}`);
    console.log(`                                          BANDA ${fmt(shipped.band)}`);

    // 2) GLOBAL-BEST (prior global, melhor R varrido)
    const gb = bestGlobalR(itemsGlobal, L);
    console.log(`    GLOBAL-BEST (prior ${mk.prior}, R=${gb.R}*):  FULL ${fmt(gb.res.full)}`);
    console.log(`                                          BANDA ${fmt(gb.res.band)}`);

    // 3) breakdown por posição (mecanismo): melhor R de cada posição + banda dela
    const rbp = bestRByPos(itemsCond, L);
    for (const p of POSITIONS) {
      const sub = itemsCond.filter((x) => x.pos === p);
      const res = sub.length ? evalScalar(sub, L, rbp[p]!) : null;
      console.log(`      pos ${p} (R=${rbp[p]}*, prior ${priorPos[p]!.toFixed(2)}):  BANDA ${res ? fmt(res.band) : "sem amostra"}`);
    }

    // 4) COND (prior por posição + R por posição), pooled
    const cond = evalByPos(itemsCond, L, rbp);
    console.log(`    COND        (prior+R por posição):    FULL ${fmt(cond.full)}`);
    console.log(`                                          BANDA ${fmt(cond.band)}`);

    // veredito banda: COND vence GLOBAL-BEST?
    if (cond.band && gb.res.band) {
      const dBss = cond.band.bss - gb.res.band.bss;
      const dEce = cond.band.ece - gb.res.band.ece;
      const win = dBss > 0 && dEce < 0;
      console.log(`    >>> BANDA COND vs GLOBAL-BEST: ΔBrierSkill=${(dBss >= 0 ? "+" : "") + dBss.toFixed(4)} ΔECE=${(dEce >= 0 ? "+" : "") + dEce.toFixed(4)} → ${win ? "COND VENCE (candidato a graduar)" : "sem ganho (estrutural)"}`);
    } else {
      console.log(`    >>> BANDA: rala demais p/ veredito (a linha quase não cai no ponto de aposta)`);
    }
  }
}

console.log(`\n############ FIM ${POP} (amostra=${samples.length}, cache ${cacheStats().hits}h/${cacheStats().misses}m) ############`);
