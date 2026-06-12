// SCREEN do MECANISMO (Peça 1 da "análise condicional"): a contagem do jogador
// (desarme/SOT) varia com a POSSE do time naquele jogo? É o teste BARATO de
// "essa esperteza é real ou fantasma?" ANTES de gastar a feature (N5 fase b).
//
// Join barato: por evento, /events/{id}/stats/ dá a posse de cada lado e
// /events/{id}/player-stats/ dá a contagem de cada jogador com team_id → casa
// posse↔jogador num jogo só (~2 chamadas/evento, ~20 obs). Sem puxar histórico
// jogador-a-jogador (caro). Cache em disco → re-runs $0.
//
// Mede de DOIS jeitos:
//   (1) TRANSVERSAL — todas as (jogador,jogo): faixa de posse → taxa por-90 média
//       + correlação de Pearson. Mostra o mecanismo agregado.
//   (2) INTRA-JOGADOR — o MESMO jogador, jogos de posse ALTA vs BAIXA DELE (split
//       na mediana própria). Controla a identidade → é o teste do exemplo do dono
//       ("Jogador X desarma mais quando o time tem X% de posse").
//
// Direção esperada (doutrina N5 — você desarma SEM a bola):
//   desarme (won_tackle/total_tackle): posse↑ → contagem↓  (delta NEGATIVO)
//   chutes  (shots_on_target/total_shots): posse↑ → contagem↑ (delta POSITIVO)
//
// Veredito: há sinal se a correlação transversal tem o sinal esperado E a maioria
// dos jogadores no intra mostra a mesma direção, com magnitude > ruído. Se não,
// fantasma → não construir. Se sim → escalar p/ o teste de calibração preditivo.
// Uso: npx tsx scripts/probe-posse-conditional.mts <selecao|clube>
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const POP = (process.argv[2] ?? "selecao") as "selecao" | "clube";
const LEAGUES = POP === "selecao"
  ? [31, 58, 59, 60, 61, 62, 64, 65, 66, 67]
  : [9, 1, 3, 5, 6, 2, 10, 4, 7, 8];
const EVENTS_PER_LEAGUE = POP === "selecao" ? 40 : 45;
const MIN_MIN = 60;            // só quem jogou o bastante (rate por-90 estável)
const WITHIN_MIN_GAMES = 8;    // intra: jogador precisa de ≥8 jogos com posse
const WITHIN_MIN_SIDE = 3;     // ≥3 jogos de cada lado da mediana dele

// métricas a testar: campo do jogador + direção esperada do efeito da posse
const METRICS = [
  { field: "won_tackle", label: "desarme GANHO (settle)", expect: -1 },
  { field: "total_tackle", label: "desarme tentado", expect: -1 },
  { field: "shots_on_target", label: "SOT (settle)", expect: +1 },
  { field: "total_shots", label: "finalizações", expect: +1 },
] as const;

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type Obs = { pid: string; poss: number; min: number; v: Record<string, number> };
const obs: Obs[] = [];

async function mapPool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

// coleta os (liga,evento) primeiro, depois fan-out
const eventList: { lg: number; ev: any }[] = [];
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) eventList.push({ lg, ev });
}
console.error(`[${POP}] ${eventList.length} eventos a varrer...`);

let done = 0, noPoss = 0;
await mapPool(eventList, 6, async ({ ev }) => {
  let stats: any, rows: any[];
  try { stats = (await client.eventStats(ev.id))?.stats ?? {}; } catch { return; }
  try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { return; }
  const possHome = stats?.home?.ball_possession, possAway = stats?.away?.ball_possession;
  if (possHome == null || possAway == null) { noPoss++; return; }
  for (const r of rows) {
    const min = Number(r.minutes_played ?? 0);
    if (r.player_id == null || min < MIN_MIN) continue;
    const isHome = String(r.team_id) === String(ev.home_team_id);
    const poss = Number(isHome ? possHome : possAway);
    if (!(poss > 0)) continue;
    const v: Record<string, number> = {};
    for (const m of METRICS) v[m.field] = Number(r[m.field] ?? 0);
    obs.push({ pid: String(r.player_id), poss, min, v });
  }
  if (++done % 50 === 0) console.error(`  ...${done}/${eventList.length} eventos, obs=${obs.length}`);
});

const cs = cacheStats();
console.log(`\n############ POSSE × CONTAGEM · POP=${POP} ############`);
console.log(`obs=${obs.length} · eventos c/ posse=${eventList.length - noPoss}/${eventList.length} · jogadores distintos=${new Set(obs.map((o) => o.pid)).size} · cache ${cs.hits}h/${cs.misses}m`);
const possAll = obs.map((o) => o.poss);
console.log(`posse: min=${Math.min(...possAll)} mediana=${median(possAll).toFixed(0)} max=${Math.max(...possAll)}\n`);

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length; if (n < 3) return NaN;
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
const per90 = (o: Obs, f: string) => (o.v[f]! / o.min) * 90;

const BINS = [[0, 42], [42, 47], [47, 52], [52, 57], [57, 63], [63, 100]] as const;

for (const m of METRICS) {
  const dir = m.expect < 0 ? "↓ esperado (posse↑→menos)" : "↑ esperado (posse↑→mais)";
  console.log(`===== ${m.label}  [${dir}] =====`);

  // (1) TRANSVERSAL: faixa de posse → taxa por-90 média
  const poss = obs.map((o) => o.poss), rate = obs.map((o) => per90(o, m.field));
  const r = pearson(poss, rate);
  console.log(`  (1) TRANSVERSAL  Pearson(posse, taxa/90) = ${(r >= 0 ? "+" : "") + r.toFixed(3)}  ${signVerdict(r, m.expect)}`);
  for (const [lo, hi] of BINS) {
    const sub = obs.filter((o) => o.poss >= lo && o.poss < hi);
    if (sub.length < 20) { console.log(`        posse ${lo}-${hi}%: n=${sub.length} (rala)`); continue; }
    const rr = mean(sub.map((o) => per90(o, m.field)));
    console.log(`        posse ${String(lo).padStart(2)}-${hi}%: n=${String(sub.length).padStart(4)}  taxa/90=${rr.toFixed(3)}`);
  }

  // (2) INTRA-JOGADOR: split na mediana de posse DELE; alta vs baixa
  const byPlayer = new Map<string, Obs[]>();
  for (const o of obs) { const a = byPlayer.get(o.pid) ?? []; a.push(o); byPlayer.set(o.pid, a); }
  const deltas: number[] = []; let agree = 0, qualified = 0;
  for (const [, gs] of byPlayer) {
    if (gs.length < WITHIN_MIN_GAMES) continue;
    const med = median(gs.map((g) => g.poss));
    const hi = gs.filter((g) => g.poss > med), lo = gs.filter((g) => g.poss < med);
    if (hi.length < WITHIN_MIN_SIDE || lo.length < WITHIN_MIN_SIDE) continue;
    qualified++;
    const d = mean(hi.map((g) => per90(g, m.field))) - mean(lo.map((g) => per90(g, m.field)));
    deltas.push(d);
    if (Math.sign(d) === Math.sign(m.expect)) agree++;
  }
  if (qualified < 15) {
    console.log(`  (2) INTRA-JOGADOR  só ${qualified} jogadores com ≥${WITHIN_MIN_GAMES} jogos (rala — sem poder)\n`);
    continue;
  }
  const md = mean(deltas), medd = median(deltas), frac = agree / qualified;
  const baseRate = mean(obs.map((o) => per90(o, m.field)));
  console.log(`  (2) INTRA-JOGADOR  n=${qualified} jogadores  delta(alta−baixa)/90: média=${(md >= 0 ? "+" : "") + md.toFixed(3)} mediana=${(medd >= 0 ? "+" : "") + medd.toFixed(3)}`);
  console.log(`        ${(frac * 100).toFixed(0)}% na direção esperada (${agree}/${qualified}; 50%=ruído)  ·  swing≈${(Math.abs(md) / baseRate * 100).toFixed(0)}% da taxa média (${baseRate.toFixed(2)}/90)  ${withinVerdict(md, frac, m.expect)}\n`);
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
console.log(`############ FIM POSSE × CONTAGEM ${POP} (obs=${obs.length}) ############`);
