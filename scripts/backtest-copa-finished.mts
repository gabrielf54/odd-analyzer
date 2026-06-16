// BACKTEST de CALIBRAÇÃO nos jogos da COPA 2026 (liga 27) que JÁ FINALIZARAM.
// Roda o MESMO motor de produção (runMatch + ratings de força via BSDStatsProvider) em
// cada jogo finalizado e compara a prob prevista com o RESULTADO real (placar).
// Mede gols (over 1.5/2.5/3.5) e vitória (mandante). NÃO mede CLV (forward-only).
//
// Honestidade (anti-lookahead): o pool de ratings é cross-competição (ligas 31,58-67) e
// NÃO inclui a liga 27 (Copa) — o resultado do jogo previsto não realimenta o rating dele.
// (Resíduo possível: o pool reflete a forma "de hoje"; em junho as outras competições
// estão quase paradas, então a deriva é mínima.)
// Uso: npx tsx scripts/backtest-copa-finished.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { BSDStatsProvider } from "../src/providers/stats.js";
import { runMatch } from "../src/pipeline.js";
import { normalizeEvent } from "../src/runner.js";
import { MARKETS } from "../src/model/markets.js";
import { brierScore, expectedCalibrationError, brierSkillScore } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const COPA = 27;
const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });
const sp = new BSDStatsProvider(client);

const linesGols = () => [1.5, 2.5, 3.5].map((linha) => ({ entidade: "partida", linha, odd_over: 2, odd_under: 2, book: "bt" }));
const lineVitoria = () => [{ entidade: "partida", linha: 0.5, odd_over: 2, odd_under: 2, book: "bt" }];

const ev = await client.events({ league_id: COPA, status: "finished", limit: 200 });
const allRows: any[] = ev?.results ?? [];
const dateOf = (e: any) => String(e?.event_date ?? e?.date ?? e?.start_time ?? "");
// SÓ a edição ATUAL (2026): a liga 27 mistura Copas passadas (2018/2022); prever um jogo
// de 2022 com a forma de 2026 é lookahead/sem sentido. Filtra por data >= 2026-06-01.
const CUTOFF = Date.parse("2026-06-01T00:00:00Z");
const rows = allRows.filter((e) => { const t = Date.parse(dateOf(e)); return Number.isFinite(t) && t >= CUTOFF; });
const dates = rows.map(dateOf).filter(Boolean).sort();
console.error(`liga 27 status=finished: ${allRows.length} no total → ${rows.length} na edição 2026 (${dates[0]?.slice(0, 10)} … ${dates[dates.length - 1]?.slice(0, 10)})`);

type Rec = { p: number; a: number };
const gols: Record<string, Rec[]> = { "1.5": [], "2.5": [], "3.5": [] };
const vit: Rec[] = [];
let used = 0, skipped = 0;

for (const row of rows) {
  let raw: any; try { raw = await client.getEvent(row.id); } catch { skipped++; continue; }
  const hs = Number(raw?.home_score), as = Number(raw?.away_score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) { skipped++; continue; }
  const event = normalizeEvent(raw);
  let cg: any[] = []; try { cg = await runMatch(event, MARKETS.gols!, sp, { lines: linesGols }); } catch { /* */ }
  if (!cg.length) { skipped++; continue; } // ratings inelegível (placeholder / sem histórico) → fora
  for (const c of cg) gols[String(c.linha)]?.push({ p: c.prob_modelo, a: hs + as > c.linha ? 1 : 0 });
  let cv: any[] = []; try { cv = await runMatch(event, MARKETS.vitoria!, sp, { lines: lineVitoria }); } catch { /* */ }
  for (const c of cv) vit.push({ p: c.prob_modelo, a: hs > as ? 1 : 0 });
  used++;
}

function report(tag: string, recs: Rec[]) {
  if (recs.length < 5) { console.log(`  ${tag.padEnd(20)} n=${recs.length} (rala)`); return; }
  const p = recs.map((r) => r.p), a = recs.map((r) => r.a);
  const base = a.reduce((x, y) => x + y, 0) / a.length;
  const bss = base > 0 && base < 1 ? brierSkillScore(p, a) : NaN;
  const acertos = recs.filter((r) => (r.p >= 0.5 ? 1 : 0) === r.a).length;
  console.log(`  ${tag.padEnd(20)} n=${String(recs.length).padStart(3)} base=${base.toFixed(3)} Brier=${brierScore(p, a).toFixed(4)} ECE=${expectedCalibrationError(p, a).toFixed(4)} BrierSkill=${Number.isNaN(bss) ? " n/a " : (bss >= 0 ? "+" : "") + bss.toFixed(4)}  acerto-direção=${(100 * acertos / recs.length).toFixed(0)}%`);
}

console.log(`\n===== BACKTEST COPA 2026 (finalizados) — jogos usados=${used}, pulados=${skipped} =====`);
console.log(`motor de produção (runMatch+ratings); pool cross-competição NÃO inclui a Copa.\n`);
console.log("-- GOLS (over) --");
for (const L of ["1.5", "2.5", "3.5"]) report(`gols over ${L}`, gols[L]!);
console.log("\n-- VITÓRIA (mandante vence) --");
report("vitoria mandante", vit);
console.error(`\ncache ${cacheStats().hits}h/${cacheStats().misses}m`);
