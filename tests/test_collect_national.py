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
