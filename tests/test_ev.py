import pytest
from odd_analyzer.value.ev import edge_ev

def test_edge_ev_positivo():
    r = edge_ev(prob_modelo=0.55, prob_devig=0.46, odd_decimal=2.10)
    assert r["edge"] == pytest.approx(0.09)
    assert r["ev"] == pytest.approx(0.155)

def test_ev_zero_quando_odd_e_o_inverso_da_prob():
    r = edge_ev(prob_modelo=0.5, prob_devig=0.5, odd_decimal=2.0)
    assert r["ev"] == pytest.approx(0.0)
    assert r["edge"] == pytest.approx(0.0)

def test_edge_negativo():
    r = edge_ev(prob_modelo=0.40, prob_devig=0.50, odd_decimal=2.0)
    assert r["edge"] == pytest.approx(-0.10)
    assert r["ev"] == pytest.approx(-0.20)
