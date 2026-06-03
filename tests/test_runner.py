"""Tests do runner (T5): normalização do evento real + filtro de jogador único.

A cola de rede/print é exercida no e2e (test_runner_e2e). Aqui ficam as duas
funções puras testáveis: normalize_event e o wrapper OnlyPlayer.
"""
from odd_analyzer.runner import normalize_event, OnlyPlayer

# Forma REAL de /events/{id}/ (flat; home_team é NOME, ids separados).
RAW_EVENT = {
    "id": 7166,
    "home_team_id": 150,
    "home_team": "Cruzeiro",
    "away_team_id": 153,
    "away_team": "Fluminense",
    "status": "finished",
}


def test_normalize_event_estrutura_aninhada_com_strings():
    evt = normalize_event(RAW_EVENT)
    assert evt["id"] == "7166"
    assert evt["home_team"] == {"id": "150", "name": "Cruzeiro"}
    assert evt["away_team"] == {"id": "153", "name": "Fluminense"}


def test_normalize_event_monta_rotulo_jogo():
    evt = normalize_event(RAW_EVENT)
    assert evt["jogo"] == "Cruzeiro x Fluminense"


class _FakeProvider:
    def elenco(self, event):
        return [
            {"id": "3946", "name": "Otávio", "team_id": "150", "posicao": "G"},
            {"id": "1867", "name": "M. Pereira", "team_id": "150", "posicao": "M"},
            {"id": "2001", "name": "Fábio", "team_id": "153", "posicao": "G"},
        ]
    def entity_taxa(self, entity_id, market, contexto):
        return {"sentinel": entity_id}
    def team_rates(self, team_id, contexto):
        return None


def test_onlyplayer_filtra_por_id():
    prov = OnlyPlayer(_FakeProvider(), "1867")
    elenco = prov.elenco({"id": "7166"})
    assert len(elenco) == 1
    assert elenco[0]["id"] == "1867"


def test_onlyplayer_filtra_por_nome_case_insensitive_substring():
    prov = OnlyPlayer(_FakeProvider(), "pereira")
    elenco = prov.elenco({"id": "7166"})
    assert len(elenco) == 1
    assert elenco[0]["name"] == "M. Pereira"


def test_onlyplayer_delega_entity_taxa_e_team_rates():
    prov = OnlyPlayer(_FakeProvider(), "1867")
    assert prov.entity_taxa("1867", None, {})["sentinel"] == "1867"
    assert prov.team_rates("150", {}) is None


def test_onlyplayer_levanta_se_jogador_nao_encontrado():
    prov = OnlyPlayer(_FakeProvider(), "9999")
    try:
        prov.elenco({"id": "7166"})
        assert False, "deveria levantar"
    except ValueError as e:
        assert "9999" in str(e)
