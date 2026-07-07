// Captura o HTML da página do evento Betano (mercados principais devem vir SSR) e tenta
// extrair o estado JSON embutido. Salva HTML + candidatos de estado no --out.
// Uso: npx tsx scripts/recon-betano-html.mts <slug/eventId> [--out <dir>]
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const slugId = process.argv[2];
if (!slugId) { console.error("uso: recon-betano-html.mts <slug/eventId>"); process.exit(1); }
const outDir = arg("--out") ?? join(process.cwd(), "recon-out");
mkdirSync(outDir, { recursive: true });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const browser = await chromium.launch({ headless: process.env.HEADFUL !== "1" });
const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo", userAgent: UA });
const page = await context.newPage();
await page.goto(`https://www.betano.bet.br/odds/${slugId}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(8000);

const html = await page.content();
writeFileSync(join(outDir, "betano-event-page.html"), html, "utf8");
console.log(`HTML: ${Math.round(html.length / 1024)} KB → betano-event-page.html`);
console.log(`contém "Resultado Final"? ${html.includes("Resultado Final")}`);

// Estado global comum: window.__* / dataLayer / INITIAL. Lista candidatos.
const globals = await page.evaluate(() => {
  const out: string[] = [];
  for (const k of Object.keys(window)) {
    if (/^__|INITIAL|STATE|store/i.test(k)) {
      try {
        const v = (window as any)[k];
        const s = JSON.stringify(v);
        if (s && s.length > 5000) out.push(`${k} (${Math.round(s.length / 1024)} KB)`);
      } catch { /* circular/não-serializável */ }
    }
  }
  return out;
});
console.log("globais grandes:", globals);
for (const g of globals) {
  const name = g.split(" ")[0]!;
  const v = await page.evaluate((k: string) => JSON.stringify((window as any)[k]), name);
  writeFileSync(join(outDir, `betano-global-${name.replace(/[^\w]/g, "_")}.json`), v!, "utf8");
  console.log(`salvo: betano-global-${name.replace(/[^\w]/g, "_")}.json`);
}
await browser.close();
