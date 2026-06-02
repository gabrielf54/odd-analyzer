import json
from pathlib import Path

import pytest

from odd_analyzer.probes.odds_probe import parse_sot_props

FIXTURE = Path(__file__).parent / "fixtures" / "sgo_event_sample.json"

def load_event():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return data["data"][0]

def test_extrai_apenas_sot_over_under():
    props = parse_sot_props(load_event())
    assert len(props) == 1
    p = props[0]
    assert p["player_id"] == "PLAYER_VINI"
    assert p["player_name"] == "Vinicius Junior"
    assert p["line"] == 1.5

def test_agrega_over_under_por_bookmaker():
    p = parse_sot_props(load_event())[0]
    assert set(p["bookmakers"].keys()) == {"draftkings", "bet365"}
    assert p["bookmakers"]["bet365"]["over"] == pytest.approx(1.83)
    assert p["bookmakers"]["bet365"]["under"] == pytest.approx(1.90)
    assert p["bookmakers"]["draftkings"]["over"] == pytest.approx(1.8333, abs=1e-4)
    assert p["bookmakers"]["draftkings"]["under"] == pytest.approx(1.9091, abs=1e-4)

def test_evento_sem_sot_retorna_vazio():
    assert parse_sot_props({"odds": {}}) == []
