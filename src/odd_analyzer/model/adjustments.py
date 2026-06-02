"""Ajustes contextuais aplicados ao lambda esperado de SOT.

Ambos os fatores são multiplicadores neutros em torno de 1.0: melhoram a
DISCRIMINAÇÃO do modelo (separam jogos fáceis/difíceis) sem mexer no nível médio.
"""

def opponent_multiplier(opp_conceded_per_game: float, league_avg_conceded: float) -> float:
    """Ajuste pela defesa do adversário. >1 = defesa vazada (concede mais SOT que
    a média da liga) → mais SOT esperado; <1 = defesa sólida. Neutro (1.0) se a
    média da liga não for positiva (sem dado)."""
    if league_avg_conceded <= 0:
        return 1.0
    return opp_conceded_per_game / league_avg_conceded

def home_away_multiplier(is_home: bool, home_factor: float, away_factor: float) -> float:
    """Ajuste de mando: times em casa tendem a gerar mais SOT. home_factor e
    away_factor são normalizados em torno de 1 (ex.: 1.10 e 0.90)."""
    return home_factor if is_home else away_factor
