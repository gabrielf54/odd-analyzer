import pytest
from odd_analyzer import config

def test_get_required_present(monkeypatch):
    monkeypatch.setenv("SGO_API_KEY", "abc")
    assert config.get_required("SGO_API_KEY") == "abc"

def test_get_required_missing(monkeypatch):
    monkeypatch.delenv("SGO_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SGO_API_KEY"):
        config.get_required("SGO_API_KEY")
