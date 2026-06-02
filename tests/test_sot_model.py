import math
import pytest
from odd_analyzer.model.sot_model import expected_lambda, prob_at_least, prob_over_line

def test_expected_lambda():
    # 2.0 SoT/90 em 45 min -> 1.0 esperado
    assert expected_lambda(2.0, 45) == pytest.approx(1.0)

def test_poisson_prob_at_least():
    # Poisson mu=2: P(X>=2) = 1 - 3*e^-2
    esperado = 1 - 3*math.exp(-2)
    assert prob_at_least(2.0, 2) == pytest.approx(esperado, abs=1e-9)

def test_prob_at_least_zero_e_um():
    assert prob_at_least(1.5, 0) == 1.0
    assert prob_at_least(1.5, 1) == pytest.approx(1 - math.exp(-1.5), abs=1e-9)

def test_prob_over_line_meia():
    # over 1.5 == P(X>=2)
    assert prob_over_line(2.0, 1.5) == pytest.approx(prob_at_least(2.0, 2), abs=1e-12)

def test_negbin_aproxima_poisson_quando_r_grande():
    # r grande -> NegBin ~ Poisson
    assert prob_at_least(2.0, 3, r=100000) == pytest.approx(prob_at_least(2.0, 3), abs=1e-3)

def test_negbin_mais_disperso_engrossa_cauda():
    # com overdispersion (r pequeno), P de valores altos sobe vs Poisson
    assert prob_at_least(2.0, 5, r=2) > prob_at_least(2.0, 5)
