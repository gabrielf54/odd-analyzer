import pytest
from odd_analyzer.store.repo import Repo, InMemoryRepo, SupabaseRepo, clv

def test_repo_interface():
    # as duas implementacoes honram o mesmo contrato
    assert issubclass(InMemoryRepo, Repo)
    assert issubclass(SupabaseRepo, Repo)

def test_clv_positivo_quando_flag_melhor_que_fechamento():
    # peguei 2.10, fechou 1.90 -> CLV positivo (preço melhor)
    assert clv(2.10, 1.90) == pytest.approx(2.10 / 1.90 - 1.0)

def test_clv_negativo():
    assert clv(1.80, 2.00) < 0

def test_repo_salva_e_le_analise():
    r = InMemoryRepo()
    r.save_analise("evt1", {"jogo": "BRA x CRO", "candidatos": []})
    assert r.get_analise("evt1")["jogo"] == "BRA x CRO"
    assert r.get_analise("inexistente") is None

def test_repo_salva_ledger_e_atualiza_fechamento():
    r = InMemoryRepo()
    r.save_ledger([{"event_id": "evt1", "jogador": "Vinicius Jr", "linha": 0.5,
                    "odd_flag": 2.10, "prob_modelo": 0.6, "prob_devig": 0.5,
                    "edge": 0.1, "ev": 0.26}])
    r.update_fechamento("evt1", "Vinicius Jr", 0.5, None, odd_fechamento=1.90, resultado=1)
    row = r.ledger[0]
    assert row["odd_fechamento"] == 1.90
    assert row["resultado"] == 1
    assert row["clv"] == pytest.approx(2.10 / 1.90 - 1.0)

def test_update_fechamento_linha_inexistente_e_noop():
    r = InMemoryRepo()
    r.update_fechamento("ghost", "Ninguem", 0.5, None, odd_fechamento=1.80, resultado=0)
    assert r.ledger == []  # nao cria nem quebra


def test_save_ledger_com_market_type():
    r = InMemoryRepo()
    r.save_ledger([{
        "event_id": "evt1", "jogador": "Vinicius Jr", "linha": 0.5,
        "market_type": "sot", "odd_flag": 1.85,
        "prob_modelo": 0.6, "prob_devig": 0.5, "edge": 0.1, "ev": 0.11,
    }])
    assert r.ledger[0]["market_type"] == "sot"

def test_update_fechamento_com_market_type():
    r = InMemoryRepo()
    r.save_ledger([{
        "event_id": "evt1", "jogador": "Neymar", "linha": 1.5,
        "market_type": "finalizacoes", "odd_flag": 2.00,
        "prob_modelo": 0.55, "prob_devig": 0.50, "edge": 0.05, "ev": 0.10,
    }])
    r.update_fechamento("evt1", "Neymar", 1.5, "finalizacoes", odd_fechamento=1.90, resultado=1)
    row = r.ledger[0]
    assert row["odd_fechamento"] == 1.90
    assert row["resultado"] == 1
    assert row["clv"] == pytest.approx(2.00 / 1.90 - 1.0)

def test_update_fechamento_sem_market_type_usa_legacy_match():
    r = InMemoryRepo()
    r.save_ledger([{
        "event_id": "evt1", "jogador": "Vinicius Jr", "linha": 0.5,
        "odd_flag": 2.10, "prob_modelo": 0.6, "prob_devig": 0.5, "edge": 0.1, "ev": 0.26,
    }])
    r.update_fechamento("evt1", "Vinicius Jr", 0.5, None, odd_fechamento=1.90, resultado=1)
    assert r.ledger[0]["resultado"] == 1

def test_market_type_isola_colisao_entre_mercados():
    r = InMemoryRepo()
    r.save_ledger([
        {"event_id": "evt1", "jogador": "X", "linha": 1.5, "market_type": "sot", "odd_flag": 1.80,
         "prob_modelo": 0.6, "prob_devig": 0.5, "edge": 0.1, "ev": 0.08},
        {"event_id": "evt1", "jogador": "X", "linha": 1.5, "market_type": "finalizacoes", "odd_flag": 1.95,
         "prob_modelo": 0.65, "prob_devig": 0.55, "edge": 0.1, "ev": 0.15},
    ])
    assert len(r.ledger) == 2
    r.update_fechamento("evt1", "X", 1.5, "sot", odd_fechamento=1.75, resultado=1)
    sot_row = next(row for row in r.ledger if row.get("market_type") == "sot")
    fin_row = next(row for row in r.ledger if row.get("market_type") == "finalizacoes")
    assert sot_row["odd_fechamento"] == 1.75
    assert "odd_fechamento" not in fin_row

def test_update_fechamento_market_type_inexistente_e_noop():
    r = InMemoryRepo()
    r.update_fechamento("ghost", "Ninguem", 0.5, "sot", odd_fechamento=1.80, resultado=0)
    assert r.ledger == []

def test_crosswalk_save_get_roundtrip():
    repo = InMemoryRepo()
    repo.save_crosswalk(id_canonico=1994, nome_normalizado="adrien rabiot",
                        fontes_ids={"bsd": "1994", "odds": "rabiot"}, confianca=0.97)
    row = repo.get_crosswalk(1994)
    assert row["nome_normalizado"] == "adrien rabiot"
    assert row["fontes_ids"]["bsd"] == "1994"
    assert abs(row["confianca"] - 0.97) < 1e-9

def test_crosswalk_get_inexistente_retorna_none():
    repo = InMemoryRepo()
    assert repo.get_crosswalk(999) is None

def test_snapshot_fechamento_calcula_clv_sem_resultado():
    repo = InMemoryRepo()
    repo.save_ledger([{
        "event_id": "1", "jogador": "Kaiki", "linha": 1.5, "market_type": "desarmes",
        "odd_flag": 1.90, "prob_modelo": 0.73, "prob_devig": 0.55, "edge": 0.18, "ev": 0.24,
    }])
    repo.snapshot_fechamento("1", "Kaiki", 1.5, "desarmes", odd_fechamento=1.75)
    row = repo.ledger[0]
    assert abs(row["odd_fechamento"] - 1.75) < 1e-9
    # CLV = 1.90/1.75 - 1 > 0 (peguei preço melhor que o fechamento)
    assert row["clv"] > 0
    assert row.get("resultado") is None
