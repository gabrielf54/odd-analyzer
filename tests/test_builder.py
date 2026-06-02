import pytest
from odd_analyzer.candidates.builder import build_candidate

def test_build_candidate_monta_dossie():
    c = build_candidate(
        jogador="Vinicius Jr", linha=0.5, odd_over=1.72, odd_under=2.10,
        prob_modelo=0.68, mu=1.9, minutos_esperados=88, xi_confirmado=True,
        amostra_jogos=24, sot_concedido_adversario="alto", incerteza="media",
    )
    assert c["jogador"] == "Vinicius Jr"
    assert c["linha"] == 0.5
    assert c["odd"] == 1.72
    assert c["prob_modelo"] == 0.68
    assert 0.0 < c["prob_devig"] < 1.0
    assert c["edge"] == pytest.approx(c["prob_modelo"] - c["prob_devig"])
    assert c["ev"] == pytest.approx(c["prob_modelo"] * c["odd"] - 1.0)
    assert c["lambda"] == 1.9
    assert c["minutos_esperados"] == 88
    assert c["xi_confirmado"] is True
    assert c["amostra_jogos"] == 24
    assert c["sot_concedido_adversario"] == "alto"
    assert c["incerteza"] == "media"
