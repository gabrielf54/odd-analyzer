import json
from pathlib import Path
from odd_analyzer.probes.lineups_probe import check_lineup_coverage

FIXTURE = Path(__file__).parent / "fixtures" / "apifootball_leagues_sample.json"

def load():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))

def test_cobertura_true_para_copa_2026():
    assert check_lineup_coverage(load(), league_id=1, season=2026) is True

def test_temporada_inexistente_false():
    assert check_lineup_coverage(load(), league_id=1, season=2030) is False

def test_liga_inexistente_false():
    assert check_lineup_coverage(load(), league_id=999, season=2026) is False
