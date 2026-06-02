import pytest
from odd_analyzer.value.devig import (
    implied_prob, devig_multiplicative, devig_power, fair_prob_over,
)

def test_implied_prob():
    assert implied_prob(2.0) == pytest.approx(0.5)

def test_multiplicative_even_market():
    # mercado simétrico com vig: 1.91/1.91 -> 0.5/0.5 após de-vig
    po, pu = devig_multiplicative(1.91, 1.91)
    assert po == pytest.approx(0.5)
    assert pu == pytest.approx(0.5)
    assert po + pu == pytest.approx(1.0)

def test_multiplicative_soma_um():
    po, pu = devig_multiplicative(1.5, 3.0)
    assert po + pu == pytest.approx(1.0)
    assert po > pu

def test_power_even_market():
    po, pu = devig_power(1.91, 1.91)
    assert po == pytest.approx(0.5, abs=1e-3)
    assert po + pu == pytest.approx(1.0, abs=1e-6)

def test_fair_prob_over_e_conservador():
    # conservador = MAIOR prob justa do over entre os dois métodos
    po_m, _ = devig_multiplicative(1.8, 2.1)
    po_p, _ = devig_power(1.8, 2.1)
    assert fair_prob_over(1.8, 2.1) == pytest.approx(max(po_m, po_p))

def test_power_assimetrico_favorece_o_favorito():
    # mercado assimétrico: power method desloca prob para o favorito vs multiplicativo
    po_p, pu_p = devig_power(1.40, 3.20)
    po_m, _ = devig_multiplicative(1.40, 3.20)
    assert po_p + pu_p == pytest.approx(1.0)
    assert po_p > pu_p          # over é o favorito
    assert po_p > po_m          # power dá mais prob ao favorito que o multiplicativo

def test_fair_prob_over_usa_multiplicativo_quando_over_e_zebra():
    # over como zebra (2.1) vs under favorito (1.8): multiplicativo > power no over,
    # então o conservador (max) tem que escolher o multiplicativo (exercita o outro ramo)
    po_m, _ = devig_multiplicative(2.1, 1.8)
    po_p, _ = devig_power(2.1, 1.8)
    assert po_m > po_p
    assert fair_prob_over(2.1, 1.8) == pytest.approx(po_m)

def test_odd_invalida():
    with pytest.raises(ValueError):
        implied_prob(1.0)
