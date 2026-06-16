// MODELO × MERCADO × REALIDADE nos jogos NEUTROS já finalizados da Copa 2026.
// Pergunta: ao vivo, o modelo deu favorito mais baixo que o mercado (Portugal 50% vs ~75%).
// Como a Copa é campo NEUTRO (sem o artefato de venue das eliminatórias), isto testa direto:
// o "favorito conservador" do modelo é DEFEITO (modelo erra) ou VIRTUDE (mercado superprecifica
// favorito)? Compara, por jogo: prob mandante do MODELO (runMatch) × de-vig do MERCADO (BSD,
// devigThreeWay) × resultado REAL. n pequeno (Copa nova) → leitura com cautela.
// Uso: npx tsx scripts/copa-model-vs-market.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { BSDStatsProvider } from "../src/providers/stats.js";
import { runMatch } from "../src/pipeline.js";
import { normalizeEvent } from "../src/runner.js";
import { MARKETS } from "../src/model/markets.js";
import { parseBsdMatchOdds } from "../src/odds/bsdMatchOdds.js";
import { devigThreeWay } from "../src/value/devig.js";
import { brierScore, expectedCalibrationError } from "../src/backtest/calibration.js";
import { diskCachedGet, cacheStats } from "./lib/diskCache.mts";

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });
const sp = new BSDStatsProvider(client);
const lineVitoria = () => [{ entidade: "partida", linha: 0.5, odd_over: 2, odd_under: 2, book: "bt" }];
const dateOf = (e: any) => String(e?.event_date ?? e?.date ?? e?.start_time ?? "");

const ev = await client.events({ league_id: 27, status: "finished", limit: 200 });
const CUT = Date.parse("2026-06-01T00:00:00Z");
const rows: any[] = (ev?.results ?? []).filter((e: any) => { const t = Date.parse(dateOf(e)); return Number.isFinite(t) && t >= CUT; });

type Row = { jogo: string; mHome: number; kHome: number; aHome: number };
const data: Row[] = [];
for (const row of rows) {
  let raw: any; try { raw = await client.getEvent(row.id); } catch { continue; }
  const hs = Number(raw?.home_score), as = Number(raw?.away_score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
  const event = normalizeEvent(raw);
  let cv: any[] = []; try { cv = await runMatch(event, MARKETS.vitoria!, sp, { lines: lineVitoria }); } catch { /* */ }
  if (!cv.length) continue;
  const mHome = cv[0].prob_modelo;
  const p = parseBsdMatchOdds(await client.eventOdds(row.id).catch(() => null));
  if (p.home_win == null || p.draw == null || p.away_win == null) continue;
  const [kHome] = devigThreeWay(p.home_win, p.draw, p.away_win);
  data.push({ jogo: event.jogo, mHome, kHome, aHome: hs > as ? 1 : 0 });
}

console.log(`\n===== MODELO × MERCADO × REAL — vitória mandante, Copa 2026 NEUTRA (n=${data.length}) =====\n`);
console.log(`jogo                                  modelo  mercado  real`);
for (const d of data) {
  console.log(`  ${d.jogo.padEnd(36).slice(0, 36)} ${(100 * d.mHome).toFixed(0).padStart(4)}%   ${(100 * d.kHome).toFixed(0).padStart(4)}%   ${d.aHome ? "SIM" : "não"}`);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const m = data.map((d) => d.mHome), k = data.map((d) => d.kHome), a = data.map((d) => d.aHome);
console.log(`\n-- AGREGADO (n=${data.length}) --`);
console.log(`  prob mandante média:   modelo ${(100 * mean(m)).toFixed(1)}%  ·  mercado ${(100 * mean(k)).toFixed(1)}%  ·  real ${(100 * mean(a)).toFixed(1)}%`);
console.log(`  Brier (menor=melhor):  modelo ${brierScore(m, a).toFixed(4)}  ·  mercado ${brierScore(k, a).toFixed(4)}`);
console.log(`  ECE   (menor=melhor):  modelo ${expectedCalibrationError(m, a).toFixed(4)}  ·  mercado ${expectedCalibrationError(k, a).toFixed(4)}`);

// foco no FAVORITO do mercado: quando o mercado vê um favorito claro do mandante (k>0.55),
// o modelo concorda ou foge? e quem acertou?
const fav = data.filter((d) => d.kHome >= 0.55);
if (fav.length) {
  console.log(`\n-- só jogos onde o MERCADO vê mandante favorito (de-vig ≥55%), n=${fav.length} --`);
  console.log(`  prob média:  modelo ${(100 * mean(fav.map((d) => d.mHome))).toFixed(1)}%  ·  mercado ${(100 * mean(fav.map((d) => d.kHome))).toFixed(1)}%  ·  real ${(100 * mean(fav.map((d) => d.aHome))).toFixed(1)}%`);
  console.log(`  Brier:       modelo ${brierScore(fav.map((d) => d.mHome), fav.map((d) => d.aHome)).toFixed(4)}  ·  mercado ${brierScore(fav.map((d) => d.kHome), fav.map((d) => d.aHome)).toFixed(4)}`);
}
console.error(`\ncache ${cacheStats().hits}h/${cacheStats().misses}m`);
