// Parser PURO do formato REAL de /events/{id}/odds/ da BSD (mercado de PARTIDA).
// Formato (spike 2026-06-15): objeto PLANO, um conjunto de odds (sem quebra por casa):
//   { event_id, odds: { home_win, draw, away_win,
//                       over_15_goals, over_25_goals, over_35_goals,
//                       under_15_goals, under_25_goals, under_35_goals,
//                       btts_yes, btts_no } }   (valores null antes da casa precificar)
// Usado pra ligar a Fase 2 (CLV) do loop forward: de-vig + edge + odd de fechamento.
// NÃO toca o money-path de jogador (gate de paridade intacto). Função pura, sem I/O.
import { fairProbOver, devigThreeWay } from "../value/devig.js";

export type Outcome1x2 = "home" | "draw" | "away";

export interface ParsedMatchOdds {
  home_win: number | null;
  draw: number | null;
  away_win: number | null;
  // chave = linha como "1.5"/"2.5"/"3.5"
  totals: Record<string, { over: number | null; under: number | null }>;
}

const TOTAL_LINES = [1.5, 2.5, 3.5];
const keyOf = (l: number) => l.toFixed(1);

/** Odd decimal válida (> 1) ou null. Blinda contra null/0/string/NaN do payload. */
function odd(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 1.0 ? n : null;
}

const norm = (s: string) => String(s ?? "").toLowerCase();
export function isGols(mt: string): boolean {
  const m = norm(mt);
  return m === "gols" || m === "goals" || m === "goals_total" || m.startsWith("gol");
}
export function isVitoria(mt: string): boolean {
  const m = norm(mt);
  return m === "vitoria" || m === "vitória" || m === "resultado" || m === "1x2" || m === "match_winner" || m.startsWith("vit");
}

/** payload cru (flat) → estrutura normalizada. Tolera o payload já desembrulhado (sem `odds`). */
export function parseBsdMatchOdds(payload: any): ParsedMatchOdds {
  const o = payload?.odds ?? payload ?? {};
  const totals: Record<string, { over: number | null; under: number | null }> = {};
  for (const l of TOTAL_LINES) {
    const tag = String(Math.round(l * 10)); // 1.5→"15", 2.5→"25", 3.5→"35"
    totals[keyOf(l)] = { over: odd(o[`over_${tag}_goals`]), under: odd(o[`under_${tag}_goals`]) };
  }
  return { home_win: odd(o.home_win), draw: odd(o.draw), away_win: odd(o.away_win), totals };
}

/** A odd do LADO que o forward registra como "aposta": gols = over da linha; vitória =
 * o desfecho (mandante por padrão — é o que o forward loga). null se ausente. */
export function matchBetOdd(p: ParsedMatchOdds, marketType: string, linha: number, outcome: Outcome1x2 = "home"): number | null {
  if (isGols(marketType)) return p.totals[keyOf(linha)]?.over ?? null;
  if (isVitoria(marketType)) return outcome === "home" ? p.home_win : outcome === "draw" ? p.draw : p.away_win;
  return null;
}

/** Prob JUSTA (de-vig) do lado registrado. gols: 2-vias conservador (over/under);
 * vitória: 3-vias (mandante/empate/visitante). null se faltar algum lado. */
export function matchFairProb(p: ParsedMatchOdds, marketType: string, linha: number, outcome: Outcome1x2 = "home"): number | null {
  if (isGols(marketType)) {
    const t = p.totals[keyOf(linha)];
    if (!t || t.over == null || t.under == null) return null;
    return fairProbOver(t.over, t.under);
  }
  if (isVitoria(marketType)) {
    if (p.home_win == null || p.draw == null || p.away_win == null) return null;
    const [ph, pd, pa] = devigThreeWay(p.home_win, p.draw, p.away_win);
    return outcome === "home" ? ph : outcome === "draw" ? pd : pa;
  }
  return null;
}

/** Descobre o desfecho 1X2 a partir do nome registrado (`jogador`), que carrega o
 * sufixo do desfecho que o runMatch anexa: "(1)"=mandante, "(X)"=empate, "(2)"=visitante.
 * Sem sufixo → mandante (o forward só loga o mandante). */
export function outcomeFromJogador(jogador: unknown): Outcome1x2 {
  const s = String(jogador ?? "");
  if (s.includes("(X)")) return "draw";
  if (s.includes("(2)")) return "away";
  return "home";
}
