// Parâmetros do modelo de contagem, em UM lugar. Calibrados no backtest EPL 2023.
export const NB_DISPERSION = 3.0; // r da Binomial Negativa
export const PRIOR_RATE = 0.4; // SoT/90 do prior
export const PRIOR_STRENGTH = 12; // peso do prior em "jogos equivalentes"
export const MIN_OTHER_MINUTES = 60; // mínimo de minutos leave-one-out
export const LINHAS = [0.5, 1.5]; // linhas over/under no backtest

// Participação típica de cada posição (D/M/F) no total concedido pelo
// adversário, por mercado. Medido pelo scripts/measure-positional-baseline.mts
// em 120 jogos de seleção (ligas 31/58/59/60/61/62/64/65/66/67), 2026-06-10.
export const POSITIONAL_SHARE_NACIONAL: Record<string, Record<string, number>> = {
  total_tackle: { D: 0.410, M: 0.491, F: 0.099 },
  shots_on_target: { D: 0.143, M: 0.467, F: 0.390 },
  total_shots: { D: 0.174, M: 0.478, F: 0.347 },
};
// Liga por padrão SÓ depois do mini-backtest (scripts/backtest-tilt.mts) não degradar Brier/ECE.
export const POSITIONAL_TILT_ENABLED = false;
export const POSITIONAL_MIN_GAMES = 5; // jogos do adversário com player-stats
