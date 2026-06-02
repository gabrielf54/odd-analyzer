"""Gera odds decimais sintéticas a partir de uma probabilidade 'verdadeira' + vig
injetado. Uso EXCLUSIVO em testes: prova que o de-vig inverte a injeção de margem,
sem rede/API. Cada injeção é o inverso exato de um método de de-vig em devig.py."""

def fair_odds(p_over: float) -> tuple[float, float]:
    """Odds decimais JUSTAS (sem vig) de um mercado 2-way com prob over = p_over."""
    if not 0.0 < p_over < 1.0:
        raise ValueError(f"p_over deve estar em (0,1), recebido {p_over}")
    return 1.0 / p_over, 1.0 / (1.0 - p_over)

def inject_vig_multiplicative(p_over: float, overround: float) -> tuple[float, float]:
    """Inverso de devig_multiplicative: escala as implícitas justas p/ somarem
    (1+overround) mantendo a razão. devig_multiplicative das odds devolvidas recupera
    p_over exatamente."""
    if not 0.0 < p_over < 1.0:
        raise ValueError(f"p_over deve estar em (0,1), recebido {p_over}")
    if overround < 0:
        raise ValueError("overround deve ser >= 0")
    qo = p_over * (1.0 + overround)         # implícita quotada do over
    qu = (1.0 - p_over) * (1.0 + overround) # implícita quotada do under
    return 1.0 / qo, 1.0 / qu

def inject_vig_power(p_over: float, k: float) -> tuple[float, float]:
    """Inverso de devig_power: implícita quotada q_i = p_i**(1/k). Como q_o**k + q_u**k
    = p_over + (1-p_over) = 1, devig_power recupera p_over. k>1 => overround>0."""
    if not 0.0 < p_over < 1.0:
        raise ValueError(f"p_over deve estar em (0,1), recebido {p_over}")
    if k <= 0:
        raise ValueError("k deve ser > 0")
    qo = p_over ** (1.0 / k)
    qu = (1.0 - p_over) ** (1.0 / k)
    return 1.0 / qo, 1.0 / qu
