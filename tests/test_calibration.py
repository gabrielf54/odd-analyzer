import pytest
from odd_analyzer.backtest.calibration import brier_score, reliability_bins

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
