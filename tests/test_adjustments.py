import pytest
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier

def test_opponent_multiplier_defesa_vazada_e_solida():
    assert opponent_multiplier(6.0, 5.0) == pytest.approx(1.2)   # concede 20% acima da média
    assert opponent_multiplier(4.0, 5.0) == pytest.approx(0.8)   # defesa sólida

def test_opponent_multiplier_media_zero_e_neutro():
    assert opponent_multiplier(3.0, 0.0) == 1.0
    assert opponent_multiplier(3.0, -1.0) == 1.0

def test_home_away_multiplier():
    assert home_away_multiplier(True, 1.10, 0.90) == 1.10
    assert home_away_multiplier(False, 1.10, 0.90) == 0.90
