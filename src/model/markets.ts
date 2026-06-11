export interface MarketSpec {
  key: string;
  nivel: "jogador" | "partida";
  kind: "contagem" | "partida_totais" | "partida_1x2";
  stat_field: string;
  prior_rate: number;
  prior_strength: number;
  nb_dispersion: number;
  lines: number[];
  eixo_concessao: string;
  label: string;
  concede_baseline: number;
  concede_baseline_nacional: number;
  // Campo que a CASA usa pra LIQUIDAR (settle). Default = stat_field. Difere
  // quando modelamos uma coisa e a casa paga outra (desarmes: modelamos
  // total_tackle, mas a casa liquida won_tackle — Opta "Tackles Won").
  settle_field?: string;
  // GATE de dinheiro real: só mercados VALIDADOS (calibração presta) viram true.
  // Política (CLAUDE.md): começa false; cada mercado vira true conforme a
  // calibração/CLV-forward o prova. Hoje: sot/finalizações true; desarmes/gols/
  // vitória/escanteios false (validação). rank só dá a estrela a money_ready.
  money_ready: boolean;
}

function spec(p: Omit<MarketSpec, "concede_baseline" | "concede_baseline_nacional" | "money_ready"> &
  { concede_baseline?: number; concede_baseline_nacional?: number; money_ready?: boolean }): MarketSpec {
  return { concede_baseline: 0.0, concede_baseline_nacional: 0.0, money_ready: false, ...p };
}

/** Mercado liberado pra dinheiro real (calibração validada)? Default false. */
export function isMoneyReady(marketType: string): boolean {
  return MARKETS[marketType]?.money_ready ?? false;
}

/** Campo que a casa usa para liquidar a aposta (default = stat_field). */
export function settleField(marketType: string): string | null {
  const m = MARKETS[marketType];
  return m ? (m.settle_field ?? m.stat_field) : null;
}

export const MARKETS: Record<string, MarketSpec> = {
  sot: spec({
    key: "sot", nivel: "jogador", kind: "contagem", stat_field: "shots_on_target",
    prior_rate: 0.4, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "chutes_a_gol_concedidos_por_jogo", label: "Chutes a Gol (SOT)",
    concede_baseline: 4.55, concede_baseline_nacional: 4.28, money_ready: true,
  }),
  finalizacoes: spec({
    key: "finalizacoes", nivel: "jogador", kind: "contagem", stat_field: "total_shots",
    prior_rate: 1.2, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "finalizacoes_concedidas_por_jogo", label: "Finalizações Totais",
    concede_baseline: 13.46, concede_baseline_nacional: 12.22, money_ready: true,
  }),
  // DESARME SELADO (2026-06-11): a casa liquida won_tackle (Opta "Tackles Won"),
  // mas o motor só tem skill em total_tackle (tentativas). won_tackle reprovou a
  // calibração na seleção (scripts/recalibrate-desarmes-won.mts, n=1738, 10 ligas):
  // BrierSkill won≈ +0.05/−0.02/−0.07 (over 0.5/1.5/2.5) e ECE sempre pior que
  // total (+0.14/+0.08/+0.01). Modelo segue total_tackle (calibrado); settle_field
  // liquida won_tackle pra MEDIR forward. money_ready=false até a prova forward virar.
  desarmes: spec({
    key: "desarmes", nivel: "jogador", kind: "contagem", stat_field: "total_tackle",
    prior_rate: 1.3, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "desarmes_concedidos_por_jogo", label: "Desarmes",
    concede_baseline: 14.64, concede_baseline_nacional: 13.97,
    settle_field: "won_tackle", money_ready: false,
  }),
  escanteios: spec({
    key: "escanteios", nivel: "partida", kind: "contagem", stat_field: "corners",
    prior_rate: 5.0, prior_strength: 10.0, nb_dispersion: 3.0, lines: [8.5, 9.5, 10.5],
    eixo_concessao: "escanteios_concedidos_por_jogo", label: "Escanteios (Total)",
    concede_baseline: 4.79,
  }),
  gols: spec({
    key: "gols", nivel: "partida", kind: "partida_totais", stat_field: "goals",
    prior_rate: 1.3, prior_strength: 10.0, nb_dispersion: 3.0, lines: [1.5, 2.5, 3.5],
    eixo_concessao: "gols_concedidos_por_jogo", label: "Gols (Total)",
    concede_baseline: 1.3,
  }),
  vitoria: spec({
    key: "vitoria", nivel: "partida", kind: "partida_1x2", stat_field: "goals",
    prior_rate: 1.3, prior_strength: 10.0, nb_dispersion: 3.0, lines: [1.5, 2.5, 3.5],
    eixo_concessao: "gols_concedidos_por_jogo", label: "Resultado (1X2)",
    concede_baseline: 1.3,
  }),
};

// Ligas de seleção (Copa e correlatas) → baseline nacional. WC2026 = 27.
const NATIONAL_LEAGUE_IDS = new Set([58, 59, 60, 61, 62, 64, 65, 66, 67, 31, 27]);

/** Escolhe o concede_baseline certo pela liga: seleção → nacional; senão → clube. */
export function baselineFor(market: MarketSpec, leagueId: unknown): number {
  const lid = typeof leagueId === "number" ? leagueId : parseInt(String(leagueId), 10);
  if (Number.isNaN(lid)) return market.concede_baseline;
  if (NATIONAL_LEAGUE_IDS.has(lid)) return market.concede_baseline_nacional || market.concede_baseline;
  return market.concede_baseline;
}
