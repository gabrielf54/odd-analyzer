// RECON de mercados de PARTIDA (base do módulo de arbitragem): baixa o payload CRU de
// cada casa do registry p/ UM jogo real e salva o JSON inteiro em disco. Daí saem os
// ids/rótulos EXATOS (gols over/under, 1X2, escanteios, lado under de props) pro de-para
// fail-closed + fixtures de teste. NÃO grava nada no banco — é só captura.
//
// Uso:
//   npx tsx scripts/recon-match-markets.mts                  (acha o próximo jogo da Copa, liga 27)
//   npx tsx scripts/recon-match-markets.mts <event_id_BSD>   (jogo explícito)
//   ... [--out <dir>]                                        (default: ./recon-out)
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { normalizeEvent } from "../src/runner.js";
import { listMatches } from "../src/service.js";
import { HOUSES } from "../src/collect/houses.js";
import { matchEventByName } from "../src/collect/matchEvent.js";
import { makeFetchers } from "../src/cli/fetchers.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outDir = arg("--out") ?? join(process.cwd(), "recon-out");
mkdirSync(outDir, { recursive: true });

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

let eventId = process.argv[2] && !process.argv[2]!.startsWith("--") ? process.argv[2]! : undefined;
if (!eventId) {
  const jogos = await listMatches(client, "27", "notstarted");
  if (!jogos.length) {
    console.error("nenhum jogo pré-jogo na liga 27 (Copa). Passe um event_id explícito.");
    process.exit(1);
  }
  console.log("próximos jogos da Copa:");
  for (const j of jogos.slice(0, 6)) console.log(`  ${j.id}  ${j.data}  ${j.mandante} x ${j.visitante}`);
  eventId = String(jogos[0]!.id);
}

const ev = normalizeEvent(await client.getEvent(eventId));
const home = ev.home_team?.name ?? "", away = ev.away_team?.name ?? "";
console.log(`\nalvo: BSD ${eventId} — ${home} x ${away}`);

const fetchers = await makeFetchers();
try {
  for (const h of HOUSES) {
    const get = h.needsBrowser ? fetchers.browser : fetchers.plain;
    if (!get) { console.log(`${h.book}: sem fetcher headless — pulando`); continue; }
    try {
      const list = h.parseList(await get(h.listUrl()));
      const m = matchEventByName(list, home, away);
      if (!m) {
        const amostra = list.slice(0, 5).map((e) => `${e.home} x ${e.away}`).join(" | ");
        console.log(`${h.book}: jogo não achado (${list.length} na lista). amostra: [${amostra}]`);
        continue;
      }
      const raw = await get(h.oddsUrl(m.id));
      const file = join(outDir, `recon-${h.book}.json`);
      writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");
      const bytes = JSON.stringify(raw).length;
      console.log(`${h.book}: id ${m.id} → ${file} (${Math.round(bytes / 1024)} KB)`);
    } catch (e: any) {
      console.log(`${h.book}: FALHOU — ${String(e?.message ?? e)}`);
    }
  }
} finally {
  await fetchers.close();
}
console.log("\nrecon concluído. Inspecionar os JSON p/ extrair ids/rótulos de partida + lado under.");
