import pytest
from odd_analyzer.model.assemble import windowed_rate, assemble_mu

GAMES = [
    {"corners": 3, "mando": "home"},
    {"corners": 5, "mando": "away"},
    {"corners": 4, "mando": "home"},
    {"corners": 6, "mando": "away"},
    {"corners": 2, "mando": "home"},
    {"corners": 7, "mando": "away"},
    {"corners": 5, "mando": "home"},
    {"corners": 3, "mando": "away"},
    {"corners": 6, "mando": "home"},
    {"corners": 4, "mando": "away"},
]

def test_windowed_rate_returns_windows_3_5_10():
    result = windowed_rate(GAMES, stat_field="corners")
    assert "w3" in result
    assert "w5" in result
    assert "w10" in result

def test_windowed_rate_w3_is_mean_of_last_3():
    result = windowed_rate(GAMES, stat_field="corners")
    expected = (4 + 6 + 3) / 3
    assert result["w3"] == pytest.approx(expected)

def test_windowed_rate_w5_is_mean_of_last_5():
    result = windowed_rate(GAMES, stat_field="corners")
    expected = (7 + 5 + 3 + 6 + 4) / 5
    assert result["w5"] == pytest.approx(expected)

def test_windowed_rate_w10_is_mean_of_last_10():
    result = windowed_rate(GAMES, stat_field="corners")
    all_corners = [g["corners"] for g in GAMES]
    expected = sum(all_corners) / 10
    assert result["w10"] == pytest.approx(expected)

def test_windowed_rate_fewer_games_than_window_returns_available():
    games_short = [{"corners": 4, "mando": "home"}, {"corners": 6, "mando": "away"}]
    result = windowed_rate(games_short, stat_field="corners")
    assert result["w3"] == pytest.approx((4 + 6) / 2)
    assert result["w5"] == pytest.approx((4 + 6) / 2)
    assert result["w10"] == pytest.approx((4 + 6) / 2)

def test_windowed_rate_empty_games_returns_none():
    result = windowed_rate([], stat_field="corners")
    assert result["w3"] is None
    assert result["w5"] is None
    assert result["w10"] is None

def test_windowed_rate_mando_filter_home_only():
    result = windowed_rate(GAMES, stat_field="corners", mando="home")
    home_games = [g for g in GAMES if g.get("mando") == "home"]
    expected_w5 = sum(g["corners"] for g in home_games[-5:]) / min(5, len(home_games))
    assert result["w5"] == pytest.approx(expected_w5)

def test_windowed_rate_mando_filter_away_only():
    result = windowed_rate(GAMES, stat_field="corners", mando="away")
    away_games = [g for g in GAMES if g.get("mando") == "away"]
    expected_w5 = sum(g["corners"] for g in away_games[-5:]) / min(5, len(away_games))
    assert result["w5"] == pytest.approx(expected_w5)

def test_assemble_mu_composes_factors():
    mu = assemble_mu(rate_per90=5.0, minutos_esperados=90.0, opp_mult=1.2, ha_mult=1.1)
    assert mu == pytest.approx(5.0 * (90.0 / 90.0) * 1.2 * 1.1)

def test_assemble_mu_zero_minutes_returns_zero():
    mu = assemble_mu(rate_per90=5.0, minutos_esperados=0.0, opp_mult=1.2, ha_mult=1.1)
    assert mu == pytest.approx(0.0)

def test_assemble_mu_neutral_multipliers_equals_expected_lambda():
    mu = assemble_mu(rate_per90=4.0, minutos_esperados=90.0, opp_mult=1.0, ha_mult=1.0)
    assert mu == pytest.approx(4.0)


def test_windowed_rate_per90_pondera_por_minutos():
    # 2 jogos: 90min/2 chutes e 30min/0 chutes. Per-jogo ingênuo = 1.0/jogo.
    # Per-90 correto = (2+0)/(90+30)*90 = 1.5/90.
    games = [
        {"shots_on_target": 2, "minutes_played": 90},
        {"shots_on_target": 0, "minutes_played": 30},
    ]
    r = windowed_rate(games, "shots_on_target", windows=(3,), minutes_field="minutes_played")
    assert abs(r["w3"] - 1.5) < 1e-9


def test_windowed_rate_per90_minutos_zero_retorna_none():
    games = [{"shots_on_target": 0, "minutes_played": 0}]
    r = windowed_rate(games, "shots_on_target", windows=(3,), minutes_field="minutes_played")
    assert r["w3"] is None


def test_windowed_rate_sem_minutes_field_mantem_media_por_jogo():
    # nível-time (escanteios): sem minutos, média por-jogo preservada.
    games = [{"corners": 4}, {"corners": 6}]
    r = windowed_rate(games, "corners", windows=(3,))
    assert abs(r["w3"] - 5.0) < 1e-9


from odd_analyzer.model.assemble import filter_games_by_scope, player_mu_from_games


def test_filter_games_by_scope_separa_por_team_id():
    games = [
        {"event_id": 1, "team_id": 100, "total_tackle": 2, "minutes_played": 90},  # seleção
        {"event_id": 2, "team_id": 200, "total_tackle": 5, "minutes_played": 90},  # clube
        {"event_id": 3, "team_id": 100, "total_tackle": 3, "minutes_played": 90},  # seleção
    ]
    assert len(filter_games_by_scope(games, "todos", 100)) == 3
    selecao = filter_games_by_scope(games, "selecao", 100)
    assert [g["event_id"] for g in selecao] == [1, 3]
    clube = filter_games_by_scope(games, "clube", 100)
    assert [g["event_id"] for g in clube] == [2]
    # team_id como str ou int não importa
    assert len(filter_games_by_scope(games, "selecao", "100")) == 2


def test_player_mu_from_games_pura_e_deterministica():
    games = [{"total_tackle": 2, "minutes_played": 90} for _ in range(10)]
    out = player_mu_from_games(games, stat_field="total_tackle", prior_rate=1.3,
                               prior_strength=12.0, opp_mult=1.0, ha_mult=1.0)
    assert out is not None
    assert out["n"] == 10
    assert out["mu"] > 0
    # multiplicadores compõem linearmente: dobrar opp_mult dobra o mu
    out2 = player_mu_from_games(games, stat_field="total_tackle", prior_rate=1.3,
                                prior_strength=12.0, opp_mult=2.0, ha_mult=1.0)
    assert abs(out2["mu"] - 2 * out["mu"]) < 1e-9


def test_player_mu_from_games_sem_amostra_retorna_none():
    assert player_mu_from_games([], stat_field="total_tackle", prior_rate=1.3,
                                prior_strength=12.0, opp_mult=1.0, ha_mult=1.0) is None


from odd_analyzer.model.assemble import expected_minutes


def test_expected_minutes_media_da_janela():
    # 10 jogos, todos 45 min → média 45 (w5 pega os 5 últimos, todos 45)
    games = [{"minutes_played": 45} for _ in range(10)]
    assert expected_minutes(games) == 45.0


def test_expected_minutes_usa_w5_recente():
    # ordem crescente (recente no fim): 5 antigos com 30, 5 recentes com 90.
    # w5 = média dos 5 recentes = 90.
    games = [{"minutes_played": 30} for _ in range(5)] + [{"minutes_played": 90} for _ in range(5)]
    assert expected_minutes(games) == 90.0


def test_expected_minutes_vazio_retorna_none():
    assert expected_minutes([]) is None
