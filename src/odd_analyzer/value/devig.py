"""De-vig de mercado over/under 2-way: remove a margem da casa e devolve
probabilidades 'justas' (somam 1). Dois métodos: multiplicativo (base) e
power method (Clarke & Kovalchik 2017, checagem). Tudo em stdlib."""

def implied_prob(odd: float) -> float:
    """Probabilidade implícita de uma odd decimal. Odd deve ser > 1."""
    if odd <= 1.0:
        raise ValueError(f"odd decimal deve ser > 1.0, recebido {odd}")
    return 1.0 / odd

def devig_multiplicative(odd_over: float, odd_under: float) -> tuple[float, float]:
    """Normalização proporcional: p_i = implícita_i / soma_implícitas."""
    io, iu = implied_prob(odd_over), implied_prob(odd_under)
    s = io + iu
    return io / s, iu / s

def devig_power(odd_over: float, odd_under: float) -> tuple[float, float]:
    """Acha k tal que io**k + iu**k = 1 (bisseção); p_i = implícita_i**k."""
    io, iu = implied_prob(odd_over), implied_prob(odd_under)
    lo, hi = 0.1, 20.0
    for _ in range(100):  # bisseção; 100 iterações = precisão folgada
        k = (lo + hi) / 2
        f = io**k + iu**k - 1.0
        if abs(f) < 1e-12:
            break
        # f decresce com k (io,iu < 1) -> se f>0, k precisa subir
        if f > 0:
            lo = k
        else:
            hi = k
    return io**k, iu**k

def fair_prob_over(odd_over: float, odd_under: float) -> float:
    """Prob justa do lado OVER, conservadora: a MAIOR entre os dois métodos
    (não superestima o edge)."""
    po_m, _ = devig_multiplicative(odd_over, odd_under)
    po_p, _ = devig_power(odd_over, odd_under)
    return max(po_m, po_p)
