"""Mantém só candidatos com valor real: edge e EV acima do corte, titular
confirmado e amostra suficiente. Ordena por EV desc. Lista vazia é resultado
válido ('nenhuma oportunidade clara')."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Cortes:
    edge_min: float = 0.04
    ev_min: float = 0.05
    amostra_min: int = 10

def filter_candidates(candidatos: list[dict], cuts: Cortes = Cortes()) -> list[dict]:
    keep = [
        c for c in candidatos
        if c["edge"] >= cuts.edge_min
        and c["ev"] >= cuts.ev_min
        and c.get("xi_confirmado", False)
        and c.get("amostra_jogos", 0) >= cuts.amostra_min
    ]
    return sorted(keep, key=lambda c: c["ev"], reverse=True)
