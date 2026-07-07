// Sniffer da Betano: abre a PÁGINA do evento no Chromium headless e registra todas as
// chamadas /api/ que o site faz (URL + tamanho), salvando os JSON grandes. Objetivo:
// descobrir o endpoint dos mercados PRINCIPAIS (1X2/totais) — o /api/odds?req=s,stnf,...
// só devolve mercados de jogador/marcador.
// Uso: npx tsx scripts/recon-betano-sniff.mts <slug/eventId> [--out <dir>]
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const slugId = process.argv[2];
if (!slugId) { console.error("uso: recon-betano-sniff.mts <slug/eventId>"); process.exit(1); }
const outDir = arg("--out") ?? join(process.cwd(), "recon-out");
mkdirSync(outDir, { recursive: true });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const browser = await chromium.launch({ headless: process.env.HEADFUL !== "1" });
const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo", userAgent: UA });
const page = await context.newPage();

let n = 0;
page.on("response", async (res) => {
  const url = res.url();
  if (!/betano\.bet\.br\/api\//.test(url)) return;
  try {
    const body = await res.text();
    const kb = Math.round(body.length / 1024);
    console.log(`[${res.status()}] ${kb} KB  ${url}`);
    if (res.status() === 200 && body.length > 2000) {
      const file = join(outDir, `betano-sniff-${++n}.json`);
      writeFileSync(file, body, "utf8");
      writeFileSync(join(outDir, `betano-sniff-${n}.url.txt`), url, "utf8");
    }
  } catch { /* corpo já consumido/stream — ignora */ }
});

console.log(`abrindo página do evento: https://www.betano.bet.br/odds/${slugId}/`);
await page.goto(`https://www.betano.bet.br/odds/${slugId}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(15000);
await browser.close();
console.log(`\n${n} respostas JSON grandes salvas em ${outDir} (betano-sniff-*.json + .url.txt)`);
