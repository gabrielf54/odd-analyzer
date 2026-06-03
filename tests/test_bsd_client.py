"""Testa o BSDClient contra fixtures inline — zero rede."""
import pytest
from odd_analyzer.bsd.client import BSDClient

EVENTS_FIXTURE = {
    "count": 2,
    "results": [
        {"id": "evt_001", "home_team": {"id": 10, "name": "Brazil"},
         "away_team": {"id": 11, "name": "Croatia"}, "status": "NS"},
        {"id": "evt_002", "home_team": {"id": 12, "name": "France"},
         "away_team": {"id": 13, "name": "Poland"}, "status": "NS"},
    ]
}
PLAYER_STATS_FIXTURE = {
    "count": 1,
    "results": [
        {"player": {"id": 100, "name": "Vinicius Jr"},
         "shots_on_target": 2, "total_shots": 4, "total_tackle": 1,
         "minutes_played": 90}
    ]
}
EVENT_ODDS_FIXTURE = {
    "count": 1,
    "results": [
        {"bookmaker": "pinnacle",
         "markets": [{"name": "1x2",
                      "outcomes": [{"name": "1", "odds": 1.85},
                                   {"name": "X", "odds": 3.40},
                                   {"name": "2", "odds": 4.10}]}]}
    ]
}
LINEUPS_FIXTURE = {
    "count": 2,
    "results": [
        {"player": {"id": 100, "name": "Vinicius Jr"},
         "team": {"id": 10}, "position": "F", "starting": True},
        {"player": {"id": 200, "name": "Modric"},
         "team": {"id": 11}, "position": "M", "starting": True},
    ]
}
NATIONAL_POOL_FIXTURE = {
    "count": 1,
    "results": [
        {"id": 100, "name": "Vinicius Jr", "current_team_id": 50}
    ]
}

def _make_client(fixture: dict, tmp_path=None):
    def fake_get(url, params=None):
        return fixture
    return BSDClient(api_key="test-key", cache_dir=tmp_path, _get=fake_get)

def test_events_retorna_fixture(tmp_path):
    client = _make_client(EVENTS_FIXTURE, tmp_path)
    assert client.events(league="FIFA World Cup") == EVENTS_FIXTURE

def test_get_event_retorna_fixture(tmp_path):
    client = _make_client(EVENTS_FIXTURE, tmp_path)
    assert client.get_event("evt_001") == EVENTS_FIXTURE

def test_event_player_stats_retorna_fixture(tmp_path):
    client = _make_client(PLAYER_STATS_FIXTURE, tmp_path)
    assert client.event_player_stats("evt_001") == PLAYER_STATS_FIXTURE

def test_player_stats_retorna_fixture(tmp_path):
    client = _make_client(PLAYER_STATS_FIXTURE, tmp_path)
    assert client.player_stats(100, seasons="2025") == PLAYER_STATS_FIXTURE

def test_lineups_retorna_fixture(tmp_path):
    client = _make_client(LINEUPS_FIXTURE, tmp_path)
    assert client.lineups("evt_001") == LINEUPS_FIXTURE

def test_team_stats_retorna_fixture(tmp_path):
    client = _make_client(PLAYER_STATS_FIXTURE, tmp_path)
    assert client.team_stats("evt_001") == PLAYER_STATS_FIXTURE

def test_event_stats_retorna_fixture(tmp_path):
    stats_fixture = {"event_id": "evt_001",
                     "stats": {"home": {"corner_kicks": 7}, "away": {"corner_kicks": 3}}}
    client = _make_client(stats_fixture, tmp_path)
    assert client.event_stats("evt_001") == stats_fixture

def test_event_stats_usa_endpoint_stats(tmp_path):
    urls = []
    client = BSDClient(api_key="k", cache_dir=tmp_path)
    client._get = lambda url, params=None: (urls.append(url), {"stats": {}})[1]
    client.event_stats("evt_001")
    assert urls[0].endswith("/events/evt_001/stats/")

def test_event_odds_retorna_fixture(tmp_path):
    client = _make_client(EVENT_ODDS_FIXTURE, tmp_path)
    assert client.event_odds("evt_001") == EVENT_ODDS_FIXTURE

def test_odds_by_book_retorna_fixture(tmp_path):
    client = _make_client(EVENT_ODDS_FIXTURE, tmp_path)
    assert client.odds_by_book("evt_001", market="1x2", book="pinnacle") == EVENT_ODDS_FIXTURE

def test_national_pool_retorna_fixture(tmp_path):
    client = _make_client(NATIONAL_POOL_FIXTURE, tmp_path)
    assert client.national_pool(team_id=10) == NATIONAL_POOL_FIXTURE

def test_squad_retorna_fixture(tmp_path):
    client = _make_client(NATIONAL_POOL_FIXTURE, tmp_path)
    assert client.squad(team_id=10) == NATIONAL_POOL_FIXTURE

def test_leagues_retorna_fixture(tmp_path):
    leagues_fixture = {"count": 1, "results": [{"id": 1, "name": "FIFA World Cup"}]}
    client = _make_client(leagues_fixture, tmp_path)
    assert client.leagues() == leagues_fixture

def test_cache_evita_segunda_chamada_fake_get(tmp_path):
    chamadas = {"n": 0}
    def counting_get(url, params=None):
        chamadas["n"] += 1
        return EVENTS_FIXTURE
    client = BSDClient(api_key="test-key", cache_dir=tmp_path, _get=counting_get)
    client.events()
    client.events()
    assert chamadas["n"] == 1

def test_base_url_e_auth_header_usados(tmp_path):
    urls_chamadas = []
    client = BSDClient(api_key="secret-key", cache_dir=tmp_path)
    client._get = lambda url, params=None: (urls_chamadas.append(url), EVENTS_FIXTURE)[1]
    client.events(league="wc")
    assert urls_chamadas[0].startswith("https://sports.bzzoiro.com/api/v2")

def test_client_sem_api_key_levanta_erro():
    with pytest.raises((ValueError, RuntimeError)):
        BSDClient(api_key="")
