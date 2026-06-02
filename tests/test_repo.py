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
    r.update_fechamento("evt1", "Vinicius Jr", 0.5, odd_fechamento=1.90, resultado=1)
    row = r.ledger[0]
    assert row["odd_fechamento"] == 1.90
    assert row["resultado"] == 1
    assert row["clv"] == pytest.approx(2.10 / 1.90 - 1.0)

def test_update_fechamento_linha_inexistente_e_noop():
    r = InMemoryRepo()
    r.update_fechamento("ghost", "Ninguem", 0.5, odd_fechamento=1.80, resultado=0)
    assert r.ledger == []  # nao cria nem quebra
