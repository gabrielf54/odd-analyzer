import pytest
from odd_analyzer.candidates.builder import build_candidate


def test_build_candidate_monta_dossie():
    c = build_candidate(
        jogador="Vinicius Jr", linha=0.5, odd_over=1.72, odd_under=2.10,
        prob_modelo=0.68, mu=1.9, minutos_esperados=88, xi_confirmado=True,
        amostra_jogos=24, concedido_adversario="alto", incerteza="media",
        market_type="sot",
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
    assert c["concedido_adversario"] == "alto"
    assert c["incerteza"] == "media"
    assert c["market_type"] == "sot"


def test_build_candidate_campo_renomeado_nao_usa_sot_prefix():
    c = build_candidate(
        jogador="Raphinha", linha=1.5, odd_over=2.40, odd_under=1.55,
        prob_modelo=0.45, mu=0.9, minutos_esperados=75, xi_confirmado=False,
        amostra_jogos=15, concedido_adversario="baixo", incerteza="alta",
        market_type="finalizacoes",
    )
    assert "sot_concedido_adversario" not in c
    assert "concedido_adversario" in c
    assert c["market_type"] == "finalizacoes"


def test_build_candidate_escanteios():
    c = build_candidate(
        jogador="Brasil", linha=9.5, odd_over=1.85, odd_under=1.95,
        prob_modelo=0.55, mu=10.2, minutos_esperados=90, xi_confirmado=True,
        amostra_jogos=12, concedido_adversario="medio", incerteza="baixa",
        market_type="escanteios",
    )
    assert c["market_type"] == "escanteios"
    assert c["jogador"] == "Brasil"
    assert c["linha"] == 9.5


def test_build_candidate_carrega_player_id():
    c = build_candidate(
        jogador="Kaiki", linha=1.5, odd_over=1.90, odd_under=1.90,
        prob_modelo=0.73, mu=2.0, minutos_esperados=90.0, xi_confirmado=True,
        amostra_jogos=50, concedido_adversario="14.6", incerteza="baixa",
        market_type="desarmes", player_id="1867",
    )
    assert c["player_id"] == "1867"

def test_build_candidate_player_id_default_none():
    c = build_candidate(
        jogador="Total", linha=8.5, odd_over=1.90, odd_under=1.90,
        prob_modelo=0.5, mu=9.0, minutos_esperados=90.0, xi_confirmado=True,
        amostra_jogos=10, concedido_adversario="n/d", incerteza="media",
        market_type="escanteios",
    )
    assert c["player_id"] is None
