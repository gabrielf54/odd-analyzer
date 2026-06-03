"""Tests for BSDStatsProvider — all offline, BSD client responses are fakes."""
import pytest
from odd_analyzer.providers.stats import BSDStatsProvider
from odd_analyzer.model.markets import MARKETS

FIXTURE_LINEUPS = {
    "event_id": "101",
    "home": {
        "team_id": "10",
        "starting_xi": [
            {"id": "p1", "name": "Vinicius Jr", "position": "FW"},
            {"id": "p2", "name": "Casemiro", "position": "MF"},
        ],
    },
    "away": {
        "team_id": "20",
        "starting_xi": [
            {"id": "p3", "name": "Modric", "position": "MF"},
        ],
    },
}
FIXTURE_PLAYER_STATS = {
    "player_id": "p1",
    "games": [
        {"event_id": str(i), "corners": 5 + (i % 3), "mando": "home" if i % 2 == 0 else "away"}
        for i in range(1, 11)
    ],
}
FIXTURE_TEAM_STATS_EVENT = {
    "event_id": "101",
    "home": {"corners": 7},
    "away": {"corners": 3},
}
EVENT = {
    "id": "101",
    "home_team": {"id": "10", "name": "Brasil"},
    "away_team": {"id": "20", "name": "Croacia"},
}


class FakeBSDClient:
    def __init__(self):
        self._lineups = FIXTURE_LINEUPS
        self._player_stats = FIXTURE_PLAYER_STATS
        self._team_stats = FIXTURE_TEAM_STATS_EVENT
    def lineups(self, event_id):
        return self._lineups
    def player_stats(self, player_id, **filtros):
        return self._player_stats
    def team_stats(self, event_id):
        return self._team_stats


def make_provider():
    return BSDStatsProvider(client=FakeBSDClient())


def test_elenco_returns_all_players_with_required_fields():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    assert len(elenco) == 3
    ids = {p["id"] for p in elenco}
    assert "p1" in ids and "p2" in ids and "p3" in ids
    for p in elenco:
        assert "id" in p and "name" in p and "team_id" in p and "posicao" in p


def test_elenco_home_players_get_correct_team_id():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    for p in [p for p in elenco if p["id"] in ("p1", "p2")]:
        assert p["team_id"] == "10"


def test_elenco_away_players_get_correct_team_id():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    away = next(p for p in elenco if p["id"] == "p3")
    assert away["team_id"] == "20"


def test_entity_taxa_returns_required_keys():
    provider = make_provider()
    contexto = {"event": EVENT, "entity_team_id": "10", "is_home": True, "league_avg_conceded": 5.0}
    result = provider.entity_taxa("10", MARKETS["escanteios"], contexto)
    assert result is not None
    for key in ("mu", "minutos_esperados", "xi_confirmado", "amostra_jogos", "concedido_adversario", "incerteza"):
        assert key in result, f"chave ausente: {key}"


def test_entity_taxa_mu_is_positive():
    provider = make_provider()
    contexto = {"event": EVENT, "entity_team_id": "10", "is_home": True, "league_avg_conceded": 5.0}
    result = provider.entity_taxa("10", MARKETS["escanteios"], contexto)
    assert result["mu"] > 0


def test_entity_taxa_amostra_jogos_reflects_available_games():
    provider = make_provider()
    contexto = {"event": EVENT, "entity_team_id": "10", "is_home": True, "league_avg_conceded": 5.0}
    result = provider.entity_taxa("10", MARKETS["escanteios"], contexto)
    assert result["amostra_jogos"] == 10


def test_entity_taxa_returns_none_when_no_games():
    class EmptyClient:
        def lineups(self, event_id):
            return FIXTURE_LINEUPS
        def player_stats(self, player_id, **filtros):
            return {"player_id": player_id, "games": []}
        def team_stats(self, event_id):
            return FIXTURE_TEAM_STATS_EVENT
    provider = BSDStatsProvider(client=EmptyClient())
    contexto = {"event": EVENT, "entity_team_id": "10", "is_home": True, "league_avg_conceded": 5.0}
    result = provider.entity_taxa("10", MARKETS["escanteios"], contexto)
    assert result is None


def test_entity_taxa_xi_confirmado_is_bool():
    provider = make_provider()
    contexto = {"event": EVENT, "entity_team_id": "10", "is_home": True, "league_avg_conceded": 5.0, "xi_team_ids": {"10"}}
    result = provider.entity_taxa("10", MARKETS["escanteios"], contexto)
    assert isinstance(result["xi_confirmado"], bool)
