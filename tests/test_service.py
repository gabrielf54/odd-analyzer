from odd_analyzer.service import listar_jogos

class _FakeClient:
    def events(self, **kw):
        assert kw.get("status") == "finished"
        return {"results": [
            {"id": 7166, "home_team": "Cruzeiro", "away_team": "Fluminense",
             "event_date": "2026-05-31T23:30:00+00:00", "status": "finished",
             "home_score": 1, "away_score": 1},
            {"id": 7171, "home_team": "Remo", "away_team": "São Paulo",
             "event_date": "2026-05-31T23:30:00+00:00", "status": "finished",
             "home_score": 1, "away_score": 0},
        ]}

def test_listar_jogos_mapeia_forma_bsd():
    jogos = listar_jogos(_FakeClient(), league_id=9, status="finished", limit=50)
    assert len(jogos) == 2
    j = jogos[0]
    assert j["id"] == 7166
    assert j["mandante"] == "Cruzeiro" and j["visitante"] == "Fluminense"
    assert j["status"] == "finished"
    assert j["placar"] == "1×1"

def test_listar_jogos_sem_placar_quando_nao_finalizado():
    class _C:
        def events(self, **kw):
            return {"results": [
                {"id": 99, "home_team": "A", "away_team": "B",
                 "event_date": "2026-07-01T00:00:00+00:00", "status": "notstarted",
                 "home_score": None, "away_score": None},
            ]}
    jogos = listar_jogos(_C(), league_id=9, status="notstarted")
    assert jogos[0]["placar"] is None
