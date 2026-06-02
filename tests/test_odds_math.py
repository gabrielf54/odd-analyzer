import pytest
from odd_analyzer.odds_math import american_to_decimal

@pytest.mark.parametrize("american,expected", [
    ("+150", 2.5),
    ("-120", 1.8333),
    ("100", 2.0),
    ("-200", 1.5),
])
def test_american_to_decimal(american, expected):
    assert american_to_decimal(american) == pytest.approx(expected, abs=1e-4)

def test_already_decimal_passthrough():
    assert american_to_decimal("1.83") == pytest.approx(1.83)
