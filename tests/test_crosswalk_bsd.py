"""Crosswalk BSD: o lineup usa player_ids de um namespace que NÃO resolve em
/players/{id}/stats/; o histórico de stats usa outro. Estes testes (offline, com
fakes) provam que casamos o NOME da escalação ao stats-id real."""
from odd_analyzer.crosswalk.bsd_ids import construir_mapa_time, resolver


class FakeClient:
    """events(team)→2 jogos finalizados; event_player_stats→linhas com player_id+team_id;
    player(id)→nome. Conta chamadas p/ provar que é barato/deduplicado."""
    def __init__(self):
        self.player_calls = []
        self.events_kw = None

    def events(self, **kw):
        self.events_kw = kw
        return {"results": [{"id": 9001}, {"id": 9002}]}

    def event_player_stats(self, event_id):
        # mesmos jogadores nos 2 jogos (testa dedupe); 999 é de outro time (ignorar)
        return {"player_stats": [
            {"player_id": 387, "team_id": 489},
            {"player_id": 761, "team_id": 489},
            {"player_id": 999, "team_id": 645},
        ]}

    def player(self, player_id):
        self.player_calls.append(player_id)
        nomes = {387: "Enzo Fernández", 761: "Nahuel Molina", 999: "Outro"}
        return {"id": player_id, "name": nomes[player_id]}


def test_construir_mapa_filtra_time_e_deduplica():
    c = FakeClient()
    mapa = construir_mapa_time(c, "489", n_jogos=5)
    assert mapa == [
        {"id": "387", "name": "Enzo Fernández"},
        {"id": "761", "name": "Nahuel Molina"},
    ]
    # só jogadores do time pedido (999 fora); dedupe → 2 chamadas player(), não 4
    assert c.player_calls == [387, 761]
    assert c.events_kw == {"team_id": "489", "status": "finished", "limit": 5}


def test_construir_mapa_time_vazio_sem_team_id():
    assert construir_mapa_time(FakeClient(), "", n_jogos=5) == []


def test_resolver_casa_nome_para_stats_id_e_preserva_campos():
    mapa = [{"id": "387", "name": "Enzo Fernández"}, {"id": "761", "name": "Nahuel Molina"}]
    jogadores = [
        {"id": "974505", "name": "Enzo Fernández", "team_id": "489", "posicao": "M"},
    ]
    out = resolver(jogadores, mapa)
    assert out == [
        {"id": "387", "name": "Enzo Fernández", "team_id": "489", "posicao": "M"},
    ]


def test_resolver_dropa_sem_match_fail_closed():
    mapa = [{"id": "387", "name": "Enzo Fernández"}]
    jogadores = [
        {"id": "974505", "name": "Enzo Fernández", "team_id": "489", "posicao": "M"},
        {"id": "111", "name": "Ninguém Desconhecido", "team_id": "489", "posicao": "D"},
    ]
    out = resolver(jogadores, mapa)
    assert [p["id"] for p in out] == ["387"]
