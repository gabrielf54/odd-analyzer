"""Match-market odds via The Odds API (gols=totals, vitoria=h2h) — offline, fakes.
Cobre os parsers (parse_totals/parse_h2h/find_event/_norm_team) e o provider
TheOddsApiMatchOdds (casa o evento do BSD com o evento do The Odds API por NOME)."""
from odd_analyzer.odds.the_odds_api import (
    parse_totals, parse_h2h, find_event, _norm_team,
)
from odd_analyzer.providers.odds import TheOddsApiMatchOdds
from odd_analyzer.model.markets import MARKETS

# Forma real do The Odds API (confirmada na key do usuário, 2026-06-03).
EVENTS = [
    {"id": "abc", "home_team": "Mexico", "away_team": "South Africa",
     "commence_time": "2026-06-11T19:00:00Z"},
    {"id": "xyz", "home_team": "USA", "away_team": "Paraguay",
     "commence_time": "2026-06-13T01:00:00Z"},
]

ODDS_TOTALS = {
    "id": "abc",
    "bookmakers": [
        {"key": "pinnacle", "markets": [{"key": "totals", "outcomes": [
            {"name": "Over", "point": 2.5, "price": 1.95},
            {"name": "Under", "point": 2.5, "price": 1.90},
        ]}]},
        {"key": "betfair_ex_eu", "markets": [{"key": "totals", "outcomes": [
            {"name": "Over", "point": 2.5, "price": 1.97},
            {"name": "Under", "point": 2.5, "price": 1.93},
        ]}]},
    ],
}

ODDS_H2H = {
    "id": "abc",
    "bookmakers": [
        {"key": "pinnacle", "markets": [{"key": "h2h", "outcomes": [
            {"name": "Mexico", "price": 2.10},
            {"name": "South Africa", "price": 3.60},
            {"name": "Draw", "price": 3.20},
        ]}]},
    ],
}


# ---- _norm_team ----

def test_norm_team_lowercase_strip_accents_punct():
    assert _norm_team("Bosnia & Herzegovina") == "bosniaherzegovina"
    assert _norm_team("  Côte d'Ivoire ") == "cotedivoire"
    assert _norm_team("USA") == "usa"


# ---- find_event ----

def test_find_event_matches_by_normalized_pair():
    ev = find_event(EVENTS, "Mexico", "South Africa")
    assert ev is not None and ev["id"] == "abc"

def test_find_event_is_order_aware():
    # invertido (away vira home) NÃO casa — mando importa pro 1X2
    assert find_event(EVENTS, "South Africa", "Mexico") is None

def test_find_event_none_when_absent():
    assert find_event(EVENTS, "Brazil", "Croatia") is None


# ---- parse_totals ----

def test_parse_totals_groups_over_under_per_book_and_point():
    linhas = parse_totals(ODDS_TOTALS)
    assert len(linhas) == 2  # 2 casas, mesma linha 2.5
    pin = [l for l in linhas if l["book"] == "pinnacle"][0]
    assert pin["entidade"] == "partida" and pin["linha"] == 2.5
    assert pin["odd_over"] == 1.95 and pin["odd_under"] == 1.90

def test_parse_totals_skips_incomplete_pair():
    one = {"id": "e", "bookmakers": [{"key": "pinnacle", "markets": [{"key": "totals",
           "outcomes": [{"name": "Over", "point": 2.5, "price": 1.95}]}]}]}
    assert parse_totals(one) == []

def test_parse_totals_empty_when_no_bookmakers():
    assert parse_totals({"id": "e", "bookmakers": []}) == []


# ---- parse_h2h ----

def test_parse_h2h_maps_home_over_away_under_keeps_draw():
    linhas = parse_h2h(ODDS_H2H, "Mexico", "South Africa")
    assert len(linhas) == 1
    l = linhas[0]
    assert l["odd_over"] == 2.10   # home
    assert l["odd_under"] == 3.60  # away
    assert l["odd_draw"] == 3.20
    assert l["book"] == "pinnacle"

def test_parse_h2h_skips_book_missing_a_side():
    odds = {"bookmakers": [{"key": "x", "markets": [{"key": "h2h", "outcomes": [
        {"name": "Mexico", "price": 2.1}, {"name": "Draw", "price": 3.2}]}]}]}
    assert parse_h2h(odds, "Mexico", "South Africa") == []


# ---- TheOddsApiMatchOdds (provider) ----

EVENT_BSD = {"id": "7001", "home_team": {"id": "1", "name": "Mexico"},
             "away_team": {"id": "2", "name": "South Africa"}}

def _provider(odds_payload):
    return TheOddsApiMatchOdds(
        fetch_events_fn=lambda sport: EVENTS,
        fetch_event_odds_fn=lambda sport, eid, markets, regions: odds_payload,
    )

def test_provider_gols_returns_totals_linhas():
    linhas = _provider(ODDS_TOTALS).linhas(EVENT_BSD, MARKETS["gols"])
    assert len(linhas) == 2
    assert all(l["odd_over"] and l["odd_under"] for l in linhas)

def test_provider_vitoria_returns_h2h_linhas():
    linhas = _provider(ODDS_H2H).linhas(EVENT_BSD, MARKETS["vitoria"])
    assert len(linhas) == 1 and linhas[0]["odd_draw"] == 3.20

def test_provider_uses_right_oddsapi_market():
    seen = {}
    def fake_odds(sport, eid, markets, regions):
        seen["m"] = markets
        return ODDS_TOTALS
    prov = TheOddsApiMatchOdds(fetch_events_fn=lambda sport: EVENTS,
                               fetch_event_odds_fn=fake_odds)
    prov.linhas(EVENT_BSD, MARKETS["gols"])
    assert seen["m"] == "totals"

def test_provider_empty_when_event_not_matched():
    prov = TheOddsApiMatchOdds(
        fetch_events_fn=lambda sport: [],  # nenhum evento casa
        fetch_event_odds_fn=lambda sport, eid, markets, regions: ODDS_TOTALS,
    )
    assert prov.linhas(EVENT_BSD, MARKETS["gols"]) == []

def test_provider_empty_for_unsupported_market():
    # mercado de jogador não é de partida → provider não serve, retorna []
    assert _provider(ODDS_TOTALS).linhas(EVENT_BSD, MARKETS["desarmes"]) == []

def test_provider_swallows_fetch_errors():
    def boom(*a, **k): raise RuntimeError("network")
    prov = TheOddsApiMatchOdds(fetch_events_fn=boom,
                               fetch_event_odds_fn=lambda *a, **k: ODDS_TOTALS)
    assert prov.linhas(EVENT_BSD, MARKETS["gols"]) == []
