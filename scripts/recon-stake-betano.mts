// Recon dirigido (complemento do recon-match-markets): Stake /markets (nomes dos marketIds)
// e variações do endpoint da Betano p/ achar 1X2/totais (o req=s,stnf,... só trouxe jogador).
// Uso: npx tsx scripts/recon-stake-betano.mts <stakeEventId> <betanoSlugId> [--out <dir>]
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFetchers } from "../src/cli/fetchers.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const stakeId = process.argv[2];
const betanoId = process.argv[3];
if (!stakeId || !betanoId) {
  console.error("uso: recon-stake-betano.mts <stakeEventId> <betanoSlugId ex.: eua-belgica/88381023> [--out <dir>]");
  process.exit(1);
}
const outDir = arg("--out") ?? join(process.cwd(), "recon-out");
mkdirSync(outDir, { recursive: true });

const fetchers = await makeFetchers();
const get = fetchers.browser!;
try {
  const probes: [string, string][] = [
    ["betano-notoggle", `https://www.betano.bet.br/api/odds/${betanoId}/?bt=3&req=s,stnf,c,mb,mbl`],
    ["betano-togglefalse", `https://www.betano.bet.br/api/odds/${betanoId}/?bt=3&isPlayersToggle=false&req=s,stnf,c,mb,mbl`],
    ["betano-bt0", `https://www.betano.bet.br/api/odds/${betanoId}/?bt=0&isPlayersToggle=true&req=s,stnf,c,mb,mbl`],
  ];
  for (const [name, url] of probes) {
    try {
      const data = await get(url);
      const file = join(outDir, `recon-${name}.json`);
      writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
      console.log(`${name}: OK → ${file} (${Math.round(JSON.stringify(data).length / 1024)} KB)`);
    } catch (e: any) {
      console.log(`${name}: FALHOU — ${String(e?.message ?? e)}`);
    }
  }
} finally {
  await fetchers.close();
}
