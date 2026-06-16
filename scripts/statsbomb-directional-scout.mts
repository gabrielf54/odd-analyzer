/**
 * SCOUT (de-risk, NÃO build): o "confronto direcional" do produto tem sinal real?
 *
 * Pergunta GO/NO-GO: o CANAL (esquerda/centro/direita) de onde um time CHUTA é
 * mais previsível quando se conhece a concessão ESPECÍFICA-POR-CANAL do adversário,
 * comparado a só a concessão MÉDIA do adversário?
 *
 * Fonte: StatsBomb Open Data (grátis), Copa do Mundo masculina 2022 (comp 43 / season 106).
 * Cada evento de Shot tem location [x,y] num campo 120x80, normalizado com o atacante
 * SEMPRE indo esquerda->direita (gol adversário em x=120). Logo o eixo Y é consistente
 * entre times: Y baixo / Y alto = lados opostos do campo de ataque.
 *
 * NÃO integra em src/. NÃO commita dado. Só baixa em tmp/statsbomb/ (cache).
 *
 * Rodar: npx tsx scripts/statsbomb-directional-scout.mts
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "C:/Users/gabri/Documents/projects/odd-analyzer";
const CACHE = join(ROOT, "tmp", "statsbomb");
const BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";
const COMP = 43;
const SEASON = 106; // Copa do Mundo 2022 (masculina)
const N_MATCHES = 32; // timebox (metade da Copa 2022)

mkdirSync(CACHE, { recursive: true });

// ---- carregamento com cache em disco ----------------------------------------
async function getJson<T>(url: string, cacheFile: string): Promise<T> {
  const path = join(CACHE, cacheFile);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const text = await res.text();
  writeFileSync(path, text);
  return JSON.parse(text) as T;
}

// ---- canal pelo Y (largura 0..80) -------------------------------------------
// StatsBomb: atacante vai esquerda->direita; Y é a largura. Terços iguais.
type Channel = "L" | "C" | "R";
function channelOf(y: number): Channel {
  if (y < 80 / 3) return "L";
  if (y > (2 * 80) / 3) return "R";
  return "C";
}
const CHANNELS: Channel[] = ["L", "C", "R"];

// ---- tipos mínimos do StatsBomb ---------------------------------------------
interface Match { match_id: number; home_team: { home_team_name: string }; away_team: { away_team_name: string }; }
interface Ev {
  id: string;
  type: { name: string };
  team: { name: string };
  location?: [number, number, number?];
  shot?: { key_pass_id?: string };
}

// ---- agregação --------------------------------------------------------------
// Para cada (time, adversário) num jogo: contagem de chutes por canal.
interface Row { team: string; opp: string; counts: Record<Channel, number>; total: number; }

function zero(): Record<Channel, number> { return { L: 0, C: 0, R: 0 }; }

async function main() {
  const matches = await getJson<Match[]>(`${BASE}/matches/${COMP}/${SEASON}.json`, `matches_${COMP}_${SEASON}.json`);
  const chosen = matches.slice(0, N_MATCHES);
  console.log(`Copa 2022: comp=${COMP} season=${SEASON} | jogos disponiveis=${matches.length} | usando ${chosen.length}`);

  const rows: Row[] = [];
  let totalShots = 0;
  let shotsSemLocation = 0;

  for (const m of chosen) {
    const home = m.home_team.home_team_name;
    const away = m.away_team.away_team_name;
    const events = await getJson<Ev[]>(`${BASE}/events/${m.match_id}.json`, `events_${m.match_id}.json`);
    const byId: Record<string, Ev> = {};
    for (const e of events) byId[e.id] = e;
    const shots = events.filter((e) => e.type?.name === "Shot");

    const byTeam: Record<string, Record<Channel, number>> = { [home]: zero(), [away]: zero() };
    for (const s of shots) {
      // CANAL = lado de ORIGEM da jogada (key pass) quando existe; senao o ponto do chute.
      // O Y do chute colapsa quase tudo no centro (finalizacao perto do gol); a origem
      // da jogada captura o FLANCO de ataque, que e o conceito do "confronto direcional".
      const kp = s.shot?.key_pass_id ? byId[s.shot.key_pass_id] : undefined;
      const loc = kp?.location ?? s.location;
      if (!loc) { shotsSemLocation++; continue; }
      const ch = channelOf(loc[1]);
      const t = s.team.name;
      if (!byTeam[t]) byTeam[t] = zero();
      byTeam[t][ch]++;
      totalShots++;
    }
    for (const [team, counts] of Object.entries(byTeam)) {
      const opp = team === home ? away : home;
      const total = counts.L + counts.C + counts.R;
      rows.push({ team, opp, counts, total });
    }
  }

  console.log(`chutes com location=${totalShots} | sem location=${shotsSemLocation}\n`);

  // ---- perfis ---------------------------------------------------------------
  // ATAQUE de cada time: distribuicao de canal de onde ELE chuta (agregada).
  // DEFESA (concessao) de cada time: distribuicao de canal dos chutes que ELE concede.
  // Liga: distribuicao media global.
  const atkCounts: Record<string, Record<Channel, number>> = {};
  const defCounts: Record<string, Record<Channel, number>> = {}; // concessao por canal
  const ligaCounts = zero();

  for (const r of rows) {
    atkCounts[r.team] ??= zero();
    defCounts[r.opp] ??= zero();
    for (const ch of CHANNELS) {
      atkCounts[r.team][ch] += r.counts[ch];
      defCounts[r.opp][ch] += r.counts[ch]; // chutes que o adversario concedeu
      ligaCounts[ch] += r.counts[ch];
    }
  }

  function dist(c: Record<Channel, number>): Record<Channel, number> {
    const t = c.L + c.C + c.R || 1;
    return { L: c.L / t, C: c.C / t, R: c.R / t };
  }
  const ligaDist = dist(ligaCounts);
  console.log(`distribuicao MEDIA da liga (canal dos chutes): L=${ligaDist.L.toFixed(3)} C=${ligaDist.C.toFixed(3)} R=${ligaDist.R.toFixed(3)}\n`);

  // ---- dois modelos preditivos da distribuicao de canal de UMA dupla (team x opp) ----
  // Sinal multiplicativo (estilo do produto: producao x concessao no MESMO eixo).
  //
  // Modelo A (NAO-direcional): so a tendencia de canal do ataque do time.
  //   pred_A(ch) ∝ atk[ch]                  (concessao do adversario entra so como media => some)
  //
  // Modelo B (DIRECIONAL): producao do time POR canal x concessao do adversario POR canal,
  //   normalizada pela media da liga (lift de concessao do adversario naquele canal).
  //   pred_B(ch) ∝ atk[ch] * (def_opp[ch] / liga[ch])
  //
  // Avaliacao LEAVE-ONE-OUT por dupla: ao prever a dupla (team,opp) daquele jogo,
  // removemos as contagens DAQUELE jogo dos perfis atk[team] e def[opp] (sem colar).
  // Comparamos cada modelo com a distribuicao REAL observada de canal naquele jogo.

  function normalize(p: Record<Channel, number>): Record<Channel, number> {
    const t = p.L + p.C + p.R || 1;
    return { L: p.L / t, C: p.C / t, R: p.R / t };
  }
  function brier(pred: Record<Channel, number>, obs: Record<Channel, number>): number {
    // soma dos quadrados sobre as 3 classes (multiclass Brier, menor=melhor)
    return CHANNELS.reduce((acc, ch) => acc + (pred[ch] - obs[ch]) ** 2, 0);
  }
  function logloss(pred: Record<Channel, number>, obsCounts: Record<Channel, number>): number {
    // -sum n_ch * log(pred_ch), com piso pra evitar log(0)
    let ll = 0;
    for (const ch of CHANNELS) {
      const p = Math.max(pred[ch], 1e-6);
      ll += obsCounts[ch] * -Math.log(p);
    }
    return ll;
  }

  let brierA = 0, brierB = 0, brierLiga = 0;
  let llA = 0, llB = 0, llLiga = 0, llN = 0;
  let nEval = 0, bBeatsA = 0;
  const examples: string[] = [];

  for (const r of rows) {
    if (r.total < 4) continue; // amostra ruidosa demais por jogo
    const obs = normalize(r.counts);

    // perfis leave-one-out (tira este jogo)
    const atkLOO = zero(), defLOO = zero();
    for (const ch of CHANNELS) {
      atkLOO[ch] = atkCounts[r.team][ch] - r.counts[ch];
      defLOO[ch] = defCounts[r.opp][ch] - r.counts[ch];
    }
    // liga leave-one-out
    const ligaLOO = zero();
    for (const ch of CHANNELS) ligaLOO[ch] = ligaCounts[ch] - r.counts[ch];
    const ligaD = dist(ligaLOO);
    const atkD = dist(atkLOO);
    const defD = dist(defLOO);

    // Modelo A: so ataque do time (concessao adversaria entra como media uniforme)
    const predA = normalize(atkD);
    // Modelo B: ataque x lift de concessao do adversario por canal
    const rawB: Record<Channel, number> = zero();
    for (const ch of CHANNELS) {
      const lift = ligaD[ch] > 0 ? defD[ch] / ligaD[ch] : 1;
      rawB[ch] = atkD[ch] * lift;
    }
    const predB = normalize(rawB);
    // baseline burro: so a media da liga
    const predLiga = ligaD;

    brierA += brier(predA, obs);
    brierB += brier(predB, obs);
    brierLiga += brier(predLiga, obs);
    llA += logloss(predA, r.counts);
    llB += logloss(predB, r.counts);
    llLiga += logloss(predLiga, r.counts);
    llN += r.total;
    if (brier(predB, obs) < brier(predA, obs)) bBeatsA++;
    nEval++;

    if (examples.length < 6) {
      examples.push(
        `${r.team} vs ${r.opp} (n=${r.total}) | REAL L=${obs.L.toFixed(2)} C=${obs.C.toFixed(2)} R=${obs.R.toFixed(2)}` +
        ` | A L=${predA.L.toFixed(2)} C=${predA.C.toFixed(2)} R=${predA.R.toFixed(2)}` +
        ` | B L=${predB.L.toFixed(2)} C=${predB.C.toFixed(2)} R=${predB.R.toFixed(2)}` +
        ` | defOpp L=${defD.L.toFixed(2)} C=${defD.C.toFixed(2)} R=${defD.R.toFixed(2)}`
      );
    }
  }

  console.log(`=== avaliacao leave-one-out por (time,adversario), ${nEval} duplas com >=4 chutes ===\n`);
  console.log("exemplos:");
  for (const e of examples) console.log("  " + e);
  console.log("");
  console.log("Brier medio (menor = melhor):");
  console.log(`  baseline liga (so media):     ${(brierLiga / nEval).toFixed(4)}`);
  console.log(`  A NAO-direcional (ataque):    ${(brierA / nEval).toFixed(4)}`);
  console.log(`  B DIRECIONAL (ataque x conc): ${(brierB / nEval).toFixed(4)}`);
  console.log("");
  console.log("Log-loss por chute (menor = melhor):");
  console.log(`  baseline liga:                ${(llLiga / llN).toFixed(4)}`);
  console.log(`  A NAO-direcional:             ${(llA / llN).toFixed(4)}`);
  console.log(`  B DIRECIONAL:                 ${(llB / llN).toFixed(4)}`);
  console.log("");
  const dBrier = (brierA - brierB) / nEval;
  const dLL = (llA - llB) / llN;
  console.log(`B vence A em Brier em ${bBeatsA}/${nEval} duplas (${(100 * bBeatsA / nEval).toFixed(0)}%)`);
  console.log(`delta Brier (A - B) = ${dBrier.toFixed(4)}  (positivo = direcional melhora)`);
  console.log(`delta log-loss (A - B) = ${dLL.toFixed(4)}  (positivo = direcional melhora)`);

  // ---- sinal correlacional bruto: lift de concessao adversaria explica desvio? ----
  // Para cada dupla: o canal mais favorecido pela concessao do adversario (def/liga)
  // coincide com o canal onde o REAL ficou ACIMA do ataque-base do time?
  let agree = 0, totalDir = 0;
  for (const r of rows) {
    if (r.total < 4) continue;
    const atkLOO = zero(), defLOO = zero(), ligaLOO = zero();
    for (const ch of CHANNELS) {
      atkLOO[ch] = atkCounts[r.team][ch] - r.counts[ch];
      defLOO[ch] = defCounts[r.opp][ch] - r.counts[ch];
      ligaLOO[ch] = ligaCounts[ch] - r.counts[ch];
    }
    const atkD = dist(atkLOO), defD = dist(defLOO), ligaD = dist(ligaLOO), obs = normalize(r.counts);
    // canal onde concessao adversaria tem maior lift
    let bestCh: Channel = "L", bestLift = -Infinity;
    for (const ch of CHANNELS) {
      const lift = ligaD[ch] > 0 ? defD[ch] / ligaD[ch] : 1;
      if (lift > bestLift) { bestLift = lift; bestCh = ch; }
    }
    // o REAL nesse canal ficou acima do ataque-base do time?
    if (obs[bestCh] > atkD[bestCh]) agree++;
    totalDir++;
  }
  console.log("");
  console.log(`Teste direcional bruto: no canal onde o adversario MAIS concede, o time chutou`);
  console.log(`ACIMA da sua media em ${agree}/${totalDir} duplas (${(100 * agree / totalDir).toFixed(0)}%). Acaso ~ 50%.`);

  // ---- TESTE DECISIVO: correlacao por (dupla x canal), N grande --------------
  // Hipotese do produto: quanto MAIS o adversario concede num canal (lift def/liga),
  // MAIS o time chuta por esse canal ACIMA da sua propria media de ataque.
  // x = lift de concessao do adversario no canal (log(def/liga), leave-one-out)
  // y = desvio observado do ataque do time no canal (log(obs/atk), leave-one-out)
  // Correlacao positiva = sinal direcional real que o baseline nao-direcional perde.
  const xs: number[] = [], ys: number[] = [];
  for (const r of rows) {
    if (r.total < 4) continue;
    const atkLOO = zero(), defLOO = zero(), ligaLOO = zero();
    for (const ch of CHANNELS) {
      atkLOO[ch] = atkCounts[r.team][ch] - r.counts[ch];
      defLOO[ch] = defCounts[r.opp][ch] - r.counts[ch];
      ligaLOO[ch] = ligaCounts[ch] - r.counts[ch];
    }
    const atkD = dist(atkLOO), defD = dist(defLOO), ligaD = dist(ligaLOO), obs = normalize(r.counts);
    for (const ch of CHANNELS) {
      const lift = ligaD[ch] > 0 && defD[ch] > 0 ? Math.log(defD[ch] / ligaD[ch]) : null;
      const dev = atkD[ch] > 0 && obs[ch] > 0 ? Math.log(obs[ch] / atkD[ch]) : null;
      if (lift === null || dev === null) continue;
      xs.push(lift); ys.push(dev);
    }
  }
  function pearson(a: number[], b: number[]): number {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return num / Math.sqrt(da * db);
  }
  const rCorr = pearson(xs, ys);
  // erro padrao aproximado de r e t-stat
  const nC = xs.length;
  const tStat = rCorr * Math.sqrt((nC - 2) / (1 - rCorr * rCorr));
  console.log("");
  console.log(`=== TESTE DECISIVO (correlacao por dupla x canal, N=${nC} pontos) ===`);
  console.log(`x = log(concessao_adv / liga)  [o adversario concede mais nesse canal?]`);
  console.log(`y = log(chutes_obs / ataque_base)  [o time chutou mais por esse canal que o normal?]`);
  console.log(`Pearson r = ${rCorr.toFixed(3)}  | t ~ ${tStat.toFixed(2)}  (|t|>2 ~ significante a N grande)`);
  console.log(`r>0 = ha sinal direcional; r~0 = concessao do adversario nao desloca o ataque.`);
}

main().catch((e) => { console.error("FALHA:", e); process.exit(1); });
