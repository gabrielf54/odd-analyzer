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
  // GATE de aposta de valor: só mercado com calibração VALIDADA pode ser
  // sinalizado como "aposta de valor que vale a pena" (rank dá a estrela).
  // Política (CLAUDE.md): começa false; cada mercado vira true conforme a
  // calibração/prova-forward o demonstrar. Hoje: sot/finalizações true; desarmes/
  // gols/vitória/escanteios false (em validação). rank só recomenda mercado validado.
  validated: boolean;
}

function spec(p: Omit<MarketSpec, "concede_baseline" | "concede_baseline_nacional" | "validated"> &
  { concede_baseline?: number; concede_baseline_nacional?: number; validated?: boolean }): MarketSpec {
  return { concede_baseline: 0.0, concede_baseline_nacional: 0.0, validated: false, ...p };
}

/** Mercado validado (calibração provada) → pode ser sinalizado como aposta de valor? Default false. */
export function isValidated(marketType: string): boolean {
  return MARKETS[marketType]?.validated ?? false;
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
    concede_baseline: 4.55, concede_baseline_nacional: 4.28, validated: true,
  }),
  finalizacoes: spec({
    key: "finalizacoes", nivel: "jogador", kind: "contagem", stat_field: "total_shots",
    prior_rate: 1.2, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "finalizacoes_concedidas_por_jogo", label: "Finalizações Totais",
    concede_baseline: 13.46, concede_baseline_nacional: 12.22, validated: true,
  }),
  // DESARME EM VALIDAÇÃO (2026-06-11): a casa liquida won_tackle (Opta "Tackles
  // Won"), mas o motor só tem skill em total_tackle (tentativas). won_tackle
  // reprovou a calibração na seleção (scripts/recalibrate-desarmes-won.mts, n=1738,
  // 10 ligas): BrierSkill won≈ +0.05/−0.02/−0.07 (over 0.5/1.5/2.5) e ECE sempre
  // pior que total (+0.14/+0.08/+0.01). Modelo segue total_tackle (calibrado);
  // settle_field liquida won_tackle pra MEDIR forward. validated=false (não vira
  // aposta de valor recomendada) até a prova forward demonstrar o contrário.
  desarmes: spec({
    key: "desarmes", nivel: "jogador", kind: "contagem", stat_field: "total_tackle",
    prior_rate: 1.3, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "desarmes_concedidos_por_jogo", label: "Desarmes",
    settle_field: "won_tackle", validated: false,
    concede_baseline: 14.64, concede_baseline_nacional: 13.97,
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
