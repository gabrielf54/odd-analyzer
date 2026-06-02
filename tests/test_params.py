from odd_analyzer.model import params
from odd_analyzer import pipeline
from odd_analyzer.backtest import run_backtest

def test_params_valores():
    assert params.NB_DISPERSION == 3.0
    assert params.PRIOR_RATE == 0.4
    assert params.PRIOR_STRENGTH == 12
    assert params.MIN_OTHER_MINUTES == 60
    assert params.LINHAS == [0.5, 1.5]

def test_dispersion_e_a_mesma_fonte():
    # pipeline e backtest devem ler o MESMO valor de params (sem literal solto)
    assert pipeline.NB_DISPERSION == params.NB_DISPERSION
    assert run_backtest.NB_DISPERSION == params.NB_DISPERSION
