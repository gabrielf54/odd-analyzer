"""Monta mu para mercados de contagem: taxa janelada + shrinkage + multiplicadores.
Compõe as funções genéricas existentes (expected_lambda, opponent_multiplier,
home_away_multiplier) sem adicionar nova matemática."""

from odd_analyzer.model.sot_model import expected_lambda
from odd_analyzer.model.shrinkage import shrink_rate


def windowed_rate(
    games: list[dict],
    stat_field: str,
    windows: tuple = (3, 5, 10),
    mando: str | None = None,
    minutes_field: str | None = None,
) -> dict:
    """Taxa do stat_field nas últimas N partidas (janelas 3/5/10).

    `games` deve estar em ordem CRONOLÓGICA CRESCENTE (mais antigo primeiro);
    a janela `[-n:]` pega as N mais RECENTES. O chamador é responsável por ordenar.

    minutes_field:
      None  → média por-jogo (nível-time: um time sempre joga ~90).
      str   → per-90 ponderado por minutos: Σstat / Σmin × 90 (nível-jogador).
              Σmin == 0 na janela → None.
    """
    source = games
    if mando is not None:
        source = [g for g in games if g.get("mando") == mando]

    result: dict = {}
    for n in windows:
        window = source[-n:] if len(source) >= 1 else []
        if not window:
            result[f"w{n}"] = None
        elif minutes_field is None:
            vals = [g[stat_field] for g in window]
            result[f"w{n}"] = sum(vals) / len(vals)
        else:
            tot_stat = sum(g[stat_field] for g in window)
            tot_min = sum((g.get(minutes_field) or 0) for g in window)
            result[f"w{n}"] = (tot_stat / tot_min * 90.0) if tot_min > 0 else None
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


def filter_games_by_scope(games: list[dict], escopo: str, entity_team_id) -> list[dict]:
    """Filtra o histórico por escopo, comparando o team_id de cada jogo com o time que o
    jogador defende NESTE jogo-alvo (entity_team_id):
      'todos'   → tudo (clube + seleção).
      'selecao' → só os jogos com a MESMA camisa (team_id == entity_team_id).
      'clube'   → só as OUTRAS camisas (team_id != entity_team_id).
    Ordem preservada. team_id comparado como str (int/str não importa)."""
    if escopo == "todos":
        return games
    alvo = str(entity_team_id)
    if escopo == "selecao":
        return [g for g in games if str(g.get("team_id")) == alvo]
    if escopo == "clube":
        return [g for g in games if str(g.get("team_id")) != alvo]
    return games


def player_mu_from_games(games: list[dict], stat_field: str, prior_rate: float,
                         prior_strength: float, opp_mult: float, ha_mult: float,
                         minutos_esperados: float = 90.0) -> dict | None:
    """Conta pura compartilhada por produção (entity_taxa) e prova (backtest).
    `games` em ordem CRESCENTE (recente no fim). Devolve {mu, raw_rate, shrunk, n} ou None.
    Sem IO, sem rede — só janela + shrinkage + composição."""
    rates = windowed_rate(games, stat_field, minutes_field="minutes_played")
    w5, w3, w10 = rates.get("w5"), rates.get("w3"), rates.get("w10")
    raw_rate = w5 if w5 is not None else (w3 if w3 is not None else w10)
    if raw_rate is None:
        return None
    shrunk = shrink_rate(rate=raw_rate, apps=len(games),
                         prior_rate=prior_rate, prior_strength=prior_strength)
    mu = assemble_mu(rate_per90=shrunk, minutos_esperados=minutos_esperados,
                     opp_mult=opp_mult, ha_mult=ha_mult)
    return {"mu": mu, "raw_rate": raw_rate, "shrunk": shrunk, "n": len(games)}
