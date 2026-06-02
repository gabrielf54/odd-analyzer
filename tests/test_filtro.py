from odd_analyzer.candidates.filtro import Cortes, filter_candidates

def _cand(**kw):
    base = dict(jogador="X", linha=0.5, odd=2.0, prob_modelo=0.6, prob_devig=0.5,
                edge=0.10, ev=0.20, xi_confirmado=True, amostra_jogos=20)
    base.update(kw)
    return base

def test_mantem_acima_dos_cortes():
    assert len(filter_candidates([_cand()])) == 1

def test_corta_edge_baixo():
    assert filter_candidates([_cand(edge=0.01)]) == []

def test_corta_ev_baixo():
    assert filter_candidates([_cand(ev=0.0)]) == []

def test_corta_sem_xi():
    assert filter_candidates([_cand(xi_confirmado=False)]) == []

def test_corta_amostra_pequena():
    assert filter_candidates([_cand(amostra_jogos=5)]) == []

def test_ordena_por_ev_desc():
    out = filter_candidates([_cand(jogador="A", ev=0.10), _cand(jogador="B", ev=0.30)])
    assert [c["jogador"] for c in out] == ["B", "A"]

def test_lista_vazia_e_valida():
    assert filter_candidates([]) == []

def test_cortes_customizados():
    cuts = Cortes(edge_min=0.0, ev_min=0.0, amostra_min=0)
    assert len(filter_candidates([_cand(edge=0.001, ev=0.001, amostra_jogos=1)], cuts)) == 1
