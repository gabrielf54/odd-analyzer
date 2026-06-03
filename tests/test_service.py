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


from odd_analyzer.service import resultado_real_jogador

def test_resultado_real_jogador_calcula_bateu():
    class _C:
        def event_player_stats(self, eid):
            return {"player_stats": [
                {"player_id": 1867, "total_tackle": 3, "minutes_played": 90},
                {"player_id": 1861, "total_tackle": 1, "minutes_played": 90},
            ]}
    res = resultado_real_jogador(_C(), event_id=7166, market_key="desarmes", linha=1.5)
    assert res["1867"]["valor_real"] == 3
    assert res["1867"]["bateu"] is True
    assert res["1861"]["bateu"] is False


import pytest
from odd_analyzer.service import apostar_paper
from odd_analyzer.store.repo import InMemoryRepo

_CAND = {
    "jogador": "Kaiki", "linha": 1.5, "odd": 1.90, "market_type": "desarmes",
    "prob_modelo": 0.73, "prob_devig": 0.55, "edge": 0.18, "ev": 0.24,
}

def test_apostar_paper_grava_no_ledger():
    repo = InMemoryRepo()
    apostar_paper(repo, event_id="7166", candidato=_CAND, em_validacao=False)
    assert len(repo.ledger) == 1
    row = repo.ledger[0]
    assert row["event_id"] == "7166" and row["jogador"] == "Kaiki"
    assert row["market_type"] == "desarmes" and row["odd_flag"] == 1.90

def test_apostar_paper_bloqueia_em_validacao():
    repo = InMemoryRepo()
    with pytest.raises(ValueError):
        apostar_paper(repo, event_id="7166", candidato=_CAND, em_validacao=True)
    assert repo.ledger == []


from odd_analyzer.service import listar_ligas

def test_listar_ligas_mapeia_e_ordena_por_nome():
    class _C:
        def leagues(self, **kw):
            assert kw.get("limit") == 200
            return {"count": 3, "results": [
                {"id": 9, "name": "Brasileirão Serie A", "country": "Brazil"},
                {"id": 27, "name": "World Cup 2026", "country": "International"},
                {"id": 34, "name": "Brasileirão Serie B", "country": "Brazil"},
            ]}
    ligas = listar_ligas(_C())
    assert [l["id"] for l in ligas] == [9, 34, 27]  # ordenado por nome
    assert ligas[0]["nome"] == "Brasileirão Serie A" and ligas[0]["pais"] == "Brazil"


def test_analisar_repassa_escopo_historico(monkeypatch):
    import odd_analyzer.service as svc
    capturado = {}

    def fake_run_analise(client, event_id, market_key, player_ref, linha, odd_over,
                         odd_under, usar_ia=False, repo=None, escopo_historico="todos",
                         league_id=None):
        capturado["escopo"] = escopo_historico
        capturado["league_id"] = league_id
        return {"candidatos": [], "ia": {}}

    class _C:
        def get_event(self, eid): return {"home_team": "A", "away_team": "B"}

    monkeypatch.setattr(svc, "run_analise", fake_run_analise)
    out = svc.analisar(_C(), "900", "desarmes", 1.5, 1.8, 2.0,
                       escopo_historico="selecao", league_id=64)
    assert capturado["escopo"] == "selecao"
    assert capturado["league_id"] == 64
    assert out["em_validacao"] is False


def test_listar_jogos_inclui_league_id():
    from odd_analyzer import service

    class _C:
        def events(self, **kw):
            return {"results": [
                {"id": 900, "home_team": "A", "away_team": "B", "event_date": "2026-03-01",
                 "status": "finished", "home_score": 1, "away_score": 0, "league_id": 64},
                {"id": 901, "home_team": "C", "away_team": "D", "event_date": "2026-03-02",
                 "status": "finished"},  # sem league_id na linha → usa o argumento
            ]}

    jogos = service.listar_jogos(_C(), league_id=64, status="finished")
    assert jogos[0]["league_id"] == 64
    assert jogos[1]["league_id"] == 64  # fallback pro argumento


from odd_analyzer.service import escalacao_provavel


def test_escalacao_provavel_usa_lineup_quando_existe():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "Flamengo", "away_team": "Palmeiras",
                    "home_team_id": 150, "away_team_id": 160}
        def lineups(self, eid):
            return {"lineup_status": "confirmed", "lineups": {
                "home": {"team_id": 150, "players": [
                    {"id": 11, "name": "Wesley", "position": "D"},
                    {"id": 12, "name": "Gerson", "position": "M"}]},
                "away": {"team_id": 160, "players": [
                    {"id": 21, "name": "Piquerez", "position": "D"}]}}}
    esc = escalacao_provavel(_C(), event_id=7000)
    assert esc["origem"] == "confirmada"
    assert esc["home"]["team_name"] == "Flamengo" and esc["home"]["team_id"] == "150"
    nomes_home = [p["name"] for p in esc["home"]["jogadores"]]
    assert nomes_home == ["Wesley", "Gerson"]
    assert esc["home"]["jogadores"][0]["id"] == "11"  # id vira string
    assert esc["home"]["jogadores"][0]["posicao"] == "D"
    assert [p["name"] for p in esc["away"]["jogadores"]] == ["Piquerez"]


def test_escalacao_provavel_marca_provavel_sem_confirmacao():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "A", "away_team": "B",
                    "home_team_id": 1, "away_team_id": 2}
        def lineups(self, eid):
            return {"lineups": {
                "home": {"team_id": 1, "players": [{"id": 9, "name": "X", "position": "F"}]},
                "away": {"team_id": 2, "players": []}}}
    esc = escalacao_provavel(_C(), event_id=1)
    assert esc["origem"] == "provavel"


def test_escalacao_provavel_fallback_ultimos3():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "A", "away_team": "B",
                    "home_team_id": 1, "away_team_id": 2}
        def lineups(self, eid):
            return {"lineups": {"home": {"team_id": 1, "players": []},
                                "away": {"team_id": 2, "players": []}}}
        def events(self, **kw):
            assert kw.get("status") == "finished"
            return {"results": [{"id": 501}, {"id": 502}, {"id": 503}]}
        def event_player_stats(self, eid):
            return {"player_stats": [
                {"player_id": 100, "name": "Joao", "position": "D", "minutes_played": 90},
                {"player_id": 101, "name": "Pedro", "minutes_played": 0},   # não jogou
                {"player_id": 100, "name": "Joao", "minutes_played": 45},   # dup → 1 vez
            ]}
    esc = escalacao_provavel(_C(), event_id=1)
    assert esc["origem"] == "ultimos3"
    ids = [p["id"] for p in esc["home"]["jogadores"]]
    assert ids == ["100"]                      # Pedro (0 min) fora; Joao deduplicado
    assert esc["home"]["jogadores"][0]["name"] == "Joao"


from odd_analyzer.service import media_recente_jogador


def test_media_recente_jogador_agrega_stat_do_mercado():
    class _C:
        def player_stats(self, pid):
            return {"results": [
                {"total_tackle": 2}, {"total_tackle": 4}, {"total_tackle": 3}]}
    mr = media_recente_jogador(_C(), event_id=1, market_key="desarmes", player_id=100)
    assert mr["jogos"] == 3
    assert mr["media"] == 3.0


def test_media_recente_jogador_sem_dado_retorna_zero():
    class _C:
        def player_stats(self, pid):
            return {"results": []}
    mr = media_recente_jogador(_C(), event_id=1, market_key="desarmes", player_id=100)
    assert mr == {"media": 0.0, "jogos": 0}


def test_media_recente_jogador_mercado_invalido():
    class _C:
        def player_stats(self, pid):
            return {"results": []}
    with pytest.raises(ValueError):
        media_recente_jogador(_C(), event_id=1, market_key="xxx", player_id=100)
