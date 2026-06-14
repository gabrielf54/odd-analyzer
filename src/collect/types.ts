// Ports & Adapters da coleta automática (segue o padrão do repo: domínio não importa
// fetch/express/supabase). Ver docs/features/coleta-odds-automatica/STATUS.md.

import type { RawCollectedLine } from "./normalizer.js";

/** Contexto da coleta sob demanda: o jogo a buscar (id BSD + nomes p/ casar na casa). */
export interface CollectContext {
  event_id: string;
  home: string;
  away: string;
}

/** Resultado cru de UMA casa. `erro` presente = casa falhou (bloqueio/sem cobertura) →
 * "pula e avisa" (decisão #5): nunca trava a análise. */
export interface CollectResult {
  book: string;
  raws: RawCollectedLine[];
  erro?: string;
}

/** PORTA: um adapter por casa. Sabe o endpoint JSON + o formato cru daquela casa; HTTP
 * injetado (testável offline). NÃO normaliza (o OddsNormalizer puro faz isso depois). */
export interface OddsCollector {
  book: string;
  collect(ctx: CollectContext): Promise<CollectResult>;
}

export interface CasaStatus { book: string; ok: boolean; n: number; erro?: string; }
export interface CollectAllResult { raws: RawCollectedLine[]; casas: CasaStatus[]; }

/** Dispara as casas EM PARALELO e agrega. "Pula e avisa" (decisão #5): casa que lança
 * OU devolve `erro` é pulada (marca ok:false + motivo), nunca derruba as outras. Uma
 * casa nunca trava a análise. */
export async function collectAll(collectors: OddsCollector[], ctx: CollectContext): Promise<CollectAllResult> {
  const settled = await Promise.allSettled(collectors.map((c) => c.collect(ctx)));
  const raws: RawCollectedLine[] = [];
  const casas: CasaStatus[] = [];
  for (let i = 0; i < settled.length; i++) {
    const book = collectors[i]!.book;
    const s = settled[i]!;
    if (s.status === "rejected") {
      casas.push({ book, ok: false, n: 0, erro: String((s.reason as any)?.message ?? s.reason) });
      continue;
    }
    const res = s.value;
    if (res.erro != null) { casas.push({ book, ok: false, n: 0, erro: res.erro }); continue; }
    raws.push(...res.raws);
    casas.push({ book, ok: true, n: res.raws.length });
  }
  return { raws, casas };
}
