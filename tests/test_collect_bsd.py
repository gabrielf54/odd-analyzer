from odd_analyzer.backtest.collect_bsd import collect_bsd, collect_bsd_team

class _FakeBSD:
    """2 jogos finalizados, 2 jogadores por time."""
    def events(self, **kw):
        return {"results": [
            {"id": 1, "home_team_id": 10, "away_team_id": 20},
            {"id": 2, "home_team_id": 10, "away_team_id": 20},
        ]}
    def event_player_stats(self, eid):
        # time 10 faz 3 SOT, time 20 faz 1 SOT, em cada jogo
        return {"player_stats": [
            {"player_id": 100, "team_id": 10, "minutes_played": 90, "shots_on_target": 2},
            {"player_id": 101, "team_id": 10, "minutes_played": 90, "shots_on_target": 1},
            {"player_id": 200, "team_id": 20, "minutes_played": 90, "shots_on_target": 1},
            {"player_id": 201, "team_id": 20, "minutes_played": 0,  "shots_on_target": 0},  # não jogou
        ]}

class _FakeBSDTeam:
    def events(self, **kw):
        return {"results": [
            {"id": 1, "home_team_id": 10, "away_team_id": 20},
            {"id": 2, "home_team_id": 10, "away_team_id": 30},
        ]}
    def event_stats(self, eid):
        return {"stats": {"home": {"corner_kicks": 6}, "away": {"corner_kicks": 4}}}

def test_collect_bsd_team_totais_por_jogo():
    totais, by_team = collect_bsd_team(_FakeBSDTeam(), 9, 2, "corner_kicks")
    assert totais == [10, 10]                  # 6+4 em cada jogo
    assert by_team[10] == [6, 6]               # corners-for do time 10 nos 2 jogos


def test_collect_bsd_monta_records_e_conceded():
    meta, records, conceded_pg, league_avg, hf, af = collect_bsd(
        _FakeBSD(), league_id=9, n_events=2, stat_field="shots_on_target")
    assert meta == {1: (10, 20), 2: (10, 20)}
    # jogador 201 com 0 minutos é descartado; os outros 3 entram em 2 jogos = 6 records
    assert len(records) == 6
    # time 20 concede o que o time 10 produz (3 SOT/jogo)
    assert abs(conceded_pg[20] - 3.0) < 1e-9
    assert abs(conceded_pg[10] - 1.0) < 1e-9
    assert hf > 0 and af > 0
