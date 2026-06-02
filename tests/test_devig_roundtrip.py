import pytest
from odd_analyzer.value.synthetic import fair_odds, inject_vig_multiplicative, inject_vig_power
from odd_analyzer.value.devig import devig_multiplicative, devig_power
from odd_analyzer.value.ev import edge_ev

PROBS = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]
OVERROUNDS = [0.0, 0.02, 0.05, 0.10]

def test_fair_odds_sao_inversa_da_prob():
    oo, ou = fair_odds(0.4)
    assert oo == pytest.approx(1 / 0.4)
    assert ou == pytest.approx(1 / 0.6)

@pytest.mark.parametrize("p", PROBS)
@pytest.mark.parametrize("m", OVERROUNDS)
def test_multiplicativo_roundtrip_recupera_p(p, m):
    # injeta vig multiplicativo e confirma que devig_multiplicative recupera p
    oo, ou = inject_vig_multiplicative(p, m)
    po, pu = devig_multiplicative(oo, ou)
    assert po == pytest.approx(p, abs=1e-9)
    assert po + pu == pytest.approx(1.0, abs=1e-9)

@pytest.mark.parametrize("p", PROBS)
@pytest.mark.parametrize("k", [1.02, 1.05, 1.1, 1.3])
def test_power_roundtrip_recupera_p(p, k):
    # injeta vig via power e confirma que devig_power recupera p (k>1 => vig>0)
    oo, ou = inject_vig_power(p, k)
    po, pu = devig_power(oo, ou)
    assert po == pytest.approx(p, abs=1e-6)
    assert po + pu == pytest.approx(1.0, abs=1e-6)

@pytest.mark.parametrize("p", PROBS)
@pytest.mark.parametrize("m", [0.02, 0.05, 0.10])
def test_aposta_justa_tem_ev_negativo_igual_ao_vig(p, m):
    # modelo == prob justa: apostar o over na odd VIGADA dá EV = -m/(1+m)
    oo, ou = inject_vig_multiplicative(p, m)
    po, _ = devig_multiplicative(oo, ou)   # == p
    r = edge_ev(prob_modelo=po, prob_devig=po, odd_decimal=oo)
    assert r["edge"] == pytest.approx(0.0, abs=1e-9)
    assert r["ev"] == pytest.approx(-m / (1 + m), abs=1e-9)

def test_mispricing_injetado_tem_sinal_certo():
    # mercado justo em p_true=0.5 sem vig; modelo acha 0.58 -> edge>0, EV>0
    p_true = 0.5
    oo, ou = fair_odds(p_true)
    po, _ = devig_multiplicative(oo, ou)   # == 0.5
    bom = edge_ev(prob_modelo=0.58, prob_devig=po, odd_decimal=oo)
    assert bom["edge"] == pytest.approx(0.08, abs=1e-9)
    assert bom["ev"] > 0
    # modelo abaixo do justo -> edge<0, EV<0
    ruim = edge_ev(prob_modelo=0.42, prob_devig=po, odd_decimal=oo)
    assert ruim["edge"] == pytest.approx(-0.08, abs=1e-9)
    assert ruim["ev"] < 0
