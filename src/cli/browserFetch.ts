// Fetch via Chromium HEADLESS (Playwright) — p/ casas atrás do Cloudflare (Betnacional e,
// no futuro, Superbet/Betano), cujo endpoint público barra o fetch cru do Node (403
// "Attention Required": challenge JS + TLS fingerprint). Roda LOCAL no BR, DESLOGADO.
// Fica na camada CLI: o domínio `collect/` continua puro (recebe `get` por injeção).
//
// Como passa: navega até a própria URL da API (o Chromium resolve o challenge e ganha o
// cookie cf_clearance daquele domínio), depois refaz via fetch NO CONTEXTO DA PÁGINA
// (same-origin, cookie válido) → JSON limpo. headless por padrão; HEADFUL=1 se o Cloudflare
// endurecer (abre janela — só na máquina do dono).

import { chromium } from "playwright";

export interface BrowserGet {
  get: (url: string) => Promise<any>;
  close: () => Promise<void>;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function makeBrowserGet(): Promise<BrowserGet> {
  const browser = await chromium.launch({ headless: process.env.HEADFUL !== "1" });
  const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo", userAgent: UA });
  const page = await context.newPage();

  async function get(url: string): Promise<any> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      // 1. navega até a URL → Cloudflare resolve o challenge p/ esse domínio (seta cf_clearance).
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(attempt === 1 ? 3500 : 5000); // tempo do challenge JS resolver
      // 2. refaz via fetch no contexto da página (same-origin, cookie já válido) → JSON limpo.
      const res = await page.evaluate(async (u: string) => {
        try { const r = await fetch(u, { credentials: "include" }); return { status: r.status, body: await r.text() }; }
        catch (e) { return { status: -1, body: String(e) }; }
      }, url);
      if (res.status === 200) { try { return JSON.parse(res.body); } catch { /* corpo não-JSON → retenta */ } }
    }
    throw new Error(`browser get falhou (Cloudflare não liberou?): ${url}`);
  }

  return { get, close: async () => { await browser.close(); } };
}
