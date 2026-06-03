from odd_analyzer.providers.stats import BSDStatsProvider
from odd_analyzer.model.markets import MARKETS


class _FakeClient:
    def __init__(self, hist): self._hist = hist
    def player_stats(self, pid): return {"results": self._hist}
    def events(self, **kw): return {"results": []}      # sem matchup (neutro)
    def event_stats(self, eid): return {"stats": {}}


def test_entity_taxa_usa_jogos_recentes_e_per90():
    # 10 jogos: os 5 MAIS RECENTES (event_id alto) com 1 tackle/90; os 5 antigos com 5/90.
    # BSD ordem decrescente (recente primeiro). w5 deve refletir os RECENTES (~1/90), não os antigos.
    recentes = [{"event_id": 100+i, "total_tackle": 1, "minutes_played": 90} for i in range(5)]
    antigos  = [{"event_id": i, "total_tackle": 5, "minutes_played": 90} for i in range(5)]
    hist = recentes + antigos        # decrescente: recentes primeiro
    prov = BSDStatsProvider(_FakeClient(hist))
    ctx = {"event": {"home_team": {"id": "1"}, "away_team": {"id": "2"}},
           "is_home": True, "entity_team_id": "1", "league_avg_conceded": 16.0}
    taxa = prov.entity_taxa("p1", MARKETS["desarmes"], ctx)
    # mu base ~ rate recente (1/90) com shrinkage; tem que ser claramente < o que daria a média antiga (5).
    assert taxa is not None
    assert taxa["mu"] < 3.0


def test_team_taxa_usa_jogos_recentes():
    # events DESC (recente primeiro): 5 jogos recentes com 4 corners, 5 antigos com 10.
    # w5 deve refletir os recentes (~4), não os antigos (10). Sem reverter, pegaria os antigos.
    recentes = [{"id": 100+i, "home_team_id": 7, "away_team_id": 99} for i in range(5)]
    antigos  = [{"id": i,     "home_team_id": 7, "away_team_id": 99} for i in range(5)]
    eventos = recentes + antigos  # DESC

    class _C:
        def events(self, **kw):
            return {"results": eventos}
        def event_stats(self, eid):
            corners = 4 if eid >= 100 else 10
            return {"stats": {"home": {"corner_kicks": corners}, "away": {"corner_kicks": 0}}}

    from odd_analyzer.providers.stats import BSDStatsProvider
    from odd_analyzer.model.markets import MARKETS
    prov = BSDStatsProvider(_C())
    ctx = {"event": {"home_team": {"id": "7"}, "away_team": {"id": "99"}},
           "is_home": True, "opp_team_id": "99", "league_avg_conceded": 5.0}
    taxa = prov.team_taxa("7", MARKETS["escanteios"], ctx)
    assert taxa is not None
    # mu base ~ corners recentes (4) * multiplicadores; muito menor do que se usasse os antigos (10).
    assert taxa["mu"] < 7.0


def test_team_rates_retorna_lambda_for():
    class _C:
        def events(self, **kw):
            return {"results": [
                {"id": 1, "home_team_id": 10, "away_team_id": 20, "home_score": 2, "away_score": 1},
                {"id": 2, "home_team_id": 30, "away_team_id": 10, "home_score": 0, "away_score": 3},
            ]}
    prov = BSDStatsProvider(_C())
    r = prov.team_rates(10, {"league_avg_goals": 1.3})
    assert r is not None and r["lambda_for"] > 0
    # time 10 marcou 2 (em casa) e 3 (fora) em 2 jogos → média 2.5
    assert abs(r["lambda_for"] - 2.5) < 1e-9
    # time 10 sofreu 1 (em casa) e 0 (fora) em 2 jogos → média 0.5
    assert abs(r["lambda_against"] - 0.5) < 1e-9


def test_entity_taxa_escopo_so_selecao_filtra_por_team_id():
    # histórico misto: 5 jogos pela seleção (team_id=1, 1 tackle) + 5 pelo clube (team_id=9, 6 tackles).
    # BSD entrega decrescente (recente primeiro).
    selecao = [{"event_id": 200+i, "team_id": 1, "total_tackle": 1, "minutes_played": 90} for i in range(5)]
    clube   = [{"event_id": 100+i, "team_id": 9, "total_tackle": 6, "minutes_played": 90} for i in range(5)]
    hist = selecao + clube
    prov = BSDStatsProvider(_FakeClient(hist))
    base_ctx = {"event": {"home_team": {"id": "1"}, "away_team": {"id": "2"}},
                "is_home": True, "entity_team_id": "1", "league_avg_conceded": 16.0}
    # só-seleção: taxa puxa pra ~1/jogo
    so_sel = prov.entity_taxa("p1", MARKETS["desarmes"], {**base_ctx, "escopo_historico": "selecao"})
    # só-clube: taxa puxa pra ~6/jogo (mu maior)
    so_clube = prov.entity_taxa("p1", MARKETS["desarmes"], {**base_ctx, "escopo_historico": "clube"})
    assert so_sel is not None and so_clube is not None
    assert so_sel["mu"] < so_clube["mu"]
    assert so_sel["amostra_jogos"] == 5 and so_clube["amostra_jogos"] == 5
