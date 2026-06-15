// COLETA AUTOMÁTICA de odds → grava no `odds` (a análise manual já lê daí). Roda LOCAL no
// BR (mata o geoblock), DESLOGADO. As casas vêm do registry (src/collect/houses.ts) — este
// CLI só monta os fetchers e chama runCollection (a MESMA orquestração do endpoint HTTP).
//
// Uso (Copa 2026): só o event_id da BSD — acha o jogo nas casas SOZINHO (crosswalk PT/EN/FR):
//   npx tsx src/cli/collectOdds.ts <event_id_BSD>            (todas as casas)
//   npx tsx src/cli/collectOdds.ts <event_id_BSD> --kambi <id> --bet6 <id>   (ids à mão)
//   ...+ --dry → só imprime, não grava.
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";
import { getRequired } from "../config.js";
import { normalizeEvent } from "../runner.js";
import { runCollection } from "../collect/run.js";
import { reprojectUnifiedOdds } from "../service.js";
import { makeFetchers } from "./fetchers.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const eventId = process.argv[2];
if (!eventId || eventId.startsWith("--")) {
  console.error("uso: collectOdds.ts <event_id_BSD> [--kambi <id>] [--bet6 <id>] [--dry]");
  process.exit(1);
}
const dry = process.argv.includes("--dry");
const overrides: Record<string, string> = {};
const kambiArg = arg("--kambi"); if (kambiArg) overrides.kto = kambiArg;
const bet6Arg = arg("--bet6"); if (bet6Arg) overrides.betnacional = bet6Arg;

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const ev = normalizeEvent(await client.getEvent(eventId));
const jogo = ev.jogo, home = ev.home_team.name, away = ev.away_team.name;
console.log(`jogo: ${jogo}`);

console.log("abrindo fetchers (headless p/ casas Cloudflare)...");
const fetchers = await makeFetchers();
const repo = dry ? { saveOdds() {} } : await createSupabaseRepo();
let r;
try {
  r = await runCollection({ id: eventId, jogo, home, away }, repo, fetchers, { overrides, dry, log: (m) => console.log(m) });
} finally {
  await fetchers.close();
}
// Espelho automático: mesma regra do endpoint HTTP — toda coleta que grava re-gera a
// odds_unificadas (sem isso, coleta via CLI deixaria o espelho velho — achado do review).
if (!dry) await reprojectUnifiedOdds(repo, eventId);

console.log(`\ncasas: ${r.casas.map((c) => (c.ok ? `${c.book} ✓(${c.n})` : `${c.book} ✗(${c.erro})`)).join(" · ") || "(nenhuma)"}`);
console.log(`linhas: ${r.n_por_casa} (por casa) → ${r.n_line_shop} após line shopping | rejeitadas: ${r.linhas_rejeitadas}`);
if (r.divergencias.length) {
  console.log(`⚠ divergências p/ REVISAR (${r.divergencias.length}):`);
  for (const d of r.divergencias.slice(0, 5)) console.log(`   ${d.entidade} ${d.market_type} ${d.linha}: ${d.spread_pp}pp`);
}
for (const l of r.linhas.slice(0, 12)) console.log(`   ${l.market_type} | ${l.entidade} | ${l.linha} | ${l.odd_over} (${l.book})`);

if (dry) console.log("\n--dry: nada gravado.");
else console.log(`\n✓ ${r.gravadas} linhas gravadas em odds (event_id=${eventId}). A análise manual já lê daqui.`);
