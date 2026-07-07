// Motor de ARBITRAGEM (surebet) — o coração do módulo "apostas imperdíveis". PURO, sem
// I/O: recebe o `odds` CRU (todas as casas) e devolve oportunidades onde a soma dos
// inversos dos MELHORES preços de cada lado fica abaixo de 1 (lucro travado, qualquer
// resultado). Diferente do resto do produto, aqui NÃO há modelo/probabilidade — é preço
// × preço entre casas. Ver docs/features/arbitragem-surebet/design.md.
//
// Honestidades embutidas:
// - stakes em REAIS INTEIROS e o lucro garantido é recalculado APÓS o arredondamento
//   (nunca prometer centavo que o arredondamento comeu); se o arredondamento comer o
//   lucro, a oportunidade degrada de "imperdivel" para "quase";
// - cada perna carrega `coletado_em` e a oportunidade expõe `defasagem_min` — odds
//   coletadas longe uma da outra podem ser arbitragem-fantasma (o preço já mexeu);
// - `vitoria` (1X2) só fecha em 3 VIAS (casa/empate/fora): sem o empate não há trava.

import { normalize } from "../crosswalk/match.js";

/** Linha do `odds` cru como o motor precisa (estrutural — não importa o store). */
export interface ArbOddsRow {
  event_id: string;
  entidade: string;
  market_type: string;
  linha: number;
  odd_over: number;
  odd_under?: number | null;
  odd_draw?: number | null;
  book: string;
  coletado_em?: string | null;
}

export type ArbLado = "over" | "under" | "casa" | "empate" | "fora";

export interface ArbLeg {
  lado: ArbLado;
  rotulo: string;              // leigo: "Mais de 2.5 gols"
  book: string;
  odd: number;
  stake: number;               // R$ inteiros; soma das pernas = total exato
  retorno: number;             // stake × odd (o que volta se ESTA perna ganhar)
  coletado_em: string | null;
}

export interface ArbOpportunity {
  event_id: string;
  entidade: string;            // "partida" ou nome do jogador (exibição)
  market_type: string;
  linha: number;
  tipo: "2vias" | "3vias";
  tier: "imperdivel" | "quase";
  soma_inversos: number;
  lucro_garantido: number;     // R$, PIOR cenário após arredondar (≤0 no tier quase)
  lucro_pct: number;           // sobre o total
  total: number;
  pernas: ArbLeg[];
  defasagem_min: number | null;
}

export interface FindArbsOpts {
  /** Banca a dividir entre as pernas (default R$200). */
  total?: number;
  /** Teto do tier "quase" (default 1.02 — soma de inversos até 2pp acima da trava). */
  quaseMax?: number;
}

/** Nome leigo da grandeza por market_type (para o rótulo "Mais de X ..."). */
const MARKET_NOUN: Record<string, string> = {
  gols: "gols",
  escanteios: "escanteios",
  sot: "chutes a gol",
  finalizacoes: "finalizações",
  desarmes: "desarmes",
  faltas: "faltas",
  passes: "passes",
};

function noun(market: string): string {
  return MARKET_NOUN[market] ?? market;
}

function legLabel(market: string, entidade: string, linha: number, lado: ArbLado): string {
  if (lado === "casa") return "Vitória do mandante";
  if (lado === "empate") return "Empate";
  if (lado === "fora") return "Vitória do visitante";
  const quem = entidade === "partida" ? "" : ` (${entidade})`;
  return `${lado === "over" ? "Mais" : "Menos"} de ${linha} ${noun(market)}${quem}`;
}

interface BestSide { odd: number; book: string; coletado_em: string | null }

/** Melhor preço de um lado entre as casas do grupo (maior odd = melhor p/ apostador). */
function best(rows: ArbOddsRow[], pick: (r: ArbOddsRow) => number | null | undefined): BestSide | null {
  let b: BestSide | null = null;
  for (const r of rows) {
    const odd = pick(r);
    if (odd == null || !(odd > 1)) continue;
    if (b == null || odd > b.odd) b = { odd, book: r.book, coletado_em: r.coletado_em ?? null };
  }
  return b;
}

/** Divide `total` entre as pernas em REAIS INTEIROS: proporcional a 1/odd, arredonda e
 * joga a sobra na maior perna → a soma bate o total EXATO, sempre. */
function splitStakes(odds: number[], total: number): number[] {
  const s = odds.reduce((acc, o) => acc + 1 / o, 0);
  const raw = odds.map((o) => (total * (1 / o)) / s);
  const stakes = raw.map((x) => Math.round(x));
  const diff = total - stakes.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    let iMax = 0;
    for (let i = 1; i < stakes.length; i++) if (stakes[i]! > stakes[iMax]!) iMax = i;
    stakes[iMax]! += diff;
  }
  return stakes;
}

function minutesBetween(stamps: (string | null)[]): number | null {
  const ms = stamps.filter((s): s is string => s != null).map((s) => Date.parse(s)).filter(Number.isFinite);
  if (ms.length < 2) return ms.length === 1 ? 0 : null;
  return Math.round((Math.max(...ms) - Math.min(...ms)) / 60000);
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

function buildOpportunity(
  grupo: ArbOddsRow[], sides: { lado: ArbLado; side: BestSide }[],
  total: number, quaseMax: number,
): ArbOpportunity | null {
  const soma = sides.reduce((acc, s) => acc + 1 / s.side.odd, 0);
  if (!(soma < quaseMax)) return null;
  const stakes = splitStakes(sides.map((s) => s.side.odd), total);
  const first = grupo[0]!;
  const pernas: ArbLeg[] = sides.map((s, i) => ({
    lado: s.lado,
    rotulo: legLabel(first.market_type, first.entidade, first.linha, s.lado),
    book: s.side.book,
    odd: s.side.odd,
    stake: stakes[i]!,
    retorno: Math.round(stakes[i]! * s.side.odd * 100) / 100,
    coletado_em: s.side.coletado_em,
  }));
  const lucro = Math.min(...pernas.map((p) => p.stake * p.odd)) - total;
  return {
    event_id: first.event_id,
    entidade: first.entidade,
    market_type: first.market_type,
    linha: first.linha,
    tipo: sides.length === 3 ? "3vias" : "2vias",
    // A trava de verdade é o lucro APÓS arredondar: soma<1 mas lucro≤0 = ainda "quase".
    tier: soma < 1 && lucro > 0 ? "imperdivel" : "quase",
    soma_inversos: soma,
    lucro_garantido: Math.round(lucro * 100) / 100,
    lucro_pct: round4((lucro / total) * 100),
    total,
    pernas,
    defasagem_min: minutesBetween(pernas.map((p) => p.coletado_em)),
  };
}

/** Varre o `odds` cru (1+ eventos, todas as casas) e devolve as oportunidades de
 * arbitragem, melhor primeiro (menor soma de inversos). */
export function findArbs(rows: ArbOddsRow[], opts: FindArbsOpts = {}): ArbOpportunity[] {
  const total = opts.total ?? 200;
  const quaseMax = opts.quaseMax ?? 1.02;

  const groups = new Map<string, ArbOddsRow[]>();
  for (const r of rows) {
    const k = `${r.event_id}|${normalize(r.entidade)}|${r.market_type}|${r.linha}`;
    const arr = groups.get(k);
    if (arr) arr.push(r); else groups.set(k, [r]);
  }

  const out: ArbOpportunity[] = [];
  for (const grupo of groups.values()) {
    const isVitoria = grupo[0]!.market_type === "vitoria";
    let opp: ArbOpportunity | null = null;
    if (isVitoria) {
      // 1X2 só fecha em 3 vias — sem o empate a trava não existe.
      const casa = best(grupo, (r) => r.odd_over);
      const fora = best(grupo, (r) => r.odd_under);
      const empate = best(grupo, (r) => r.odd_draw);
      if (casa && fora && empate) {
        opp = buildOpportunity(grupo, [
          { lado: "casa", side: casa }, { lado: "empate", side: empate }, { lado: "fora", side: fora },
        ], total, quaseMax);
      }
    } else {
      const over = best(grupo, (r) => r.odd_over);
      const under = best(grupo, (r) => r.odd_under);
      if (over && under) {
        opp = buildOpportunity(grupo, [
          { lado: "over", side: over }, { lado: "under", side: under },
        ], total, quaseMax);
      }
    }
    if (opp) out.push(opp);
  }
  return out.sort((a, b) => a.soma_inversos - b.soma_inversos);
}
