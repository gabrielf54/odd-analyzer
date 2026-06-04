// Parâmetros do modelo de contagem, em UM lugar. Calibrados no backtest EPL 2023.
export const NB_DISPERSION = 3.0; // r da Binomial Negativa
export const PRIOR_RATE = 0.4; // SoT/90 do prior
export const PRIOR_STRENGTH = 12; // peso do prior em "jogos equivalentes"
export const MIN_OTHER_MINUTES = 60; // mínimo de minutos leave-one-out
export const LINHAS = [0.5, 1.5]; // linhas over/under no backtest
