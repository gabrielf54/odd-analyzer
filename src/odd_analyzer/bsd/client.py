"""Cliente HTTP fino para a API BSD/Bzzoiro.

Base URL: https://sports.bzzoiro.com/api/v2
Auth: Authorization: Token <api_key>
Todas as chamadas passam por cached_get (TTL + namespace 'bsd').
_get é injetável nos testes para evitar rede real.
"""
import urllib.parse
from odd_analyzer.cache import cached_get

_BASE = "https://sports.bzzoiro.com/api/v2"

_TTL_ODDS = 300
_TTL_LINEUP = 300
_TTL_STATS = 3600
_TTL_ETERNAL = None


class BSDClient:
    """Cliente BSD. Em testes, passe _get=lambda url, params: fixture_dict."""

    def __init__(self, api_key: str, cache_dir=None, _get=None):
        if not api_key:
            raise ValueError("api_key não pode ser vazio")
        self._api_key = api_key
        self._cache_dir = cache_dir
        if _get is not None:
            self._get = _get
        else:
            self._get = self._make_requests_get()

    def _make_requests_get(self):
        import requests
        headers = {"Authorization": f"Token {self._api_key}"}
        session = requests.Session()
        session.headers.update(headers)
        def _get(url: str, params: dict | None = None):
            resp = session.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json()
        return _get

    def _call(self, path: str, params: dict | None = None,
              ttl: float | None = _TTL_ETERNAL) -> dict:
        url = f"{_BASE}{path}"
        qs = urllib.parse.urlencode(sorted((params or {}).items()))
        cache_key = f"{url}?{qs}"
        return cached_get(
            cache_key,
            lambda: self._get(url, params),
            cache_dir=self._cache_dir,
            ttl_seconds=ttl,
            source="bsd",
            should_cache=lambda d: bool(d),
        )

    def events(self, **filtros) -> dict:
        return self._call("/events/", filtros or None, ttl=_TTL_ODDS)

    def get_event(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/", ttl=_TTL_ETERNAL)

    def event_player_stats(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/player-stats/", ttl=_TTL_ETERNAL)

    def player_stats(self, player_id, **filtros) -> dict:
        return self._call(f"/players/{player_id}/stats/", filtros or None, ttl=_TTL_STATS)

    def lineups(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/lineups/", ttl=_TTL_LINEUP)

    def team_stats(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/team-stats/", ttl=_TTL_STATS)

    def event_stats(self, event_id) -> dict:
        # Stats de TIME por partida (/team-stats/ dá 404). Forma:
        # {stats: {home: {corner_kicks, total_tackles, ...}, away: {...}}, ...}
        return self._call(f"/events/{event_id}/stats/", ttl=_TTL_STATS)

    def event_odds(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/odds/", ttl=_TTL_ODDS)

    def odds_by_book(self, event_id, market: str, book: str) -> dict:
        params = {"market": market, "book": book}
        return self._call(f"/events/{event_id}/odds/", params, ttl=_TTL_ODDS)

    def national_pool(self, team_id) -> dict:
        return self._call("/players/", {"national_team_id": team_id}, ttl=_TTL_STATS)

    def squad(self, team_id) -> dict:
        return self._call(f"/teams/{team_id}/squad/", ttl=_TTL_STATS)

    def leagues(self, **filtros) -> dict:
        return self._call("/leagues/", filtros or None, ttl=_TTL_ETERNAL)
