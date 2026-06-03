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


from odd_analyzer.service import analisar
from odd_analyzer.model.markets import MARKETS

def _fake_client_para_analise():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "Cruzeiro", "away_team": "Fluminense",
                    "home_team_id": 150, "away_team_id": 153}
        def lineups(self, eid):
            return {"lineups": {"home": {"team_id": 150, "players": [
                {"id": 1867, "name": "Kaiki", "position": "M"}]}, "away": {"team_id": 153, "players": []}}}
        def player_stats(self, pid):
            return {"results": [{"event_id": i, "total_tackle": 3, "minutes_played": 90} for i in range(12)]}
        def events(self, **kw):
            return {"results": []}
        def event_stats(self, eid):
            return {"stats": {}}
    return _C()

def test_analisar_jogador_retorna_estrutura():
    out = analisar(_fake_client_para_analise(), event_id=7166, market_key="desarmes",
                   linha=1.5, odd_over=1.90, odd_under=1.90, usar_ia=False)
    assert out["jogo"] == "Cruzeiro x Fluminense"
    assert out["em_validacao"] is False
    assert isinstance(out["candidatos"], list)
    assert "ia" in out

def test_analisar_marca_em_validacao_para_partida():
    out = analisar(_fake_client_para_analise(), event_id=7166, market_key="escanteios",
                   linha=8.5, odd_over=1.90, odd_under=1.90, usar_ia=False)
    assert out["em_validacao"] is True


def test_analisar_label_nao_corrompe_nome_com_x():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "Atletico", "away_team": "Ajax",
                    "home_team_id": 1, "away_team_id": 2}
        def lineups(self, eid):
            return {"lineups": {"home": {"team_id": 1, "players": []}, "away": {"team_id": 2, "players": []}}}
        def player_stats(self, pid):
            return {"results": []}
        def events(self, **kw):
            return {"results": []}
        def event_stats(self, eid):
            return {"stats": {}}
    out = analisar(_C(), event_id=1, market_key="desarmes",
                   linha=1.5, odd_over=1.90, odd_under=1.90, usar_ia=False)
    assert out["jogo"] == "Atletico x Ajax"
