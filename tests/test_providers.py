"""Verifica contratos dos Provider protocols e stubs (zero rede)."""
import pytest
from odd_analyzer.model.markets import MARKETS

from odd_analyzer.providers.stats import (
    StatsProvider, BSDStatsProvider, ApiFootballStatsProvider, FallbackStatsProvider,
)
from odd_analyzer.providers.odds import (
    OddsProvider, BSDMatchOdds, ManualOdds, NullOdds, PropOddsProvider,
)

def _has_method(cls, name):
    return callable(getattr(cls, name, None))

def test_stats_provider_protocol_methods_exist():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(StatsProvider, name), f"StatsProvider.{name} ausente"

def test_bsd_stats_provider_has_protocol_methods():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(BSDStatsProvider, name)

def test_apifootball_stats_provider_has_protocol_methods():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(ApiFootballStatsProvider, name)

def test_fallback_stats_provider_has_protocol_methods():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(FallbackStatsProvider, name)

def test_null_odds_linhas_retorna_lista_vazia():
    provider = NullOdds()
    assert provider.linhas({"id": "evt1"}, MARKETS["sot"]) == []

def test_null_odds_cobre_todos_os_mercados():
    provider = NullOdds()
    for key, market in MARKETS.items():
        assert provider.linhas({"id": "evt1"}, market) == [], f"NullOdds.linhas deveria ser [] para {key}"

def test_manual_odds_devolve_linhas_injetadas():
    linhas = [{"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.72, "odd_under": 2.10, "book": "manual"}]
    provider = ManualOdds(linhas)
    assert provider.linhas({"id": "evt1"}, MARKETS["sot"]) == linhas

def test_manual_odds_devolve_mesmas_linhas_para_qualquer_mercado():
    linhas = [{"lado": "home", "odd": 1.85}]
    provider = ManualOdds(linhas)
    for market in MARKETS.values():
        assert provider.linhas({"id": "x"}, market) == linhas

def test_prop_odds_provider_raises_not_implemented():
    provider = PropOddsProvider()
    with pytest.raises(NotImplementedError):
        provider.linhas({"id": "evt1"}, MARKETS["sot"])

def test_bsd_match_odds_has_linhas_method():
    assert _has_method(BSDMatchOdds, "linhas")

def test_odds_provider_protocol_has_linhas():
    assert _has_method(OddsProvider, "linhas")

def test_stubs_instantiable_without_deps():
    NullOdds()
    ManualOdds([])
    PropOddsProvider()

def test_bsd_stats_provider_needs_client():
    with pytest.raises((TypeError, ValueError)):
        BSDStatsProvider()

def test_fallback_stats_provider_needs_providers():
    with pytest.raises((TypeError, ValueError)):
        FallbackStatsProvider()
