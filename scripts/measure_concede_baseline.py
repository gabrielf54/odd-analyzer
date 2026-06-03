"""Mede a concessão média real por mercado no BSD (league-sweep) para substituir
os concede_baseline estáticos de markets.py. Lê N jogos finalizados de uma liga,
soma o que cada time CONCEDE no eixo (stat do adversário) e tira a média.

Uso: .venv\\Scripts\\python.exe scripts\\measure_concede_baseline.py [league_id] [n]
"""
import sys
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required

# (label, campo de TIME no /events/{id}/stats/)
EIXOS = [
    ("sot (shots_on_target)", "shots_on_target"),
    ("finalizacoes (total_shots)", "total_shots"),
    ("desarmes (total_tackles)", "total_tackles"),
    ("escanteios (corner_kicks)", "corner_kicks"),
]

def main():
    league = int(sys.argv[1]) if len(sys.argv) > 1 else 9
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 80
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    evs = c.events(league_id=league, status="finished", limit=n).get("results", [])[:n]
    soma = {campo: 0.0 for _, campo in EIXOS}
    cont = {campo: 0 for _, campo in EIXOS}
    for ev in evs:
        try:
            stats = c.event_stats(ev["id"]).get("stats", {})
        except Exception:
            continue
        home, away = stats.get("home", {}), stats.get("away", {})
        for _, campo in EIXOS:
            # o que o time da CASA concede = o que o visitante PRODUZ (e vice-versa)
            for produtor in (home, away):
                v = produtor.get(campo)
                if v is not None:
                    soma[campo] += float(v); cont[campo] += 1
    print(f"liga={league} jogos={len(evs)}")
    print("Substituir em markets.py concede_baseline:")
    for label, campo in EIXOS:
        media = soma[campo] / cont[campo] if cont[campo] else 0.0
        print(f"  {label:<28} concede_baseline = {media:.2f}  (n={cont[campo]})")

if __name__ == "__main__":
    main()
