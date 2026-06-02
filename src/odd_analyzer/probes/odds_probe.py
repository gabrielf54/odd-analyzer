import requests
from odd_analyzer.config import get_required
from odd_analyzer.odds_math import american_to_decimal

SGO_BASE = "https://api.sportsgameodds.com/v2"

def fetch_wc_events_with_sot(limit: int = 5) -> dict:
    """Busca eventos de futebol internacional na SGO filtrando SOT player props.
    Retorna o JSON cru (para inspeção e para alimentar parse_sot_props)."""
    key = get_required("SGO_API_KEY")
    resp = requests.get(
        f"{SGO_BASE}/events",
        params={
            "leagueID": "INTERNATIONAL_SOCCER",
            "oddsAvailable": "true",
            "limit": str(limit),
        },
        headers={"X-Api-Key": key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

def parse_sot_props(event: dict) -> list[dict]:
    """Extrai props de Shots on Target (over/under) de um evento da SGO.
    Retorna lista de dicts: {player_id, player_name, line, bookmakers:{book:{over,under}}}."""
    players = event.get("players", {})
    odds = event.get("odds", {})
    grouped: dict[tuple, dict] = {}
    for odd in odds.values():
        if odd.get("statID") != "shots_on_target" or odd.get("betTypeID") != "ou":
            continue
        side = odd.get("sideID")
        if side not in ("over", "under"):
            continue
        player_id = odd.get("playerID")
        for book, b in odd.get("byBookmaker", {}).items():
            if not b.get("available", True):
                continue
            line = float(b["overUnder"])
            key = (player_id, line)
            entry = grouped.setdefault(key, {
                "player_id": player_id,
                "player_name": players.get(player_id, {}).get("name", player_id),
                "line": line,
                "bookmakers": {},
            })
            entry["bookmakers"].setdefault(book, {})[side] = american_to_decimal(b["odds"])
    return list(grouped.values())
