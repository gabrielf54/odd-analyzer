// Ratings de força de time tipo Elo (ataque/defesa) p/ o λ de partida. Atualização
// CRONOLÓGICA (causal — cada jogo só usa o passado, processado em ordem de data).
// SUBSTITUI a média-gols-crua, que reprovou na calibração de gols/1X2; os ratings
// VENCEM (exp 2026-06-12b, scripts/recalibrate-match-strength.mts: ECE 0.13→0.04,
// gols/1X2 viram candidatos a graduar nas 2 populações). Funções PURAS — sem I/O;
// o provider entrega o pool de jogos (leaguePool). NÃO toca o money-path de jogador
// (gate de paridade intacto): só o λ de partida muda.

export interface ChronoGame {
  /** ISO/comparável p/ ordenar; só a ordem importa. */
  date: string;
  home: string; away: string;
  homeScore: number; awayScore: number;
}
export interface TeamRating { att: number; def: number; games: number; }
export interface RatingsParams {
  /** média-gols/time da liga (base do λ). */ mu0: number;
  /** learning rate do update Elo. */ lr: number;
  /** limite |att|,|def| (evita blow-up). */ clamp: number;
  /** mando em LOG (clube>0; seleção=0 campo neutro). */ homeAdv: number;
  /** encolhimento bayesiano no λ: att/def_efetivo = rating × games/(games+shrinkK).
   * 0 = sem encolher (compat). >0 regride o rating de time com pouco histórico p/ o
   * neutro — evita que um time de poucos jogos (ex. seleção da OFC) com rating extremo
   * por adversário fraco vire favorito/placar absurdo no cruzamento (bug `Iran×NZ`). */
  shrinkK: number;
}

// Defaults calibrados no exp 2026-06-12b (NÃO tunados no eval — vencer com defaults
// = robusto). homeAdv default 0 (neutro); quem chama injeta o populacional. shrinkK
// default 0 (sem encolher) — quem chama injeta o valor populacional.
export const DEFAULT_RATINGS: RatingsParams = { mu0: 1.3, lr: 0.08, clamp: 0.6, homeAdv: 0.0, shrinkK: 0 };

/** Mando em log por população: clube tem vantagem de casa; seleção (Copa) é neutro. */
export function homeAdvFor(populacao: "selecao" | "clube"): number {
  return populacao === "selecao" ? 0.0 : 0.18;
}

/** Encolhimento (shrinkK) do rating por população. **Seleção:** o pool cross-competição
 * tem times de pouco histórico / confederação isolada (ex. NZ da OFC, 2 jogos) cujo rating
 * extremo por adversário fraco invertia o mismatch no cruzamento da Copa → encolhe p/ o
 * neutro (corrige o bug `Iran×NZ`, calibrado em scripts/sweep-shrink-selecao.mts).
 * **Clube:** o pool é a própria liga densa (todo time tem muitos jogos) → não precisa (0). */
export function ratingsShrinkFor(populacao: "selecao" | "clube"): number {
  return populacao === "selecao" ? SELECAO_SHRINK_K : 0;
}
/** k do encolhimento de seleção. CALIBRADO em scripts/sweep-shrink-selecao.mts (n=1006,
 * floor=1, leave-one-out): o fix PRINCIPAL é o floor=1 (usar o rating, não o fallback
 * média-crua que invertia o mismatch); o Elo de LR lento já regulariza time raso, então a
 * shrinkage é leve. k=3 melhora gols 1.5/2.5 (ECE 0.033→0.019/0.031) e segura o time raso
 * de rating inflado (2 vitórias 6×0), a custo pequeno na vitória (full BrierSkill mandante
 * +0.100→+0.072). k≥6 a varredura REPROVA (vitória cai mais, gols 3.5 fica negativo). */
export const SELECAO_SHRINK_K = 3;

/** Processa os jogos em ordem de DATA, atualizando att/def de cada time após observar
 * cada placar. Retorna o rating FINAL (mais atual) de cada time — o que prevê o
 * PRÓXIMO jogo (ainda não disputado). O mando entra no λ de treino e de predição. */
export function computeRatings(games: ChronoGame[], params: Partial<RatingsParams> = {}): Map<string, TeamRating> {
  const { mu0, lr, clamp, homeAdv } = { ...DEFAULT_RATINGS, ...params };
  const att = new Map<string, number>(), def = new Map<string, number>(), n = new Map<string, number>();
  const ga = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
  const cl = (x: number) => Math.max(-clamp, Math.min(clamp, x));
  const sorted = [...games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const g of sorted) {
    if (!g.home || !g.away || !Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) continue;
    const lh = mu0 * Math.exp(ga(att, g.home) + ga(def, g.away) + homeAdv);
    const la = mu0 * Math.exp(ga(att, g.away) + ga(def, g.home));
    const eH = (g.homeScore - lh) / mu0, eA = (g.awayScore - la) / mu0;
    att.set(g.home, cl(ga(att, g.home) + lr * eH)); def.set(g.away, cl(ga(def, g.away) + lr * eH));
    att.set(g.away, cl(ga(att, g.away) + lr * eA)); def.set(g.home, cl(ga(def, g.home) + lr * eA));
    n.set(g.home, ga(n, g.home) + 1); n.set(g.away, ga(n, g.away) + 1);
  }
  const out = new Map<string, TeamRating>();
  for (const k of new Set([...att.keys(), ...def.keys(), ...n.keys()])) {
    out.set(k, { att: ga(att, k), def: ga(def, k), games: ga(n, k) });
  }
  return out;
}

/** λ_home/λ_away a partir dos ratings (com mando no mandante). null se faltar rating.
 * Com shrinkK>0, encolhe att/def de cada time pelo seu próprio histórico (games) antes
 * do λ — time de pouco histórico regride p/ o neutro (mu0). */
export function lambdaFromRatings(
  ratings: Map<string, TeamRating>, homeId: string, awayId: string, params: Partial<RatingsParams> = {},
): { lambdaHome: number; lambdaAway: number } | null {
  const { mu0, homeAdv, shrinkK } = { ...DEFAULT_RATINGS, ...params };
  const rh = ratings.get(homeId), ra = ratings.get(awayId);
  if (!rh || !ra) return null;
  const sh = (r: TeamRating) => {
    const f = shrinkK > 0 ? r.games / (r.games + shrinkK) : 1;
    return { att: r.att * f, def: r.def * f };
  };
  const h = sh(rh), a = sh(ra);
  return {
    lambdaHome: mu0 * Math.exp(h.att + a.def + homeAdv),
    lambdaAway: mu0 * Math.exp(a.att + h.def),
  };
}

/** Ambos os times têm histórico suficiente p/ o rating ser confiável? Senão o
 * chamador cai pro baseline (média-crua) — fail-safe (igual à doutrina). */
export function ratingsEligible(ratings: Map<string, TeamRating>, homeId: string, awayId: string, minHist = 5): boolean {
  const rh = ratings.get(homeId), ra = ratings.get(awayId);
  return !!rh && !!ra && rh.games >= minHist && ra.games >= minHist;
}
