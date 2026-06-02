import requests
from odd_analyzer.config import get_required

APIFOOTBALL_BASE = "https://v3.football.api-sports.io"

def check_lineup_coverage(leagues_json: dict, league_id: int, season: int) -> bool:
    """True se a liga/temporada cobre escalações pré-jogo (coverage.fixtures.lineups)."""
    for item in leagues_json.get("response", []):
        if item.get("league", {}).get("id") != league_id:
            continue
        for s in item.get("seasons", []):
            if s.get("year") == season:
                return bool(s.get("coverage", {}).get("fixtures", {}).get("lineups"))
    return False

def fetch_league(league_id: int) -> dict:
    key = get_required("APIFOOTBALL_KEY")
    resp = requests.get(
        f"{APIFOOTBALL_BASE}/leagues",
        params={"id": str(league_id)},
        headers={"x-apisports-key": key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
