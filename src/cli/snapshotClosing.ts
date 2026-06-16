// Snapshot da odd de FECHAMENTO p/ CLV. CLV = odd_flag(abertura)/odd_fechamento − 1.
//
// SEM ARGS → BULK automático: fecha TODAS as linhas de PARTIDA (gols/vitória) com odd de
//   abertura travada (odd_flag) e ainda sem fechamento, lendo a odd atual da BSD. Rode
//   PERTO DO APITO (a odd da BSD então é a de fechamento). Idempotente: re-rodar re-grava
//   o fechamento com a odd mais recente (use só perto do kickoff).
// COM ARGS → manual (1 linha):
//   partida: npx tsx src/cli/snapshotClosing.ts <event_id> partida <jogador> <linha> <market_type> [home|draw|away]
//   prop:    npx tsx src/cli/snapshotClosing.ts <event_id> prop    <jogador> <linha> <market_type> <odd_fechamento>
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { matchClosingOdd, withinClosingWindow } from "./snapshotClosingLib.js";
import { parseBsdMatchOdds, matchBetOdd, outcomeFromJogador, isGols, isVitoria } from "../odds/bsdMatchOdds.js";
import { appendOddsSnapshot } from "../odds/snapshotArchive.js";

const argv = process.argv.slice(2);
const repo = await createSupabaseRepo();
// modo bulk = sem args OU só flags (--all / --window N). Args "de verdade" = modo manual.
const isBulk = argv.length === 0 || (argv[0]?.startsWith("--") ?? false);

if (isBulk) {
  // BULK: linhas de partida com abertura travada e sem fechamento ainda. Por padrão, só
  // captura jogos PERTO do apito (pós-escalação) — `--all` ignora a janela; `--window N`
  // ajusta os minutos (default 90).
  const ignoreWindow = argv.includes("--all");
  const wIdx = argv.indexOf("--window");
  const windowMin = wIdx >= 0 ? Number(argv[wIdx + 1]) : 90;
  const now = Date.now();
  const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
  const all = await repo.allLedger();
  const pend = all.filter((r: any) =>
    (isGols(r.market_type) || isVitoria(r.market_type)) && r.odd_flag != null && r.odd_fechamento == null);
  const byEvent = new Map<string, any[]>();
  for (const r of pend) { const k = String(r.event_id); byEvent.set(k, [...(byEvent.get(k) ?? []), r]); }
  console.log(`snapshotClosing bulk: ${pend.length} linha(s) pendentes em ${byEvent.size} jogo(s)${ignoreWindow ? " (--all: ignora janela)" : ` (janela ${windowMin}min antes do apito)`}`);
  let done = 0, foraJanela = 0;
  for (const [eventId, rows] of byEvent) {
    if (!ignoreWindow) {
      let kickoff = NaN;
      try { const ev = await client.getEvent(eventId); kickoff = Date.parse(ev?.event_date ?? ev?.date ?? ev?.start_time ?? ""); } catch { /* sem data */ }
      if (!withinClosingWindow(kickoff, now, windowMin)) { foraJanela++; continue; }
    }
    let parsed, rawOdds: any;
    try { rawOdds = await client.eventOdds(eventId); parsed = parseBsdMatchOdds(rawOdds); } catch { console.log(`  ${eventId}: odds indisponíveis — pula`); continue; }
    // foto do quadro de FECHAMENTO (pós-escalação) — forense, não substitui o banco.
    try { appendOddsSnapshot({ ts: new Date().toISOString(), fase: "fechamento", event_id: String(eventId), odds: rawOdds?.odds ?? rawOdds }); } catch { /* arquivo opcional */ }
    for (const r of rows) {
      const outcome = outcomeFromJogador(r.jogador);
      const closing = matchBetOdd(parsed, r.market_type, Number(r.linha), outcome);
      if (closing == null) { console.log(`  ${eventId} ${r.jogador} ${r.market_type} ${r.linha}: sem odd de fechamento na BSD — pula`); continue; }
      await repo.snapshotClosing(eventId, r.jogador, Number(r.linha), r.market_type, closing);
      done++;
      const clv = (Number(r.odd_flag) / closing - 1) * 100;
      console.log(`  [${eventId}] ${r.jogador} ${r.market_type} ${r.linha}: abertura=${r.odd_flag} fechamento=${closing} → CLV ${clv >= 0 ? "+" : ""}${clv.toFixed(1)}%`);
    }
  }
  console.log(`\n${done} fechamento(s) gravado(s)${foraJanela ? ` · ${foraJanela} jogo(s) ainda longe do apito (rode de novo perto deles)` : ""}. CLV médio por mercado em report.ts.`);
  process.exit(0);
}

// MANUAL (1 linha)
const [eventId, modo, jogador, linhaStr, marketType, extra] = argv;
if (!eventId || !modo || !jogador || !linhaStr || !marketType) {
  console.error("uso: snapshotClosing <event_id> <partida|prop> <jogador> <linha> <market_type> [home|draw|away|odd]  (ou SEM args = bulk)");
  process.exit(1);
}
const linha = Number(linhaStr);

let closing: number | null = null;
if (modo === "prop") {
  closing = Number(extra);
  if (!Number.isFinite(closing)) { console.error("prop exige odd_fechamento numérica"); process.exit(1); }
} else {
  const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
  const odds = await client.eventOdds(eventId);
  const outcome = (extra === "draw" || extra === "away") ? extra : "home";
  closing = matchClosingOdd(odds, marketType!, linha, outcome);
  if (closing == null) { console.error("não achei a odd de fechamento p/ esse mercado/linha na BSD"); process.exit(1); }
}

await repo.snapshotClosing(eventId, jogador!, linha, marketType!, closing!);
console.log(`fechamento ${jogador} ${marketType} ${linha} = ${closing} (CLV gravado)`);
