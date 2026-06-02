import pytest
from odd_analyzer.model.shrinkage import shrink_rate

def test_sem_amostra_volta_o_prior():
    assert shrink_rate(rate=5.0, apps=0, prior_rate=1.0, prior_strength=8) == pytest.approx(1.0)

def test_amostra_grande_domina_o_prior():
    # 100 jogos a 2.0, prior fraco -> perto de 2.0
    assert shrink_rate(2.0, 100, 1.0, 8) == pytest.approx((100*2.0 + 8*1.0)/108)

def test_mistura_ponderada():
    assert shrink_rate(3.0, 2, 1.0, 8) == pytest.approx((2*3.0 + 8*1.0)/10)
