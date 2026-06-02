from odd_analyzer.probes.report import build_viability_report


def test_go_quando_todos_passam():
    r = build_viability_report(odds_ok=True, stats_ok=True, lineups_ok=True, detalhes={})
    assert "VEREDITO: GO" in r
    assert "Odds (SGO): GO" in r


def test_nogo_quando_um_falha():
    r = build_viability_report(odds_ok=True, stats_ok=False, lineups_ok=True,
                               detalhes={"stats": "FBref sem SoT; testar Sofascore"})
    assert "VEREDITO: NO-GO" in r
    assert "Stats: NO-GO" in r
    assert "testar Sofascore" in r
