// Mini-backtest do tilt posicional: Brier/ECE com vs sem tilt, em jogador-jogos
// de seleção. Anti-espiada: prediz o jogo N usando só jogos anteriores a N.
// Uso: npx tsx scripts/backtest-tilt.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { opponentMultiplier, homeAwayMultiplier, positionalTilt } from "../src/model/adjustments.js";
import { MARKETS } from "../src/model/markets.js";
import { POSITIONAL_SHARE_NACIONAL, POSITIONAL_MIN_GAMES } from "../src/model/params.js";
import { brierScore, expectedCalibrationError } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62];
const EVENTS_PER_LEAGUE = 10;
const TARGET = 200; // mínimo de jogador-jogos por mercado
const LINE = 1.5;
const FIELDS = ["total_tackle", "shots_on_target", "total_shots"] as const;
const MK: Record<string, string> = { total_tackle: "desarmes", shots_on_target: "sot", total_shots: "finalizacoes" };

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const posCache = new Map<string, string>();
async function positionOf(pid: unknown): Promise<string> {
  const k = String(pid);
  if (posCache.has(k)) return posCache.get(k)!;
  let p = "?";
  try { p = String((await client.player(pid))?.position ?? "?"); } catch { /* neutro */ }
  posCache.set(k, p);
  return p;
}

/** Concessão por posição do adversário usando SÓ jogos antes de `beforeDate`. */
async function concededByPosBefore(oppId: string, statField: string, beforeDate: string) {
  let evs: any;
  try { evs = await client.events({ team_id: oppId, status: "finished", limit: 30 }); } catch { return null; }
  const past = (evs?.results ?? []).filter((e: any) => String(e.event_date ?? "") < beforeDate).slice(0, 10);
  const byPos: Record<string, number> = { D: 0, M: 0, F: 0 };
  let total = 0, games = 0, totalAll = 0;
  for (const ev of past) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const against = rows.filter((r) => r.player_id != null && String(r.team_id) !== oppId);
    if (!against.length) continue;
    games++;
    for (const r of against) {
      const v = Number(r[statField] ?? 0);
      totalAll += v;
      if (!(v > 0)) continue;
      const pos = await positionOf(r.player_id);
      if (pos in byPos) { byPos[pos] = byPos[pos]! + v; total += v; }
    }
  }
  if (games < POSITIONAL_MIN_GAMES || total <= 0) return null;
  return { byPos, total, games, concededPerGame: totalAll / games };
}

const preds: Record<string, { base: number[]; tilt: number[]; actual: number[] }> = {};
for (const f of FIELDS) preds[f] = { base: [], tilt: [], actual: [] };

outer:
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const evDate = String(ev.event_date ?? "");
    for (const r of rows) {
      if (r.player_id == null || !(Number(r.minutes_played ?? 0) >= 60)) continue;
      const isHome = String(r.team_id) === String(ev.home_team_id);
      const oppId = String(isHome ? ev.away_team_id : ev.home_team_id);
      let hist: any;
      try { hist = await client.playerStats(r.player_id); } catch { continue; }
      const games = [...(hist?.results ?? [])].reverse()
        .filter((g: any) => String(g.event_id) !== String(ev.id));
      if (games.length < 10) continue;
      const pos = await positionOf(r.player_id);
      const ha = homeAwayMultiplier(isHome, 1.08, 0.92);
      for (const f of FIELDS) {
        const mkt = MARKETS[MK[f]!]!;
        const byPos = await concededByPosBefore(oppId, f, evDate);
        const leagueAvg = mkt.concede_baseline_nacional || mkt.concede_baseline;
        const oppMult = byPos
          ? Math.max(0.7, Math.min(1.4, opponentMultiplier(byPos.concededPerGame, leagueAvg)))
          : 1.0;
        const calc = playerMuFromGames(games, f, mkt.prior_rate, mkt.prior_strength, oppMult, ha, 90);
        if (!calc) continue;
        const shareBase = POSITIONAL_SHARE_NACIONAL[f]?.[pos] ?? null;
        const tilt = byPos && shareBase
          ? positionalTilt((byPos.byPos[pos] ?? 0) / byPos.total, shareBase) : 1.0;
        const muTilt = Math.max(0.7, Math.min(1.4, oppMult * tilt)) / oppMult * calc.mu;
        const actual = Number(r[f] ?? 0) > LINE ? 1 : 0;
        preds[f]!.base.push(probOverLine(calc.mu, LINE, mkt.nb_dispersion));
        preds[f]!.tilt.push(probOverLine(muTilt, LINE, mkt.nb_dispersion));
        preds[f]!.actual.push(actual);
      }
    }
    const n = preds["total_tackle"]!.actual.length;
    console.error(`liga ${lg} evento ${ev.id} — n=${n}`);
    if (n >= TARGET) break outer;
  }
}

for (const f of FIELDS) {
  const p = preds[f]!;
  if (p.actual.length === 0) { console.log(`${f}: sem dados`); continue; }
  const bb = brierScore(p.base, p.actual), bt = brierScore(p.tilt, p.actual);
  const eb = expectedCalibrationError(p.base, p.actual), et = expectedCalibrationError(p.tilt, p.actual);
  console.log(`${f} (n=${p.actual.length}, over ${LINE}):`);
  console.log(`  Brier  sem tilt ${bb.toFixed(4)} | com tilt ${bt.toFixed(4)} | delta ${(((bt - bb) / bb) * 100).toFixed(1)}%`);
  console.log(`  ECE    sem tilt ${eb.toFixed(4)} | com tilt ${et.toFixed(4)} | delta ${(((et - eb) / eb) * 100).toFixed(1)}%`);
}
