import math
import pytest
from odd_analyzer.backtest.calibration import brier_score, reliability_bins
from odd_analyzer.backtest.calibration import (
    log_loss, expected_calibration_error, brier_skill_score,
)

def test_brier_perfeito_e_zero():
    assert brier_score([1.0, 0.0], [1, 0]) == pytest.approx(0.0)

def test_brier_valor_conhecido():
    # preds 0.5/0.5, actuals 1/0 -> ((0.5)^2 + (0.5)^2)/2 = 0.25
    assert brier_score([0.5, 0.5], [1, 0]) == pytest.approx(0.25)

def test_reliability_bins_agrupa_e_mede():
    preds = [0.05, 0.15, 0.16, 0.95]
    actuals = [0, 0, 1, 1]
    bins = reliability_bins(preds, actuals, n_bins=10)
    # bin 0 (0.0-0.1): 1 amostra, actual 0; bin 1 (0.1-0.2): 2 amostras, actual médio 0.5; bin 9: 1 amostra actual 1
    by = {b["bin"]: b for b in bins}
    assert by[1]["count"] == 2
    assert by[1]["mean_actual"] == pytest.approx(0.5)
    assert by[1]["mean_pred"] == pytest.approx((0.15+0.16)/2)
    assert by[9]["mean_actual"] == pytest.approx(1.0)


def test_log_loss_perfeito_e_quase_zero():
    assert log_loss([1.0, 0.0], [1, 0]) == pytest.approx(0.0, abs=1e-10)

def test_log_loss_meio_a_meio():
    # preds 0.5 -> log loss = -ln(0.5) = ln(2)
    assert log_loss([0.5, 0.5], [1, 0]) == pytest.approx(math.log(2))

def test_log_loss_clipa_e_nao_estoura():
    # pred 0.0 mas actual 1 -> sem clip seria inf; com clip vira número grande finito
    val = log_loss([0.0], [1])
    assert math.isfinite(val) and val > 30

def test_ece_calibracao_perfeita_e_zero():
    assert expected_calibration_error([0.0, 1.0], [0, 1]) == pytest.approx(0.0)

def test_ece_descalibrado_e_positivo():
    # prevê 0.9 mas nunca acontece -> erro 0.9 no bin
    assert expected_calibration_error([0.9, 0.9], [0, 0]) == pytest.approx(0.9)

def test_brier_skill_perfeito_e_um():
    # preds perfeitos, base 0.5 -> brier_base 0.25, brier 0 -> skill 1
    assert brier_skill_score([1.0, 0.0], [1, 0]) == pytest.approx(1.0)

def test_brier_skill_chute_base_e_zero():
    base = 0.5
    assert brier_skill_score([base, base], [1, 0]) == pytest.approx(0.0)
