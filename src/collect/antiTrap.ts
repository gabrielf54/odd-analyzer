// ANTI-ARMADILHA cross-casa (spec §5.4 / STATUS §3 frente C). Quando a MESMA aposta
// canônica (jogador+mercado+linha) diverge demais entre casas, é OU valor real OU bug
// de normalização (faltas cometidas vs sofridas, desarme tentativa vs ganho). NUNCA
// dispara aposta nem rejeição automática — só marca REVISÃO. Função PURA.
//
// v1 usa limiar ABSOLUTO em pontos percentuais (conservador). O refinamento (percentil
// por-mercado, sinais de posição) está documentado no STATUS §5 como follow-up forward.

import type { ManualOddsLine } from "../manual/schema.js";
import { normalize } from "../crosswalk/match.js";

export interface DivergenceFlag {
  entidade: string;
  market_type: string;
  linha: number;
  books: { book: string; impl: number }[]; // implícita crua (1/odd_over) por casa
  spread_pp: number;                         // (max−min) das implícitas, em pontos %
  motivo: string;
}

// Default conservador: gap ≥ 20pp = revisar. O caso Igor Thiago (27pp) cai aqui; o
// Paquetá saudável (~8pp) não. Calibrar com dado da Copa (STATUS §5).
const THRESHOLD_PP_DEFAULT = 20;

// Mesma identidade normalizada do line shopping: compara o MESMO jogador mesmo quando as
// casas escrevem o nome diferente ("Llorente, Marcos" vs "Marcos Llorente"). Sem isso, a
// divergência entre Superbet e KTO passava batida (grupos separados pelo formato do nome).
function groupKey(l: ManualOddsLine): string {
  return `${normalize(l.entidade)}|${l.market_type}|${l.linha}`;
}

/** Marca grupos (jogador+mercado+linha) cujas implícitas divergem ≥ thresholdPp entre
 * casas. Precisa de ≥2 casas no grupo. Retorna SÓ flags de revisão — o consumidor
 * decide (nunca aposta/rejeita sozinho). */
export function flagDivergences(lines: ManualOddsLine[], thresholdPp = THRESHOLD_PP_DEFAULT): DivergenceFlag[] {
  const groups = new Map<string, ManualOddsLine[]>();
  for (const l of lines) {
    const k = groupKey(l);
    const arr = groups.get(k);
    if (arr) arr.push(l); else groups.set(k, [l]);
  }
  const flags: DivergenceFlag[] = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const books = arr.map((l) => ({ book: l.book, impl: 1 / l.odd_over }));
    const impls = books.map((b) => b.impl);
    const spread = Math.max(...impls) - Math.min(...impls);
    const spread_pp = spread * 100;
    if (spread_pp < thresholdPp) continue;
    const a = arr[0]!;
    flags.push({
      entidade: a.entidade, market_type: a.market_type, linha: a.linha,
      books: books.sort((x, y) => y.impl - x.impl),
      spread_pp: Math.round(spread_pp * 10) / 10,
      motivo: `divergência de ${(Math.round(spread_pp * 10) / 10)}pp entre casas — REVISAR (valor real ou bug de normalização?)`,
    });
  }
  return flags;
}
