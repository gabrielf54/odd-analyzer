"""Monta o dossiê de UM candidato no formato que a IA lê (design v1 §7).
Toda a matemática (de-vig, edge, EV) vem do código aqui — a IA nunca calcula.

Alterações:
- sot_concedido_adversario → concedido_adversario  (genérico p/ qualquer mercado)
- novo campo market_type (e.g. "sot", "escanteios", "desarmes")
"""
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev


def build_candidate(
    jogador, linha, odd_over, odd_under, prob_modelo, mu,
    minutos_esperados, xi_confirmado, amostra_jogos,
    concedido_adversario, incerteza, market_type: str,
) -> dict:
    prob_devig = fair_prob_over(odd_over, odd_under)
    m = edge_ev(prob_modelo, prob_devig, odd_over)
    return {
        "jogador": jogador,
        "linha": linha,
        "odd": odd_over,
        "prob_modelo": prob_modelo,
        "prob_devig": prob_devig,
        "edge": m["edge"],
        "ev": m["ev"],
        "lambda": mu,
        "minutos_esperados": minutos_esperados,
        "xi_confirmado": xi_confirmado,
        "amostra_jogos": amostra_jogos,
        "concedido_adversario": concedido_adversario,
        "incerteza": incerteza,
        "market_type": market_type,
    }
