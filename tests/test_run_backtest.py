import pytest
from odd_analyzer.backtest.run_backtest import score_records

# dataset fixo: 2 jogadores, 3 jogos. records = (fid, pid, team_id, minutes, sot)
META = {1: (10, 20), 2: (10, 20), 3: (10, 20)}
RECORDS = [
    (1, 100, 10, 90, 2), (1, 200, 20, 90, 0),
    (2, 100, 10, 90, 1), (2, 200, 20, 90, 1),
    (3, 100, 10, 90, 3), (3, 200, 20, 90, 0),
]
CONCEDED = {10: 1.0, 20: 1.0}   # multiplicador de adversário neutro (= league_avg)
LEAGUE_AVG = 1.0

def _run():
    return score_records(META, RECORDS, CONCEDED, LEAGUE_AVG, 1.0, 1.0,
                         lines=[0.5, 1.5], min_other_minutes=60)

def test_score_records_conta_e_resultados():
    preds, actuals = _run()
    # cada jogador tem 2 outros jogos * 90 = 180 min fora >= 60 -> todos os 6 usados
    assert len(preds[0.5]) == 6
    assert len(preds[1.5]) == 6
    # actual = 1 se sot > linha. sot = [2,0,1,1,3,0]
    assert actuals[0.5] == [1, 0, 1, 1, 1, 0]   # sot >= 1
    assert actuals[1.5] == [1, 0, 0, 0, 1, 0]   # sot >= 2

def test_score_records_probabilidades_validas():
    preds, _ = _run()
    assert all(0.0 < p < 1.0 for p in preds[0.5])
    assert all(0.0 < p < 1.0 for p in preds[1.5])
    # P(over 0.5) >= P(over 1.5) para o mesmo registro (monotonicidade)
    assert all(a >= b - 1e-12 for a, b in zip(preds[0.5], preds[1.5]))

def test_score_records_determinista():
    assert _run() == _run()

def test_score_records_descarta_amostra_curta():
    # jogador com só 1 jogo: other_min=0 < 60 -> descartado
    meta = {1: (10, 20)}
    records = [(1, 100, 10, 90, 2), (1, 200, 20, 90, 0)]
    preds, actuals = score_records(meta, records, {10: 1.0, 20: 1.0}, 1.0, 1.0, 1.0,
                                   lines=[0.5], min_other_minutes=60)
    assert preds[0.5] == [] and actuals[0.5] == []
