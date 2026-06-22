// Miolo reusável dos jobs forward ($0): logar previsão (gols/vitória) e liquidar jogos
// terminados. Extraído dos CLIs (src/cli/forwardLog.ts, src/cli/settle.ts) p/ o agendador
// 24h chamar a MESMA função (mesmo processo/conexão), sem `npx` filho. Os CLIs viram
// cascas finas. NÃO toca model/value → gate de paridade intacto.
import { runMatch } from "../pipeline.js";
import { normalizeEvent } from "../runner.js";
import { MARKETS } from "../model/markets.js";
import { settlePlayerRows, settleMatchRows } from "../backtest/settle.js";

const COPA_LEAGUE = 27;
const WINDOW_H = 72;

const linesGols = () => [1.5, 2.5, 3.5].map((linha) => ({ entidade: "partida", linha, odd_over: 2.0, odd_under: 2.0, book: "forward" }));
const lineVitoria = () => [{ entidade: "partida", linha: 0.5, odd_over: 2.0, odd_under: 2.0, book: "forward" }];

/** Loga a PREVISÃO (prob_modelo) de gols/vitória dos jogos que vêm (próximas 72h da Copa),
 *  sem odds → mede calibração. Idempotente (upsert no ledger). `ids` explícitos pulam a
 *  descoberta. `sp` = StatsProvider (BSDStatsProvider em prod). */
export async function runForwardLog(
  client: any, repo: any, sp: any, ids?: string[],
  log: (m: string) => void = () => {},
): Promise<{ logged: number; jogos: string[] }> {
  let targets = ids ?? [];
  if (!targets.length) {
    const ns = await client.events({ league_id: COPA_LEAGUE, status: "notstarted", limit: 200 });
    const now = Date.now(), horizon = now + WINDOW_H * 3600 * 1000;
    targets = (ns?.results ?? [])
      .filter((e: any) => { const t = Date.parse(e.event_date ?? e.date ?? e.start_time ?? ""); return Number.isFinite(t) && t >= now && t <= horizon; })
      .map((e: any) => String(e.id));
  }
  let logged = 0;
  const jogos: string[] = [];
  for (const id of targets) {
    let raw: any;
    try { raw = await client.getEvent(id); } catch { log(`evento ${id}: getEvent falhou — pula`); continue; }
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
    if (!rows.length) { log(`${event.jogo}: sem previsão (ratings inelegíveis / placeholder) — pula`); continue; }
    await repo.saveLedger(rows);
    logged += rows.length;
    jogos.push(event.jogo);
    log(`${event.jogo}: ${rows.map((r) => `${r.market_type} ${r.linha}=${(r.prob_modelo * 100).toFixed(0)}%`).join(" · ")}`);
  }
  return { logged, jogos };
}

/** Liquida o paper_ledger dos jogos terminados. `ids` explícitos, ou (sem arg) todos os
 *  eventos com linha pendente (resultado nulo). Player prop via player-stats; partida via
 *  placar. Idempotente. */
export async function runSettle(
  client: any, repo: any, ids?: string[],
  log: (m: string) => void = () => {},
): Promise<{ liquidadas_player: number; liquidadas_partida: number; eventos: number }> {
  let eventIds = ids ?? [];
  if (!eventIds.length) {
    const all = await repo.allLedger();
    eventIds = [...new Set(all.filter((r: any) => r.resultado == null).map((r: any) => String(r.event_id)))] as string[];
  }
  let totalP = 0, totalM = 0, eventos = 0;
  for (const eventId of eventIds) {
    const ledger = await repo.getLedger(eventId);
    if (!ledger.length) { log(`ledger vazio p/ evento ${eventId}`); continue; }
    let playerStats: any[] = [];
    try { playerStats = (await client.eventPlayerStats(eventId))?.player_stats ?? []; } catch { /* sem stats */ }
    let ev: any = {};
    try { ev = await client.getEvent(eventId); } catch { /* sem evento */ }
    const finished = ev?.home_score != null && ev?.away_score != null;
    if (!finished) { log(`evento ${eventId} ainda sem placar — pula`); continue; }

    const playerInstr = settlePlayerRows(ledger, playerStats);
    const matchInstr = settleMatchRows(ledger, ev);
    for (const i of [...playerInstr, ...matchInstr]) {
      await repo.settleResult(i.event_id, i.jogador, i.linha, i.market_type, i.resultado);
      log(`[${eventId}] ${i.jogador} ${i.market_type} ${i.linha} → resultado=${i.resultado}`);
    }
    totalP += playerInstr.length;
    totalM += matchInstr.length;
    eventos++;
  }
  return { liquidadas_player: totalP, liquidadas_partida: totalM, eventos };
}
