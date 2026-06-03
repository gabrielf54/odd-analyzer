"""Monta mu para mercados de contagem: taxa janelada + shrinkage + multiplicadores.
Compõe as funções genéricas existentes (expected_lambda, opponent_multiplier,
home_away_multiplier) sem adicionar nova matemática."""

from odd_analyzer.model.sot_model import expected_lambda


def windowed_rate(
    games: list[dict],
    stat_field: str,
    windows: tuple = (3, 5, 10),
    mando: str | None = None,
) -> dict:
    """Taxa média do stat_field nas últimas N partidas (janelas 3/5/10).

    Args:
        games: lista de dicts com pelo menos {stat_field, mando} em ordem cronológica.
        stat_field: chave do dict a somar (e.g. "corners", "shots_on_target").
        windows: tupla de tamanhos de janela a calcular.
        mando: se "home" ou "away", filtra apenas partidas nesse mando antes de janelas.

    Returns:
        dict {f"w{n}": float | None} — None quando não há jogos disponíveis.
    """
    source = games
    if mando is not None:
        source = [g for g in games if g.get("mando") == mando]

    result: dict = {}
    for n in windows:
        window = source[-n:] if len(source) >= 1 else []
        if not window:
            result[f"w{n}"] = None
        else:
            vals = [g[stat_field] for g in window]
            result[f"w{n}"] = sum(vals) / len(vals)
    return result


def assemble_mu(
    rate_per90: float,
    minutos_esperados: float,
    opp_mult: float,
    ha_mult: float,
) -> float:
    """Monta o mu final para prob_over_line.

    mu = expected_lambda(rate_per90, minutos_esperados) * opp_mult * ha_mult

    rate_per90 deve chegar já encolhido (shrink_rate aplicado upstream, em
    entity_taxa do StatsProvider). assemble_mu só compõe.
    """
    lam = expected_lambda(rate_per90, minutos_esperados)
    return lam * opp_mult * ha_mult
