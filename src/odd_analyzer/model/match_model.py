"""Modelo de partida: Poisson bivariado com correção de Dixon-Coles para placares
baixos. score_matrix(lh, la) -> matriz P(i,j); probs_1x2 e prob_total_over derivam dela."""
import math

_MAX_GOLS = 10          # trunca a matriz (P de >10 gols é desprezível)
_RHO = -0.05            # correção Dixon-Coles (dependência em placares baixos; calibrar na Fase 4)

def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * lam ** k / math.factorial(k)

def _dc_tau(i: int, j: int, lh: float, la: float, rho: float) -> float:
    """Fator de correção Dixon-Coles para os 4 placares baixos (0-0,0-1,1-0,1-1)."""
    if i == 0 and j == 0:
        return 1.0 - lh * la * rho
    if i == 0 and j == 1:
        return 1.0 + lh * rho
    if i == 1 and j == 0:
        return 1.0 + la * rho
    if i == 1 and j == 1:
        return 1.0 - rho
    return 1.0

def score_matrix(lambda_home: float, lambda_away: float, rho: float = _RHO) -> list[list[float]]:
    """Matriz (MAX+1)x(MAX+1) de P(home=i, away=j), normalizada."""
    m = [[0.0] * (_MAX_GOLS + 1) for _ in range(_MAX_GOLS + 1)]
    total = 0.0
    for i in range(_MAX_GOLS + 1):
        for j in range(_MAX_GOLS + 1):
            p = (_poisson_pmf(i, lambda_home) * _poisson_pmf(j, lambda_away)
                 * _dc_tau(i, j, lambda_home, lambda_away, rho))
            p = max(p, 0.0)
            m[i][j] = p
            total += p
    if total > 0:
        for i in range(_MAX_GOLS + 1):
            for j in range(_MAX_GOLS + 1):
                m[i][j] /= total
    return m

def probs_1x2(matrix: list[list[float]]) -> dict:
    home = draw = away = 0.0
    for i, row in enumerate(matrix):
        for j, p in enumerate(row):
            if i > j: home += p
            elif i == j: draw += p
            else: away += p
    return {"home": home, "draw": draw, "away": away}

def prob_total_over(matrix: list[list[float]], linha: float) -> float:
    return sum(p for i, row in enumerate(matrix) for j, p in enumerate(row) if i + j > linha)
