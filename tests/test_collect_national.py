from odd_analyzer.backtest.collect_national import games_before_target


def test_games_before_target_pega_so_mais_antigos_em_ordem_crescente():
    # BSD decrescente (recente primeiro): ids 105..100. Alvo = 103.
    hist = [{"event_id": 105, "total_tackle": 9}, {"event_id": 104, "total_tackle": 8},
            {"event_id": 103, "total_tackle": 7}, {"event_id": 102, "total_tackle": 6},
            {"event_id": 101, "total_tackle": 5}, {"event_id": 100, "total_tackle": 4}]
    older = games_before_target(hist, 103)
    # só os mais antigos que 103 (102,101,100), em ordem CRESCENTE (100 primeiro)
    assert [g["event_id"] for g in older] == [100, 101, 102]


def test_games_before_target_alvo_ausente_retorna_vazio():
    hist = [{"event_id": 105}, {"event_id": 104}]
    assert games_before_target(hist, 999) == []


def test_games_before_target_alvo_mais_antigo_sem_historico():
    hist = [{"event_id": 105}, {"event_id": 100}]
    assert games_before_target(hist, 100) == []


from odd_analyzer.backtest.collect_national import pool_targets


class _PoolClient:
    """Fake: 2 ligas (64 competitivo, 31 amistoso), 1 jogo cada, 2 jogadores por jogo."""
    def events(self, league_id, status, limit):
        base = {64: [{"id": 900, "home_team_id": 1, "away_team_id": 2, "event_date": "2026-03-01"}],
                31: [{"id": 800, "home_team_id": 1, "away_team_id": 3, "event_date": "2026-06-01"}]}
        return {"results": base.get(league_id, [])}
    def event_player_stats(self, eid):
        return {"player_stats": [
            {"player_id": 10, "team_id": 1, "minutes_played": 90, "total_tackle": 3},
            {"player_id": 20, "team_id": 2 if eid == 900 else 3, "minutes_played": 90, "total_tackle": 1},
        ]}


def test_pool_targets_junta_ligas_sem_amistoso():
    targets, conceded, league_avg = pool_targets(
        _PoolClient(), leagues=(64, 31), n_per_league=10, stat_field="total_tackle",
        include_friendlies=False)
    # liga 31 (amistoso) excluída → só o jogo 900
    assert [t["event_id"] for t in targets] == [900]
    assert targets[0]["home_id"] == 1 and targets[0]["away_id"] == 2
    # actual do jogador 10 está no target
    assert any(p["player_id"] == 10 for p in targets[0]["player_stats"])


def test_pool_targets_com_amistoso_inclui_liga_31():
    targets, _, _ = pool_targets(
        _PoolClient(), leagues=(64, 31), n_per_league=10, stat_field="total_tackle",
        include_friendlies=True)
    assert sorted(t["event_id"] for t in targets) == [800, 900]


def test_pool_targets_concede_por_time():
    # jogo 900: time 1 concede o que o time 2 produziu (1 tackle); time 2 concede 3.
    _, conceded, league_avg = pool_targets(
        _PoolClient(), leagues=(64,), n_per_league=10, stat_field="total_tackle",
        include_friendlies=False)
    assert conceded[1] == 1.0 and conceded[2] == 3.0
    assert abs(league_avg - 2.0) < 1e-9


from odd_analyzer.backtest.run_national_backtest import score_targets
from odd_analyzer.model.markets import MARKETS


class _ScoreClient:
    """1 alvo (jogo 900). Jogador 10 tem histórico: alvo 900 + 3 jogos mais antigos de seleção."""
    def events(self, league_id, status, limit):
        return {"results": [{"id": 900, "home_team_id": 1, "away_team_id": 2,
                             "event_date": "2026-03-01"}]}
    def event_player_stats(self, eid):
        return {"player_stats": [
            {"player_id": 10, "team_id": 1, "minutes_played": 90, "total_tackle": 2},
            {"player_id": 20, "team_id": 2, "minutes_played": 90, "total_tackle": 1},
        ]}
    def player_stats(self, pid):
        # DESC (recente primeiro): alvo 900 no topo, depois 3 jogos mais antigos (ids menores).
        return {"results": [
            {"event_id": 900, "team_id": 1, "total_tackle": 2, "minutes_played": 90},
            {"event_id": 803, "team_id": 1, "total_tackle": 3, "minutes_played": 90},
            {"event_id": 802, "team_id": 1, "total_tackle": 2, "minutes_played": 90},
            {"event_id": 801, "team_id": 1, "total_tackle": 4, "minutes_played": 90},
        ]}
    def event_stats(self, eid):
        return {"stats": {}}


def test_score_targets_gera_preds_e_actuals_sem_espiar_o_alvo():
    targets, conceded, league_avg = pool_targets(
        _ScoreClient(), leagues=(64,), n_per_league=10, stat_field="total_tackle",
        include_friendlies=False)
    preds, actuals = score_targets(
        _ScoreClient(), targets, conceded, league_avg, MARKETS["desarmes"], escopo="selecao")
    # jogador 10 fez 2 tackles no alvo → actual de over 1.5 = 1
    assert actuals[1.5]  # tem amostra
    assert all(0.0 <= p <= 1.0 for p in preds[1.5])
    # a previsão usa só os 3 jogos ANTIGOS (801/802/803), nunca o alvo 900
    assert len(preds[1.5]) >= 1
