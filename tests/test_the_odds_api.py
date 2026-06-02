from odd_analyzer.odds.the_odds_api import parse_sot_props

# formato real do The Odds API: event -> bookmakers[] -> markets[] (key) -> outcomes[]
EVENT = {
    "id": "evt1",
    "bookmakers": [{
        "key": "draftkings",
        "markets": [{
            "key": "player_shots_on_target",
            "outcomes": [
                {"description": "Vinicius Jr", "name": "Over", "point": 0.5, "price": 1.72},
                {"description": "Vinicius Jr", "name": "Under", "point": 0.5, "price": 2.10},
                {"description": "Raphinha", "name": "Over", "point": 1.5, "price": 2.40},
                {"description": "Raphinha", "name": "Under", "point": 1.5, "price": 1.55},
            ],
        }],
    }],
}

def test_parse_agrupa_over_under_por_jogador_linha():
    props = parse_sot_props(EVENT)
    vini = [p for p in props if p["player_name"] == "Vinicius Jr"][0]
    assert vini["line"] == 0.5
    assert vini["book"] == "draftkings"
    assert vini["odd_over"] == 1.72
    assert vini["odd_under"] == 2.10

def test_parse_ignora_prop_sem_os_dois_lados():
    ev = {"id": "e", "bookmakers": [{"key": "dk", "markets": [{"key": "player_shots_on_target",
          "outcomes": [{"description": "X", "name": "Over", "point": 0.5, "price": 1.9}]}]}]}
    assert parse_sot_props(ev) == []

def test_parse_vazio_quando_sem_mercado():
    assert parse_sot_props({"id": "e", "bookmakers": []}) == []
