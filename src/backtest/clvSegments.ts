// CLV DERIVADO do histórico imutável (odds_snapshots), segmentado pela ESCALAÇÃO.
// Função PURA — sem I/O. O maior evento de informação do dia é a escalação oficial
// (sai ~1h antes); as odds saltam quando ela confirma quem joga. Aqui o movimento da
// linha é partido em: entrada→escalação (pré), salto da escalação, escalação→fechamento
// (pós), e total (entrada→fechamento). CLV de preço = odd_a/odd_b − 1 (positivo = a odd
// caiu depois = peguei preço melhor antes).

export interface ClvSnap {
  coletado_em: string;     // ISO (compara lexicograficamente = cronologicamente)
  lineup_status: string;   // 'predicted' | 'confirmed' | 'unknown'
  odd_over: number;
}

export interface ClvMarcos {
  entrada_em: string | null;
  escalacao_em: string | null; // quando a escalação confirmou (1º retrato 'confirmed')
  kickoff: string;
  entrada_odd: number | null;
  fechamento_odd: number | null;
}

export interface ClvSegments {
  pre_escalacao: number | null;
  salto_escalacao: number | null; // o sinal-chave p/ a recomendação de timing
  pos_escalacao: number | null;
  total: number | null;
  marcos: ClvMarcos;
}

import { bootstrapMetricCI } from "./validation.js";

const clvOf = (a: number, b: number) => a / b - 1;

export interface LineupEdge {
  media: number;
  lo: number;
  hi: number;
  n: number;
}

/** Vantagem média do modelo NO SALTO da escalação (média dos `salto_escalacao` das apostas
 * com transição completa), com IC 95% por bootstrap. >0 = a linha encurta a favor de quem
 * apostou ANTES da escalação. IC longe de zero = sinal real (não ruído de amostra pequena). */
export function lineupEdge(saltos: number[], opts: { rng?: () => number } = {}): LineupEdge {
  if (!saltos.length) return { media: 0, lo: 0, hi: 0, n: 0 };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ci = bootstrapMetricCI(saltos, saltos, (p) => mean(p), { resamples: 1000, rng: opts.rng });
  return { media: ci.point, lo: ci.lo, hi: ci.hi, n: saltos.length };
}

/** Recomendação de TIMING: aposta ainda PRÉ-escalação + vantagem do modelo no salto com IC
 * estritamente acima de zero → "apostar_pre" (pegar o preço melhor antes da info). Senão
 * "sem_sinal" (já passou a escalação, ou amostra não prova vantagem). */
export function recommendTiming(preLineup: boolean, edge: LineupEdge): "apostar_pre" | "sem_sinal" {
  return preLineup && edge.lo > 0 ? "apostar_pre" : "sem_sinal";
}

/** Calcula os segmentos de CLV de UMA aposta (retratos já filtrados p/ a mesma linha).
 * `entryTime` = momento em que o modelo flagou (criado_em da aposta). `kickoff` = início
 * do jogo (BSD). Marcos faltando → segmento `null`. */
export function computeClvSegments(snaps: ClvSnap[], entryTime: string, kickoff: string): ClvSegments {
  const marcosVazio: ClvMarcos = { entrada_em: null, escalacao_em: null, kickoff, entrada_odd: null, fechamento_odd: null };
  if (!snaps.length) {
    return { pre_escalacao: null, salto_escalacao: null, pos_escalacao: null, total: null, marcos: marcosVazio };
  }
  const ordered = [...snaps].sort((x, y) => x.coletado_em.localeCompare(y.coletado_em));
  const rev = [...ordered].reverse();

  // entrada = último retrato em/antes de entryTime (a odd que o modelo viu); senão o 1º.
  const entry = rev.find((s) => s.coletado_em <= entryTime) ?? ordered[0]!;
  // fechamento = último retrato ANTES do apito.
  const closing = rev.find((s) => s.coletado_em < kickoff) ?? null;
  // fronteira da escalação: 1º 'confirmed' e o retrato imediatamente anterior (último pré).
  const idxConf = ordered.findIndex((s) => s.lineup_status === "confirmed");
  const primeiroPos = idxConf >= 0 ? ordered[idxConf]! : null;
  const ultimoPre = idxConf > 0 ? ordered[idxConf - 1]! : null;

  const pre = (ultimoPre && entry.coletado_em <= ultimoPre.coletado_em)
    ? clvOf(entry.odd_over, ultimoPre.odd_over) : null;
  const salto = (ultimoPre && primeiroPos) ? clvOf(ultimoPre.odd_over, primeiroPos.odd_over) : null;
  const pos = (primeiroPos && closing) ? clvOf(primeiroPos.odd_over, closing.odd_over) : null;
  const total = closing ? clvOf(entry.odd_over, closing.odd_over) : null;

  return {
    pre_escalacao: pre, salto_escalacao: salto, pos_escalacao: pos, total,
    marcos: {
      entrada_em: entry.coletado_em,
      escalacao_em: primeiroPos?.coletado_em ?? null,
      kickoff,
      entrada_odd: entry.odd_over,
      fechamento_odd: closing?.odd_over ?? null,
    },
  };
}
