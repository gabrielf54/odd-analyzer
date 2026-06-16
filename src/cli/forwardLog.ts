// LOOP FORWARD (passo 1): loga a PREVISÃO do modelo (gols/vitória, via ratings de força)
// dos jogos QUE VÊM no paper_ledger, ANTES de serem jogados.
//   Fase 1 (calibração): sempre loga prob_modelo → Brier/ECE.
//   Fase 2 (CLV, LIGADA 2026-06-15): se a BSD já precificou o jogo, ANEXA odd_flag +
//   prob_devig (de-vig) + edge + ev. A odd de FECHAMENTO p/ o CLV vem perto do apito
//   via `snapshotClosing.ts`. CLV = odd_flag/odd_fechamento − 1.
// Liquidação depois: `src/cli/settle.ts`. Relatório: `src/cli/report.ts`.
//
// Sem arg → jogos da Copa (liga 27) que começam nas próximas 72h. Com args → esses
// event_ids (útil p/ logar um jogo específico). Placeholders de mata-mata (sem rating)
// não produzem previsão → são pulados. Uso: npx tsx src/cli/forwardLog.ts [event_id...]
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { BSDStatsProvider } from "../providers/stats.js";
import { runMatch } from "../pipeline.js";
import { normalizeEvent } from "../runner.js";
import { MARKETS } from "../model/markets.js";
import { parseBsdMatchOdds, matchBetOdd, matchFairProb, outcomeFromJogador, type ParsedMatchOdds } from "../odds/bsdMatchOdds.js";
import { edgeEv } from "../value/ev.js";

const COPA_LEAGUE = 27;
const WINDOW_H = 72;

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const repo = await createSupabaseRepo();
const sp = new BSDStatsProvider(client);

const linesGols = () => [1.5, 2.5, 3.5].map((linha) => ({ entidade: "partida", linha, odd_over: 2.0, odd_under: 2.0, book: "forward" }));
// 3 lados (mandante/empate/visitante) p/ testar a hipótese "fadar favorito" no forward —
// o runMatch mapeia a entidade ao desfecho e anexa o sufixo (1)/(X)/(2) no jogador.
const lineVitoria = (event: any) => {
  const h = event?.home_team?.name ?? "mandante", a = event?.away_team?.name ?? "visitante";
  return [h, "empate", a].map((entidade) => ({ entidade, linha: 0.5, odd_over: 2.0, odd_under: 2.0, book: "forward" }));
};

async function targetIds(): Promise<string[]> {
  const args = process.argv.slice(2);
  if (args.length) return args;
  const ns = await client.events({ league_id: COPA_LEAGUE, status: "notstarted", limit: 200 });
  const now = Date.now(), horizon = now + WINDOW_H * 3600 * 1000;
  return (ns?.results ?? [])
    .filter((e: any) => { const t = Date.parse(e.event_date ?? e.date ?? e.start_time ?? ""); return Number.isFinite(t) && t >= now && t <= horizon; })
    .map((e: any) => String(e.id));
}

const ids = await targetIds();
console.log(`forwardLog: ${ids.length} jogo(s) alvo${process.argv.length > 2 ? " (explícitos)" : ` (Copa, próximas ${WINDOW_H}h)`}`);

let logged = 0;
for (const id of ids) {
  let raw: any;
  try { raw = await client.getEvent(id); } catch { console.log(`  evento ${id}: getEvent falhou — pula`); continue; }
  const event = normalizeEvent(raw);
  // Fase 2: odds de partida da BSD (1 chamada/jogo). Ausente/não precificado → só calibração.
  let parsedOdds: ParsedMatchOdds | null = null;
  try { parsedOdds = parseBsdMatchOdds(await client.eventOdds(id)); } catch { parsedOdds = null; }
  // odd_flag é a linha de ABERTURA (1ª observação): NÃO sobrescrever em re-runs, senão o
  // CLV fica cego (mediria a odd já fechada contra ela mesma). Lê o que já existe e trava.
  const prev = new Map<string, any>();
  try { for (const r of await repo.getLedger(id)) prev.set(`${r.jogador}|${r.linha}|${r.market_type}`, r); } catch { /* sem ledger ainda */ }
  const numOrNull = (v: unknown) => (v == null ? null : Number(v));
  const rows: any[] = [];
  for (const [mkt, op] of [[MARKETS.gols, { lines: linesGols }], [MARKETS.vitoria, { lines: lineVitoria }]] as const) {
    let cands: any[] = [];
    try { cands = await runMatch(event, mkt!, sp, op); } catch { cands = []; }
    for (const c of cands) {
      const old = prev.get(`${c.jogador}|${c.linha}|${c.market_type}`);
      let odd_flag: number | null = numOrNull(old?.odd_flag);
      let prob_devig: number | null = numOrNull(old?.prob_devig);
      // ainda sem odd de abertura E a casa já precificou → trava agora (de-vig junto).
      if (odd_flag == null && parsedOdds) {
        const outcome = outcomeFromJogador(c.jogador);
        const o = matchBetOdd(parsedOdds, c.market_type, c.linha, outcome);
        const fair = matchFairProb(parsedOdds, c.market_type, c.linha, outcome);
        if (o != null && fair != null) { odd_flag = o; prob_devig = fair; }
      }
      // edge/ev sempre relativos à ABERTURA travada + ao prob_modelo ATUAL (refina até o apito).
      let edge: number | null = null, ev: number | null = null;
      if (odd_flag != null && prob_devig != null) {
        const m = edgeEv(c.prob_modelo, prob_devig, odd_flag); edge = m.edge; ev = m.ev;
      }
      rows.push({
        event_id: event.id, jogador: c.jogador, linha: c.linha, market_type: c.market_type,
        prob_modelo: c.prob_modelo, odd_flag, prob_devig, edge, ev, player_id: null,
      });
    }
  }
  if (!rows.length) { console.log(`  ${event.jogo}: sem previsão (ratings inelegíveis / placeholder) — pula`); continue; }
  await repo.saveLedger(rows);
  logged += rows.length;
  const comOdds = rows.filter((r) => r.odd_flag != null).length;
  const fmt = (r: any) => `${r.market_type} ${r.linha}=${(r.prob_modelo * 100).toFixed(0)}%${r.edge != null ? ` (odd ${r.odd_flag}, edge ${(r.edge * 100).toFixed(0)}pp)` : ""}`;
  console.log(`  ${event.jogo} [${comOdds}/${rows.length} c/ odd]: ${rows.map(fmt).join(" · ")}`);
}
console.log(`\ntotal: ${logged} previsões logadas (upsert idempotente). Odds anexadas quando a BSD já precificou (de-vig/edge); rode snapshotClosing.ts perto do apito (CLV), settle.ts após o jogo e report.ts p/ o veredito.`);
