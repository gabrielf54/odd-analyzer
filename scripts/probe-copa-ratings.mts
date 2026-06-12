// PROVA: com o pool cross-competição, os ratings de força ELEGEM os times da Copa e
// produzem previsão sã? Roda o MESMO caminho da produção (ratingsPoolLeagues →
// computeRatings → λ → Dixon-Coles) nos jogos REAIS da Copa 2026 (liga 27).
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { ratingsPoolLeagues, populacaoFor } from "../src/model/markets.js";
import { computeRatings, lambdaFromRatings, ratingsEligible, homeAdvFor } from "../src/model/ratings.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";
import type { ChronoGame } from "../src/model/ratings.js";
import { diskCachedGet } from "./lib/diskCache.mts";

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

async function leaguePool(lg: number): Promise<ChronoGame[]> {
  const evs = await client.events({ league_id: lg, status: "finished", limit: 150 });
  const out: ChronoGame[] = [];
  for (const e of (evs?.results ?? [])) {
    if (e?.home_score == null || e?.away_score == null) continue;
    out.push({ date: String(e.event_date ?? ""), home: String(e.home_team_id), away: String(e.away_team_id), homeScore: Number(e.home_score), awayScore: Number(e.away_score) });
  }
  return out;
}

// pool de ratings da seleção (liga 27 → cross-competição)
const poolLeagues = ratingsPoolLeagues(27);
console.log(`População de liga 27: ${populacaoFor(27)} · ligas-fonte do pool: ${poolLeagues.join(",")}`);
const pools = await Promise.all(poolLeagues.map(leaguePool));
const pool = pools.flat();
const ratings = computeRatings(pool, { mu0: 1.3, homeAdv: homeAdvFor("selecao") });
console.log(`Pool de ratings: ${pool.length} jogos · ${ratings.size} seleções com rating\n`);

const nameCache = new Map<string, string>();
async function teamName(id: string): Promise<string> {
  if (nameCache.has(id)) return nameCache.get(id)!;
  let n = id;
  try { const ev = await client.events({ team_id: id, status: "finished", limit: 1 }); n = (ev?.results?.[0]?.home_team_id === id ? ev.results[0].home_team : ev?.results?.[0]?.away_team) ?? id; } catch {}
  nameCache.set(id, String(n)); return String(n);
}

// jogos da Copa 2026 JÁ disputados (filtra 2026; ignora 2022)
const fin = await client.events({ league_id: 27, status: "finished", limit: 150 });
const copa2026 = (fin?.results ?? []).filter((e: any) => String(e.event_date ?? "").startsWith("2026") && e.home_score != null);
console.log(`===== Copa 2026 — jogos JÁ disputados (n=${copa2026.length}) =====`);
let hits = 0, used = 0;
for (const e of copa2026) {
  const hid = String(e.home_team_id), aid = String(e.away_team_id);
  const elig = ratingsEligible(ratings, hid, aid);
  const lam = lambdaFromRatings(ratings, hid, aid, { mu0: 1.3, homeAdv: homeAdvFor("selecao") });
  const [hn, an] = await Promise.all([teamName(hid), teamName(aid)]);
  if (!elig || !lam) { console.log(`  ${hn} x ${an}: ratings NÃO elegíveis → cairia no fallback`); continue; }
  const m = scoreMatrix(lam.lambdaHome, lam.lambdaAway);
  const p = probs1x2(m), over25 = probTotalOver(m, 2.5);
  const realTot = Number(e.home_score) + Number(e.away_score);
  const pred = p.home > p.away && p.home > p.draw ? "casa" : p.away > p.draw ? "fora" : "empate";
  const real = Number(e.home_score) > Number(e.away_score) ? "casa" : Number(e.away_score) > Number(e.home_score) ? "fora" : "empate";
  used++; if (pred === real) hits++;
  console.log(`  ${hn} ${e.home_score}x${e.away_score} ${an} | modelo: 1X2 ${(p.home*100).toFixed(0)}/${(p.draw*100).toFixed(0)}/${(p.away*100).toFixed(0)} (prev ${pred}, real ${real}${pred===real?" ✓":" ✗"}) · over2.5 ${(over25*100).toFixed(0)}% (real ${realTot})`);
}
console.log(`\n1X2 acertos: ${hits}/${used} (n minúsculo — sanidade, NÃO validação)`);

// próximos jogos (previsão forward, sem resultado ainda)
const ns = await client.events({ league_id: 27, status: "notstarted", limit: 200 });
const prox = (ns?.results ?? []).filter((e: any) => e.home_team_id && e.away_team_id).slice(0, 5);
console.log(`\n===== Próximos jogos da Copa — previsão FORWARD (sem resultado ainda) =====`);
for (const e of prox) {
  const hid = String(e.home_team_id), aid = String(e.away_team_id);
  const lam = lambdaFromRatings(ratings, hid, aid, { mu0: 1.3, homeAdv: homeAdvFor("selecao") });
  const [hn, an] = await Promise.all([teamName(hid), teamName(aid)]);
  if (!ratingsEligible(ratings, hid, aid) || !lam) { console.log(`  ${hn} x ${an}: ainda sem rating (fallback)`); continue; }
  const m = scoreMatrix(lam.lambdaHome, lam.lambdaAway);
  const p = probs1x2(m);
  console.log(`  ${hn} x ${an} (${String(e.event_date ?? "").slice(0,10)}): 1X2 ${(p.home*100).toFixed(0)}/${(p.draw*100).toFixed(0)}/${(p.away*100).toFixed(0)} · over2.5 ${(probTotalOver(m,2.5)*100).toFixed(0)}%`);
}
