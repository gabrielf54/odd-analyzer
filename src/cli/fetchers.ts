// Fábrica dos FETCHERS (fetch puro + navegador headless) — a camada que toca a internet.
// Fica FORA de collect/ (que é puro): collect recebe os fetchers por injeção. Usada pelo
// CLI e, via import DINÂMICO, pelo endpoint HTTP (assim o Playwright só carrega quando a
// coleta roda de fato, não no boot do server nem nos testes que importam app/service).

import { makeBrowserGet, type BrowserGet } from "./browserFetch.js";
import { HOUSES } from "../collect/houses.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const COMMON_HEADERS: Record<string, string> = {
  "User-Agent": UA, Accept: "application/json, text/plain, */*", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

/** GET público (deslogado) p/ casas SEM Cloudflare (KTO/CDN Kambi). Backoff no rate-limit
 * Varnish (410) / 429. Casas com Cloudflare vão pelo headless (browser). */
export async function publicGet(url: string, headers: Record<string, string> = COMMON_HEADERS): Promise<any> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status === 410 || r.status === 429) { await sleep(700 * attempt); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error(`rate-limited (410/429) após 4 tentativas: ${url}`);
}

export interface FetchersHandle {
  plain: (url: string) => Promise<any>;
  browser?: (url: string) => Promise<any>;
  close: () => Promise<void>;
}

/** Monta os fetchers. Abre o Chromium headless SÓ se alguma casa do registry precisa
 * (needsBrowser). Lembre de chamar `close()` no fim (fecha o navegador). */
export async function makeFetchers(): Promise<FetchersHandle> {
  let browser: BrowserGet | null = null;
  if (HOUSES.some((h) => h.needsBrowser)) browser = await makeBrowserGet();
  return {
    plain: publicGet,
    browser: browser?.get,
    close: async () => { if (browser) await browser.close(); },
  };
}
