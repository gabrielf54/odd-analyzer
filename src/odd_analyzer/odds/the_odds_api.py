"""The Odds API v4: lista de eventos (0 créditos) e props de SOT por jogador.
parse_sot_props agrupa Over/Under por (jogador, linha) num só registro."""
import requests
from odd_analyzer.config import get_required
from odd_analyzer.cache import cached_get

BASE = "https://api.the-odds-api.com/v4"
SOT_MARKET = "player_shots_on_target"

def _get(path: str, params: dict) -> object:
    key = get_required("THE_ODDS_API_KEY")
    p = dict(params, apiKey=key)
    keystr = f"{path}?{sorted((k, v) for k, v in p.items() if k != 'apiKey')}"
    def fetch():
        r = requests.get(f"{BASE}/{path}", params=p, timeout=30)
        r.raise_for_status()
        return r.json()
    return cached_get(keystr, fetch, should_cache=lambda d: bool(d))

def fetch_events(sport_key: str) -> list[dict]:
    """Eventos do esporte (0 créditos). Ex.: sport_key='soccer_fifa_world_cup'."""
    return _get(f"sports/{sport_key}/events", {})

def fetch_event_odds(sport_key: str, event_id: str,
                     markets: str = SOT_MARKET, regions: str = "us") -> dict:
    return _get(f"sports/{sport_key}/events/{event_id}/odds",
                {"markets": markets, "regions": regions, "oddsFormat": "decimal"})

def parse_sot_props(event: dict) -> list[dict]:
    """Agrupa outcomes Over/Under em props {player_name, line, book, odd_over, odd_under}.
    Descarta jogador/linha sem os dois lados (não dá p/ de-vig)."""
    grouped: dict[tuple, dict] = {}
    for bm in event.get("bookmakers", []):
        book = bm.get("key")
        for mk in bm.get("markets", []):
            if mk.get("key") != SOT_MARKET:
                continue
            for o in mk.get("outcomes", []):
                player, line, name, price = (o.get("description"), o.get("point"),
                                             (o.get("name") or "").lower(), o.get("price"))
                if player is None or line is None or price is None:
                    continue
                e = grouped.setdefault((book, player, line),
                                       {"player_name": player, "line": line, "book": book,
                                        "odd_over": None, "odd_under": None})
                if name == "over":
                    e["odd_over"] = price
                elif name == "under":
                    e["odd_under"] = price
    return [p for p in grouped.values() if p["odd_over"] and p["odd_under"]]
