"""Parâmetros do modelo de contagem, em UM lugar (evita drift entre o backtest e o
pipeline). Calibrados no backtest EPL 2023 (over-prediction corrigida)."""

NB_DISPERSION = 3.0      # r da Binomial Negativa (overdispersion)
PRIOR_RATE = 0.4         # SoT/90 do prior (baixo: maioria chuta pouco)
PRIOR_STRENGTH = 12      # peso do prior em "jogos equivalentes" (encolhe amostra pequena)
MIN_OTHER_MINUTES = 60   # mínimo de minutos leave-one-out p/ estimar a taxa
LINHAS = [0.5, 1.5]      # linhas over/under avaliadas no backtest
