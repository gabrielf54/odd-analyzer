// LOOP FORWARD (passo 1 — calibração): loga a PREVISÃO do modelo (gols/vitória, via
// ratings de força) dos jogos QUE VÊM no paper_ledger, ANTES de serem jogados. Sem
// odds → mede só calibração (Brier/ECE). CLV vem quando as odds entrarem (fase 2).
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

const COPA_LEAGUE = 27;
const WINDOW_H = 72;

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const repo = await createSupabaseRepo();
const sp = new BSDStatsProvider(client);

const linesGols = () => [1.5, 2.5, 3.5].map((linha) => ({ entidade: "partida", linha, odd_over: 2.0, odd_under: 2.0, book: "forward" }));
const lineVitoria = () => [{ entidade: "partida", linha: 0.5, odd_over: 2.0, odd_under: 2.0, book: "forward" }];

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
  const rows: any[] = [];
  for (const [mkt, op] of [[MARKETS.gols, { lines: linesGols }], [MARKETS.vitoria, { lines: lineVitoria }]] as const) {
    let cands: any[] = [];
    try { cands = await runMatch(event, mkt!, sp, op); } catch { cands = []; }
    for (const c of cands) rows.push({
      event_id: event.id, jogador: c.jogador, linha: c.linha, market_type: c.market_type,
      prob_modelo: c.prob_modelo, odd_flag: null, prob_devig: null, edge: null, ev: null, player_id: null,
    });
  }
  if (!rows.length) { console.log(`  ${event.jogo}: sem previsão (ratings inelegíveis / placeholder) — pula`); continue; }
  await repo.saveLedger(rows);
  logged += rows.length;
  console.log(`  ${event.jogo}: ${rows.map((r) => `${r.market_type} ${r.linha}=${(r.prob_modelo * 100).toFixed(0)}%`).join(" · ")}`);
}
console.log(`\ntotal: ${logged} previsões logadas (upsert idempotente). Sem odds → calibração; rode settle.ts após os jogos e report.ts p/ o veredito.`);
