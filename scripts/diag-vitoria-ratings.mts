// DIAGNÓSTICO (Fase 1 do debug): por que vitória miscalibra (probs extremas — ex.
// Iran×NZ 85% over2.5 / vitoria 16%, Saudi×Uruguay gols1.5 46%)? Dump dos ratings
// (att/def/games) + composição por liga-fonte dos times suspeitos, no MESMO caminho da
// produção (ratingsPoolLeagues → computeRatings → λ → Dixon-Coles). Só leitura, cache $0.
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { ratingsPoolLeagues } from "../src/model/markets.js";
import { computeRatings, lambdaFromRatings, ratingsEligible, homeAdvFor, type ChronoGame } from "../src/model/ratings.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";
import { diskCachedGet } from "./lib/diskCache.mts";

const apiKey = getRequired("BZZOIRO_API_KEY");
const client = new BSDClient(apiKey, { get: diskCachedGet(apiKey) });

type SrcGame = ChronoGame & { lg: number; homeName?: string; awayName?: string };
async function leaguePoolSrc(lg: number): Promise<SrcGame[]> {
  const evs = await client.events({ league_id: lg, status: "finished", limit: 150 });
  const out: SrcGame[] = [];
  for (const e of (evs?.results ?? [])) {
    if (e?.home_score == null || e?.away_score == null) continue;
    out.push({ date: String(e.event_date ?? ""), home: String(e.home_team_id), away: String(e.away_team_id), homeScore: Number(e.home_score), awayScore: Number(e.away_score), lg, homeName: e.home_team, awayName: e.away_team });
  }
  return out;
}

const poolLeagues = ratingsPoolLeagues(27);
const pools = (await Promise.all(poolLeagues.map(leaguePoolSrc))).flat();
const homeAdv = homeAdvFor("selecao");
const ratings = computeRatings(pools, { mu0: 1.3, homeAdv });

const idName = (id: string) => { for (const g of pools) { if (g.home === id && g.homeName) return String(g.homeName); if (g.away === id && g.awayName) return String(g.awayName); } return id; };
function perLeague(id: string): Record<number, number> {
  const r: Record<number, number> = {};
  for (const g of pools) if (g.home === id || g.away === id) r[g.lg] = (r[g.lg] ?? 0) + 1;
  return r;
}
function dumpTeam(id: string) {
  const r = ratings.get(id);
  if (!r) { console.log(`    ${idName(id)} (${id}): SEM rating no pool`); return; }
  console.log(`    ${idName(id)} (${id}): att=${r.att.toFixed(3)} def=${r.def.toFixed(3)} games=${r.games} · por liga: ${JSON.stringify(perLeague(id))}`);
}

console.log(`pool ${pools.length} jogos · ${ratings.size} seleções com rating · ligas-fonte: ${poolLeagues.join(",")}\n`);

// distribuição de games por time (quantos times têm poucos jogos = ilha rasa)
const dist: Record<string, number> = { "5-9": 0, "10-19": 0, "20+": 0, "<5(inelegível)": 0 };
for (const r of ratings.values()) {
  if (r.games < 5) dist["<5(inelegível)"]++; else if (r.games < 10) dist["5-9"]++; else if (r.games < 20) dist["10-19"]++; else dist["20+"]++;
}
console.log(`Distribuição de #jogos por seleção: ${JSON.stringify(dist)}\n`);

const ns = await client.events({ league_id: 27, status: "notstarted", limit: 200 });
const want: [string, string][] = [["Iran", "New Zealand"], ["Saudi Arabia", "Uruguay"], ["England", "Croatia"], ["Iran", "Norway"], ["Saudi", "Uruguay"]];
for (const e of (ns?.results ?? [])) {
  const hn = String(e.home_team ?? ""), an = String(e.away_team ?? "");
  if (!want.some(([h, a]) => hn.includes(h) && an.includes(a))) continue;
  const hid = String(e.home_team_id), aid = String(e.away_team_id);
  console.log(`=== ${hn} x ${an} ===`);
  dumpTeam(hid); dumpTeam(aid);
  for (const k of [0, 3, 6, 9, 12]) {
    const lam = lambdaFromRatings(ratings, hid, aid, { mu0: 1.3, homeAdv, shrinkK: k });
    if (!lam) { console.log(`    k=${k}: sem λ (fallback)`); continue; }
    const m = scoreMatrix(lam.lambdaHome, lam.lambdaAway);
    console.log(`    k=${String(k).padStart(2)}: λ_home=${lam.lambdaHome.toFixed(2)} λ_away=${lam.lambdaAway.toFixed(2)} · vitoria(casa)=${(probs1x2(m).home * 100).toFixed(0)}% over2.5=${(probTotalOver(m, 2.5) * 100).toFixed(0)}%`);
  }
  console.log();
}
