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
    # backtest deve ler o mesmo valor de params (sem literal solto)
    assert run_backtest.NB_DISPERSION == params.NB_DISPERSION
    # pipeline agora lê nb_dispersion por MarketSpec (sem atributo de módulo)
    # verificamos que os mercados MVP usam o mesmo r do backtest (anti-drift)
    from odd_analyzer.model.markets import MARKETS
    for key, spec in MARKETS.items():
        assert spec.nb_dispersion == params.NB_DISPERSION, (
            f"MARKETS['{key}'].nb_dispersion={spec.nb_dispersion} != params.NB_DISPERSION={params.NB_DISPERSION}"
        )
