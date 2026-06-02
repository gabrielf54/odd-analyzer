import requests
from odd_analyzer.config import get_required

BASE = "https://v3.football.api-sports.io"

def parse_player_sot(player_entry: dict, league_id: int) -> dict | None:
    """Extrai a taxa de SOT por 90 de um jogador para uma liga específica.
    Retorna None se a liga não estiver presente ou faltar dado (minutos/shots)."""
    pid = player_entry.get("player", {}).get("id")
    name = player_entry.get("player", {}).get("name")
    for s in player_entry.get("statistics", []):
        if (s.get("league") or {}).get("id") != league_id:
            continue
        minutes = (s.get("games") or {}).get("minutes")
        shots_on = (s.get("shots") or {}).get("on")
        if not minutes or shots_on is None:
            return None
        return {
            "player_id": pid,
            "name": name,
            "team": (s.get("team") or {}).get("name"),
            "minutes": minutes,
            "apps": (s.get("games") or {}).get("appearences"),
            "shots_total": (s.get("shots") or {}).get("total"),
            "shots_on": shots_on,
            "sot_per90": shots_on / minutes * 90.0,
        }
    return None

def fetch_players_page(league_id: int, season: int, page: int = 1) -> dict:
    """Busca uma página de /players (estatísticas de jogador da liga/temporada)."""
    key = get_required("APIFOOTBALL_KEY")
    r = requests.get(f"{BASE}/players",
                     params={"league": str(league_id), "season": str(season), "page": str(page)},
                     headers={"x-apisports-key": key}, timeout=30)
    r.raise_for_status()
    return r.json()
