from odd_analyzer.ai.schema import validate_ia_output

CANDS = [{"jogador": "Vinicius Jr", "linha": 0.5}, {"jogador": "Raphinha", "linha": 1.5}]

def _ok():
    return {
        "melhor_aposta": {"jogador": "Vinicius Jr", "linha": 0.5,
                          "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge alto"},
        "outras": [], "alertas": [],
    }

def test_saida_valida():
    assert validate_ia_output(_ok(), CANDS) is True

def test_melhor_aposta_nula_e_valida():
    assert validate_ia_output({"melhor_aposta": None, "outras": [], "alertas": ["nada"]}, CANDS) is True

def test_rejeita_jogador_inventado():
    bad = _ok()
    bad["melhor_aposta"]["jogador"] = "Neymar"  # não está nos candidatos
    assert validate_ia_output(bad, CANDS) is False

def test_rejeita_veredito_invalido():
    bad = _ok()
    bad["melhor_aposta"]["veredito"] = "TALVEZ"
    assert validate_ia_output(bad, CANDS) is False

def test_rejeita_falta_de_chave():
    assert validate_ia_output({"melhor_aposta": None}, CANDS) is False

def test_rejeita_nao_dict():
    assert validate_ia_output(["x"], CANDS) is False

def test_rejeita_confianca_invalida():
    bad = _ok()
    bad["melhor_aposta"]["confianca"] = "altissima"  # fora de {alta,media,baixa}
    assert validate_ia_output(bad, CANDS) is False

def test_rejeita_jogador_inventado_em_outras():
    bad = _ok()
    bad["outras"] = [{"jogador": "Neymar", "linha": 0.5, "veredito": "APOSTAR",
                      "confianca": "alta", "motivo": "x"}]  # jogador fora dos candidatos
    assert validate_ia_output(bad, CANDS) is False

def test_rejeita_outra_nao_dict():
    bad = _ok()
    bad["outras"] = [42]  # item não-dict em outras
    assert validate_ia_output(bad, CANDS) is False
