// REGISTRO-SOMBRA (forward, DIAGNÓSTICO) — valida AO VIVO se combinar a forma do
// jogador com o MISMATCH de força (favorito×zebra) deixa a previsão de FINALIZAÇÃO
// mais inteligente, na Copa. NÃO toca produção: não grava no paper_ledger, não muda
// nenhum prob_modelo, não entra no money-path. Recomputa tudo do BSD a cada run
// (causal — ratings pré-jogo pelo pool de SELEÇÃO, igual à produção; settle pelo
// total_shots real), então é idempotente e ACUMULA sozinho conforme a Copa anda —
// rode quando quiser, igual ao report.ts.
//
// Por que existe: a calibração OFFLINE provou que o combinado (posse+mando) afia a
// finalização no CLUBE (over 1.5: BrierSkill +0.012→+0.025), mas na SELEÇÃO o dado
// é raso demais p/ provar offline (posse quase ausente, seleção joga pouco). O peso
// de favoritismo aprendido na seleção foi ~1.08×/gol de supremacia — este script
// aplica esse fator como SOMBRA e mede, jogo a jogo da Copa, se ele melhora o Brier/
// ECE da finalização vs a forma pura. No fim do torneio: veredito forward.
//
// Uso: npx tsx src/cli/forwardShadowFinalizacao.ts [leagueId...]   (default: 27 = Copa)
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { getRequired } from "../config.js";
import { BSDStatsProvider } from "../providers/stats.js";
import { MARKETS, ratingsPoolLeagues, populacaoFor } from "../model/markets.js";
import { computeRatings, lambdaFromRatings, ratingsEligible, homeAdvFor } from "../model/ratings.js";
import { playerMuFromGames } from "../model/assemble.js";
import { probOverLine } from "../model/sotModel.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../backtest/calibration.js";

const EVAL_LEAGUES = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const LEAGUES = EVAL_LEAGUES.length ? EVAL_LEAGUES : [27];
const MIN_MIN = 60, MIN_HIST = 8;
const FIN = MARKETS.finalizacoes!;                // total_shots, prior 1.2, R=3.0
const R = FIN.nb_dispersion, PRIOR = FIN.prior_rate;
const MU0 = 1.3;                                   // baseline de gols (mesmo da produção)
// Peso aprendido offline (recalibrate-combined-context.mts seleção): favoritismo
// (+1 gol de supremacia) ≈ 1.08× nas finalizações. exp(β·supremacia), clamp apertado.
const MISMATCH_BETA = Math.log(1.08);
const FACTOR_MIN = 0.85, FACTOR_MAX = 1.20;
const GAME_FIELDS = ["minutes_played", "total_shots"];

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const sp = new BSDStatsProvider(client);

// 1) ratings de força do pool de SELEÇÃO (espelha runMatch: exclui a Copa do pool).
const pop = populacaoFor(LEAGUES[0]);
const homeAdv = homeAdvFor(pop);
const poolLeagues = ratingsPoolLeagues(LEAGUES[0]);
const pools = await Promise.all(poolLeagues.map((lg) => sp.leaguePool(lg)));
const ratings = computeRatings(pools.flat(), { mu0: MU0, homeAdv });
console.log(`registro-sombra finalização · pop=${pop} · pool=${poolLeagues.join(",")} (${pools.flat().length} jogos, ${ratings.size} times)`);

function clamp(x: number) { return Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, x)); }

type Row = { pForma: number; pSombra: number; a: number; line: number };
const rows: Row[] = [];
let games = 0, skipNoRating = 0;

for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: 200 }); } catch { continue; }
  for (const ev of (evs?.results ?? [])) {
    const homeId = String(ev.home_team_id ?? ""), awayId = String(ev.away_team_id ?? "");
    if (!homeId || !awayId) continue;
    if (!ratingsEligible(ratings, homeId, awayId)) { skipNoRating++; continue; }
    const lam = lambdaFromRatings(ratings, homeId, awayId, { mu0: MU0, homeAdv });
    if (!lam) { skipNoRating++; continue; }
    let pstats: any[];
    try { pstats = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const elig = pstats.filter((r) => r.player_id != null && Number(r.minutes_played ?? 0) >= MIN_MIN);
    if (!elig.length) continue;
    games++;
    for (const r of elig) {
      const isHome = String(r.team_id) === homeId;
      const sup = isHome ? lam.lambdaHome - lam.lambdaAway : lam.lambdaAway - lam.lambdaHome;
      let hist: any;
      try { hist = await client.playerStats(r.player_id); } catch { continue; }
      const hgames = [...(hist?.results ?? [])].reverse()
        .filter((g: any) => String(g.event_id) !== String(ev.id))
        .map((g: any) => { const o: Record<string, number> = {}; for (const f of GAME_FIELDS) o[f] = Number(g[f] ?? 0); return o; });
      if (hgames.length < MIN_HIST) continue;
      const c = playerMuFromGames(hgames, FIN.stat_field, PRIOR, FIN.prior_strength, 1.0, 1.0, 90);
      if (c?.mu == null || c.mu <= 0) continue;
      const muForma = c.mu, muSombra = muForma * clamp(Math.exp(MISMATCH_BETA * sup));
      const actual = Number(r.total_shots ?? 0);
      for (const line of FIN.lines) {
        rows.push({ pForma: probOverLine(muForma, line, R), pSombra: probOverLine(muSombra, line, R), a: actual > line ? 1 : 0, line });
      }
    }
  }
}

console.log(`jogos avaliados=${games} · pulados s/ rating=${skipNoRating} · previsões=${rows.length}\n`);
if (rows.length < 30) {
  console.log("amostra ainda rala (a Copa mal começou) — o registro-sombra ACUMULA. Rode de novo conforme os jogos saem.");
  console.log("Sem veredito até ~n≥30 por linha na banda de aposta (igual ao critério do runbook).");
  process.exit(0);
}

function band(get: (r: Row) => number, sel: Row[]) {
  const p: number[] = [], a: number[] = [];
  for (const r of sel) { const x = get(r); if (x >= 0.35 && x <= 0.65) { p.push(x); a.push(r.a); } }
  if (p.length < 30 || !a.some((v) => v === 1) || !a.some((v) => v === 0)) return null;
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: p.length, ece: expectedCalibrationError(p, a), brier: brierScore(p, a), bss: base > 0 && base < 1 ? brierSkillScore(p, a) : NaN };
}
const fmt = (m: any) => m ? `n=${String(m.n).padStart(3)} ECE=${m.ece.toFixed(3)} BrierSkill=${(m.bss >= 0 ? "+" : "") + m.bss.toFixed(4)}` : "banda rala (n<30)";

console.log("FINALIZAÇÃO — forma pura  vs  forma×mismatch (sombra), na banda de aposta:");
for (const line of FIN.lines) {
  const sel = rows.filter((r) => r.line === line);
  const f = band((r) => r.pForma, sel), s = band((r) => r.pSombra, sel);
  const verdict = f && s ? (s.bss > f.bss + 0.003 && s.ece < f.ece + 0.002 ? "→ SOMBRA AJUDA ✓" : s.bss < f.bss - 0.003 ? "→ sombra PIOR" : "→ empate") : "";
  console.log(`  over ${line}:`);
  console.log(`      forma   ${fmt(f)}`);
  console.log(`      sombra  ${fmt(s)}   ${verdict}`);
}
console.log("\nDIAGNÓSTICO — não toca produção. Se a sombra ganhar consistente (n≥30, BrierSkill↑, ECE↓) ao");
console.log("longo da Copa → vira candidata a fator calibrado na finalização (com re-freeze de paridade).");
