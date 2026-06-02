from odd_analyzer.crosswalk.match import normalize, match_player

ELENCO = [{"id": 1, "name": "Vinícius Júnior"}, {"id": 2, "name": "Raphael Dias Belloli"}]

def test_normalize_remove_acento_e_caixa():
    assert normalize("Vinícius Júnior") == "vinicius junior"

def test_match_exato_com_acento_diferente():
    m = match_player("Vinicius Junior", ELENCO)
    assert m["id"] == 1
    assert m["confianca"] >= 0.9

def test_fail_closed_sem_match():
    assert match_player("Cristiano Ronaldo", ELENCO) is None

def test_override_manual_tem_prioridade():
    m = match_player("Raphinha", ELENCO, overrides={"raphinha": 2})
    assert m["id"] == 2
    assert m["confianca"] == 1.0

def test_override_aceita_chave_nao_normalizada():
    # chave com acento/caixa é normalizada internamente (evita override ignorado em silêncio)
    m = match_player("Raphinha", ELENCO, overrides={"Raphinha": 2})
    assert m["id"] == 2
    assert m["confianca"] == 1.0
