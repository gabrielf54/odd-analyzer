"""Edge e EV. edge = prob_modelo - prob_devig (vantagem sobre o mercado justo);
EV = prob_modelo * odd - 1 (retorno esperado por unidade apostada)."""

def edge_ev(prob_modelo: float, prob_devig: float, odd_decimal: float) -> dict:
    return {
        "edge": prob_modelo - prob_devig,
        "ev": prob_modelo * odd_decimal - 1.0,
    }
