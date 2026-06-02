from odd_analyzer.odds_math import american_to_decimal

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
