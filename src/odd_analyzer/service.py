"""Camada de serviço: contrato estável entre a UI (Streamlit hoje, FastAPI/Next.js
amanhã) e o motor validado. Funções puras, sem Streamlit e sem print; recebem
client/repo injetados → testáveis com fakes. Devolvem dados JSON-serializáveis."""
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.runner import run_analise


def listar_jogos(client, league_id, status, limit: int = 50) -> list[dict]:
    """Lista jogos de uma liga no BSD. status='finished' (pós-jogo) ou
    'notstarted' (pré-jogo). Retorna dados puros p/ a UI."""
    data = client.events(league_id=league_id, status=status, limit=limit)
    results = data.get("results", []) if isinstance(data, dict) else []
    jogos = []
    for ev in results[:limit]:
        hs, as_ = ev.get("home_score"), ev.get("away_score")
        placar = f"{hs}×{as_}" if (hs is not None and as_ is not None) else None
        jogos.append({
            "id": ev.get("id"),
            "mandante": ev.get("home_team"),
            "visitante": ev.get("away_team"),
            "data": ev.get("event_date"),
            "status": ev.get("status"),
            "placar": placar,
        })
    return jogos
