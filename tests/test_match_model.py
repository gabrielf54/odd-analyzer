from odd_analyzer.model.match_model import score_matrix, probs_1x2, prob_total_over

def test_probs_1x2_somam_um():
    m = score_matrix(1.5, 1.1)
    p = probs_1x2(m)
    assert abs(p["home"] + p["draw"] + p["away"] - 1.0) < 1e-6

def test_time_mais_forte_tem_maior_prob():
    m = score_matrix(2.2, 0.7)
    p = probs_1x2(m)
    assert p["home"] > p["away"]

def test_prob_total_over_monotona():
    m = score_matrix(1.6, 1.4)
    assert prob_total_over(m, 1.5) > prob_total_over(m, 2.5)

def test_total_over_entre_0_e_1():
    m = score_matrix(1.3, 1.2)
    assert 0.0 <= prob_total_over(m, 2.5) <= 1.0
