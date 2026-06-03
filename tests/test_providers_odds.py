"""Tests for OddsProvider implementations — all offline, fixture-based."""
import pytest
from odd_analyzer.providers.odds import BSDMatchOdds, ManualOdds, NullOdds, PropOddsProvider
from odd_analyzer.model.markets import MARKETS

EVENT = {"id": "101", "home_team": {"id": "10", "name": "Brasil"}, "away_team": {"id": "20", "name": "Croacia"}}

FIXTURE_EVENT_ODDS_CORNERS = {
    "event_id": "101",
    "bookmakers": [
        {"name": "Pinnacle", "markets": [{"key": "corners_total", "outcomes": [
            {"name": "Over", "point": 9.5, "price": 1.87},
            {"name": "Under", "point": 9.5, "price": 1.93},
            {"name": "Over", "point": 7.5, "price": 1.45},
            {"name": "Under", "point": 7.5, "price": 2.60},
        ]}]},
        {"name": "bet365", "markets": [{"key": "corners_total", "outcomes": [
            {"name": "Over", "point": 9.5, "price": 1.85},
            {"name": "Under", "point": 9.5, "price": 1.95},
        ]}]},
    ],
}

class FakeBSDClientOdds:
    def event_odds(self, event_id):
        return FIXTURE_EVENT_ODDS_CORNERS
    def odds_by_book(self, event_id, market, book):
        return FIXTURE_EVENT_ODDS_CORNERS

def test_bsd_match_odds_returns_list_of_linhas():
    provider = BSDMatchOdds(client=FakeBSDClientOdds())
    linhas = provider.linhas(EVENT, MARKETS["escanteios"])
    assert isinstance(linhas, list)
    assert len(linhas) >= 1

def test_bsd_match_odds_each_linha_has_required_keys():
    provider = BSDMatchOdds(client=FakeBSDClientOdds())
    for linha in provider.linhas(EVENT, MARKETS["escanteios"]):
        assert "entidade" in linha and "linha" in linha and "odd_over" in linha and "odd_under" in linha and "book" in linha

def test_bsd_match_odds_parses_over_under_pairs():
    provider = BSDMatchOdds(client=FakeBSDClientOdds())
    linhas = provider.linhas(EVENT, MARKETS["escanteios"])
    linha_95 = [l for l in linhas if l["linha"] == 9.5]
    assert len(linha_95) >= 1
    assert linha_95[0]["odd_over"] > 1.0
    assert linha_95[0]["odd_under"] > 1.0

def test_bsd_match_odds_skips_incomplete_pairs():
    class OneSideClient:
        def event_odds(self, event_id):
            return {"event_id": "101", "bookmakers": [{"name": "Pinnacle", "markets": [{"key": "corners_total",
                "outcomes": [{"name": "Over", "point": 9.5, "price": 1.87}]}]}]}
        def odds_by_book(self, event_id, market, book):
            return self.event_odds(event_id)
    provider = BSDMatchOdds(client=OneSideClient())
    assert provider.linhas(EVENT, MARKETS["escanteios"]) == []

def test_bsd_match_odds_empty_when_no_bookmakers():
    class EmptyClient:
        def event_odds(self, event_id):
            return {"event_id": "101", "bookmakers": []}
        def odds_by_book(self, event_id, market, book):
            return self.event_odds(event_id)
    provider = BSDMatchOdds(client=EmptyClient())
    assert provider.linhas(EVENT, MARKETS["escanteios"]) == []

def test_manual_odds_returns_provided_linhas():
    manual_linhas = [{"entidade": "partida", "linha": 9.5, "odd_over": 1.90, "odd_under": 1.90, "book": "manual"}]
    provider = ManualOdds(linhas=manual_linhas)
    assert provider.linhas(EVENT, MARKETS["escanteios"]) == manual_linhas

def test_manual_odds_ignores_market_arg():
    manual_linhas = [{"entidade": "partida", "linha": 1.5, "odd_over": 2.0, "odd_under": 1.80, "book": "manual"}]
    provider = ManualOdds(linhas=manual_linhas)
    assert provider.linhas(EVENT, MARKETS["sot"]) == manual_linhas

def test_null_odds_always_returns_empty():
    provider = NullOdds()
    assert provider.linhas(EVENT, MARKETS["escanteios"]) == []
    assert provider.linhas(EVENT, MARKETS["sot"]) == []

def test_prop_odds_provider_raises_not_implemented():
    provider = PropOddsProvider()
    with pytest.raises(NotImplementedError):
        provider.linhas(EVENT, MARKETS["sot"])
