import json
from pathlib import Path
import pytest
from odd_analyzer.stats.apifootball import parse_player_sot

FIX = Path(__file__).parent / "fixtures" / "apifootball_players_sample.json"

def players():
    return json.loads(FIX.read_text(encoding="utf-8"))["response"]

def test_extrai_sot_per90_da_liga_certa():
    p = parse_player_sot(players()[0], league_id=39)
    assert p["player_id"] == 1100
    assert p["shots_on"] == 59
    assert p["minutes"] == 2556
    assert p["sot_per90"] == pytest.approx(59/2556*90, abs=1e-6)

def test_liga_inexistente_retorna_none():
    assert parse_player_sot(players()[0], league_id=140) is None

def test_minutos_zero_ou_shots_none_retorna_none():
    assert parse_player_sot(players()[1], league_id=39) is None
