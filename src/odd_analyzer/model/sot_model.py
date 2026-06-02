import math

def expected_lambda(sot_per90: float, expected_minutes: float) -> float:
    """Taxa esperada de SOT na partida = SoT/90 * minutos/90."""
    return sot_per90 * expected_minutes / 90.0

def _poisson_pmf(k: int, mu: float) -> float:
    return math.exp(-mu) * mu**k / math.factorial(k)

def _nbinom_pmf(k: int, r: float, mu: float) -> float:
    # NB2: media mu, dispersao r (>0). p = r/(r+mu).
    p = r / (r + mu)
    log = (math.lgamma(k + r) - math.lgamma(r) - math.lgamma(k + 1)
           + r * math.log(p) + k * math.log(1 - p))
    return math.exp(log)

def prob_at_least(mu: float, k: int, r: float | None = None) -> float:
    """P(X >= k). r=None -> Poisson; r>0 -> Binomial Negativa (overdispersion)."""
    if k <= 0:
        return 1.0
    if mu <= 0:
        # media 0 => X e sempre 0 (evita log(0) na NB e e correto p/ Poisson)
        return 0.0
    pmf = (lambda i: _poisson_pmf(i, mu)) if r is None else (lambda i: _nbinom_pmf(i, r, mu))
    cum = sum(pmf(i) for i in range(0, k))  # P(X <= k-1)
    return max(0.0, 1.0 - cum)

def prob_over_line(mu: float, line: float, r: float | None = None) -> float:
    """P de bater uma linha over/under. Ex.: over 1.5 == P(X >= 2)."""
    k = math.floor(line) + 1
    return prob_at_least(mu, k, r)
