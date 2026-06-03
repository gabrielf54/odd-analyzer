from odd_analyzer.pipeline import _contagem_jogador
from odd_analyzer.model.markets import MARKETS

class _Stats:
    def elenco(self, e):
        return [{"id": "1", "name": "Titular", "team_id": "10"},
                {"id": "2", "name": "Reserva", "team_id": "10"}]
    def xi_ids(self, event):
        return {"1"}  # só o titular está no XI confirmado
    def entity_taxa(self, entity_id, market, contexto):
        xi = contexto.get("xi_team_ids", set())
        return {"mu": 1.0, "minutos_esperados": 90.0,
                "xi_confirmado": (str(entity_id) in xi) if xi else True,
                "amostra_jogos": 12, "concedido_adversario": "n/d", "incerteza": "baixa"}

def test_contagem_jogador_passa_xi_team_ids():
    event = {"id": "1", "home_team": {"id": "10"}, "away_team": {"id": "20"}}
    linhas = [{"linha": 1.5, "odd_over": 1.9, "odd_under": 1.9}]
    cands = _contagem_jogador(event, MARKETS["desarmes"], _Stats(), linhas)
    by_player = {c["jogador"]: c for c in cands}
    assert by_player["Titular"]["xi_confirmado"] is True
    assert by_player["Reserva"]["xi_confirmado"] is False
