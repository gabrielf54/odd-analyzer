// Orquestração de coleta de ponta a ponta, COMPARTILHADA pelo CLI e pelo endpoint HTTP:
//   buildCollectors (registry + crosswalk) → collectOdds (normaliza/line-shop/divergência)
//   → grava no `odds`. PURO: `repo` e `fetchers` injetados (sem fetch/Playwright aqui), o
//   que mantém collect/ testável offline. O caller (CLI/endpoint) monta os fetchers.

import { buildCollectors, type Fetchers, type HouseDef } from "./houses.js";
import { collectOdds } from "./pipeline.js";
import type { CollectContext } from "./types.js";

export interface RunCollectionOpts {
  /** book → id da casa explícito (pula o crosswalk daquela casa). */
  overrides?: Record<string, string>;
  /** true = não grava (só calcula/retorna). */
  dry?: boolean;
  /** timestamp da coleta (injetável p/ teste); default = agora. */
  coletadoEm?: string;
  /** registry de casas (injetável p/ teste); default = HOUSES real. */
  houses?: HouseDef[];
  log?: (msg: string) => void;
  /** Agendador: marca o snapshot resultante com o marco (base/deriva/salto/fechamento). */
  snapshotMark?: string;
  /** Origem do snapshot: 'manual' (botão, default) | 'scheduler' (agendador 24h). */
  snapshotOrigem?: string;
}

export interface RunCollectionResult {
  jogo: string;
  casas: { book: string; ok: boolean; n: number; erro?: string }[];
  // Casas PULADAS antes de virar collector (crosswalk não achou o jogo, lista falhou/403,
  // headless ausente). NÃO aparecem em `casas` — sem isto, a casa some do resultado sem
  // rastro (foi o que escondeu o betano). Observabilidade: o motivo vai no próprio response.
  puladas: { book: string; motivo: string }[];
  n_por_casa: number;      // linhas coletadas (todas as casas)
  n_line_shop: number;     // linhas após o melhor-preço
  linhas: any[];           // vencedoras do line shopping (p/ exibir)
  divergencias: any[];     // revisão cross-casa
  linhas_rejeitadas: number;
  gravadas: number;        // 0 em --dry ou sem coleta
}

/** Extrai as casas puladas das linhas de log do buildCollectors. As mensagens de skip têm o
 * formato "<book>: <motivo> — pulando[...]" (ver houses.ts). Decoplado: não precisa conhecer
 * a lista de casas, só lê o que o buildCollectors avisou. */
function parsePuladas(logs: string[]): { book: string; motivo: string }[] {
  const out: { book: string; motivo: string }[] = [];
  for (const l of logs) {
    if (!/\bpuland/i.test(l)) continue;          // só linhas de skip
    const i = l.indexOf(": ");
    if (i <= 0) continue;
    out.push({ book: l.slice(0, i).trim(), motivo: l.slice(i + 2).trim() });
  }
  return out;
}

/** Coleta as odds de um jogo (já com home/away resolvidos) nas casas do registry e grava. */
export async function runCollection(
  ev: { id: string; jogo?: string; home: string; away: string },
  repo: any,
  fetchers: Fetchers,
  opts: RunCollectionOpts = {},
): Promise<RunCollectionResult> {
  // Captura as linhas de log do buildCollectors (motivos de skip) p/ devolver no response,
  // sem perder o log externo do caller (CLI imprime no console).
  const logs: string[] = [];
  const log = (m: string) => { logs.push(m); opts.log?.(m); };
  const ctx: CollectContext = { event_id: ev.id, home: ev.home, away: ev.away };
  const jogo = ev.jogo ?? ev.id;

  const collectors = await buildCollectors(ctx, fetchers, { overrides: opts.overrides, houses: opts.houses, log });
  const puladas = parsePuladas(logs);
  if (collectors.length === 0) {
    return { jogo, casas: [], puladas, n_por_casa: 0, n_line_shop: 0, linhas: [], divergencias: [], linhas_rejeitadas: 0, gravadas: 0 };
  }

  const res = await collectOdds(collectors, ctx);

  let gravadas = 0;
  if (!opts.dry && res.linhas_por_casa.length) {
    const coletadoEm = opts.coletadoEm ?? new Date().toISOString();
    const rows = res.linhas_por_casa.map((l) => ({
      event_id: ev.id, entidade: l.entidade, market_type: l.market_type, linha: l.linha,
      odd_over: l.odd_over, odd_under: l.odd_under, odd_draw: l.odd_draw ?? null,
      book: l.book, coletado_em: coletadoEm,
    }));
    await repo.saveOdds(ev.id, rows);
    gravadas = rows.length;
  }

  return {
    jogo, casas: res.casas, puladas,
    n_por_casa: res.linhas_por_casa.length, n_line_shop: res.linhas.length,
    linhas: res.linhas, divergencias: res.divergencias,
    linhas_rejeitadas: res.linhas_rejeitadas.length, gravadas,
  };
}
