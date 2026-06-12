// Getter com cache EM DISCO p/ o BSDClient nos scripts de auditoria. O cache em
// memória do app (src/lib/cache.ts) é apagado a cada processo — aqui persistimos
// cada resposta de URL em scripts/.cache/ pra que coletas repetidas e sweeps de
// calibração não re-batam na API (custo $0, e rápido). Keyed por URL+params.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, "..", ".cache", "bsd");
mkdirSync(CACHE_DIR, { recursive: true });

function keyFor(url: string, params?: Record<string, unknown>): string {
  const entries = Object.entries(params ?? {})
    .map(([k, v]) => [k, String(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const qs = new URLSearchParams(entries).toString();
  return createHash("sha1").update(`${url}?${qs}`).digest("hex");
}

let hits = 0, misses = 0;

/** Getter injetável p/ `new BSDClient(key, { get: diskCachedGet(apiKey) })`. */
export function diskCachedGet(apiKey: string) {
  return async (url: string, params?: Record<string, unknown>): Promise<any> => {
    const file = join(CACHE_DIR, keyFor(url, params) + ".json");
    if (existsSync(file)) {
      hits++;
      try { return JSON.parse(readFileSync(file, "utf8")); } catch { /* re-fetch */ }
    }
    const qs = params
      ? "?" + new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
        ).toString()
      : "";
    const r = await fetch(url + qs, { headers: { Authorization: `Token ${apiKey}` } });
    if (!r.ok) throw new Error(`BSD ${r.status} ${url}`);
    const json = await r.json();
    misses++;
    try { writeFileSync(file, JSON.stringify(json)); } catch { /* cache best-effort */ }
    return json;
  };
}

export function cacheStats() { return { hits, misses }; }
