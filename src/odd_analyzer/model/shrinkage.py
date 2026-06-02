def shrink_rate(rate: float, apps: int, prior_rate: float, prior_strength: float) -> float:
    """Média ponderada entre a taxa do jogador (peso = nº de jogos) e o prior
    (peso = prior_strength). Com apps=0, retorna o prior."""
    return (apps * rate + prior_strength * prior_rate) / (apps + prior_strength)
