// Verificação de TELA da /imperdiveis (Playwright): abre a página, escolhe a liga,
// seta o dia, clica "re-escanear (sem coletar)" e tira screenshot do resultado.
// Uso: npx tsx scripts/verify-imperdiveis-ui.mts <dia YYYY-MM-DD> <screenshot.png>
import { chromium } from "playwright";

const dia = process.argv[2] ?? "2026-07-07";
const shot = process.argv[3] ?? "imperdiveis.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text()); });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("requestfailed", (r) => console.log("request FALHOU:", r.url(), r.failure()?.errorText));

await page.goto("http://localhost:5927/imperdiveis", { waitUntil: "networkidle", timeout: 60000 });
console.log("página aberta:", await page.title());

// escolhe a liga (filtra e clica). Se a lista não veio (fetch de ligas falhou no mount),
// recarrega uma vez — dev server recém-subido às vezes perde a primeira.
await page.getByPlaceholder("filtrar liga…").fill("world cup");
try {
  await page.getByRole("button", { name: "World Cup 2026" }).click({ timeout: 10000 });
} catch {
  console.log("liga não apareceu — recarregando a página e tentando de novo");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByPlaceholder("filtrar liga…").fill("world cup");
  await page.getByRole("button", { name: "World Cup 2026" }).click({ timeout: 20000 });
}
console.log("liga selecionada: World Cup 2026");

// seta o dia
await page.locator('input[type="date"]').fill(dia);

// re-scan (sem coletar — instantâneo, lê o banco)
await page.getByRole("button", { name: /re-escanear/ }).click();
await page.waitForSelector("text=oportunidades", { timeout: 30000 });
await page.waitForTimeout(1200);

const quase = await page.locator("text=quase").count();
const cards = await page.locator("text=faltou").count();
console.log(`painel de oportunidades visível; tags 'quase': ${quase}; cards com 'faltou X pp': ${cards}`);

await page.screenshot({ path: shot, fullPage: true });
console.log("screenshot:", shot);
await browser.close();
