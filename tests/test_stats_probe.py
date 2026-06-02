import pandas as pd
from odd_analyzer.probes.stats_probe import has_sot_column

def test_detecta_sot_em_colunas_simples():
    df = pd.DataFrame({"Player": ["X"], "Sh": [3], "SoT": [1]})
    assert has_sot_column(df) is True

def test_detecta_sot_em_multiindex():
    cols = pd.MultiIndex.from_tuples([("Standard", "Gls"), ("Standard", "SoT")])
    df = pd.DataFrame([[1, 2]], columns=cols)
    assert has_sot_column(df) is True

def test_ausencia_de_sot():
    df = pd.DataFrame({"Player": ["X"], "Gls": [1], "Ast": [0]})
    assert has_sot_column(df) is False
