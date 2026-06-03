"""Camada de serviço: contrato estável entre a UI (Streamlit hoje, FastAPI/Next.js
amanhã) e o motor validado. Funções puras, sem Streamlit e sem print; recebem
client/repo injetados → testáveis com fakes. Devolvem dados JSON-serializáveis."""
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.runner import run_analise


def listar_ligas(client, limit: int = 200) -> list[dict]:
    """Catálogo de ligas do BSD (id + nome + país), ordenado por nome — p/ a UI
    mostrar nomes em vez de pedir o league_id na mão. limit=200 cobre as ~65 ligas
    numa página só (sem paginação)."""
    data = client.leagues(limit=limit)
    results = data.get("results", []) if isinstance(data, dict) else []
    ligas = [
        {"id": lg.get("id"), "nome": lg.get("name"), "pais": lg.get("country")}
        for lg in results if lg.get("id") is not None
    ]
    ligas.sort(key=lambda x: (x["nome"] or "").lower())
    return ligas


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
            "league_id": ev.get("league_id", league_id),
        })
    return jogos


def analisar(client, event_id, market_key, linha, odd_over, odd_under,
             usar_ia: bool = False, repo=None,
             escopo_historico: str = "todos", league_id=None) -> dict:
    """Roda a varredura do elenco (player_ref=None) p/ 1 jogo+mercado. Devolve
    {jogo, candidatos, ia, em_validacao}. em_validacao=True p/ mercados de partida
    (gols/escanteios) que ainda não calibram → a UI sela ('não apostar')."""
    if market_key not in MARKETS:
        raise ValueError(f"mercado desconhecido: {market_key}. Opções: {list(MARKETS)}")
    market = MARKETS[market_key]
    em_validacao = market.nivel == "partida"

    raw = client.get_event(event_id)
    home = raw.get("home_team") or "?"
    away = raw.get("away_team") or "?"
    jogo = f"{home} x {away}"

    out = run_analise(client, event_id, market_key, None,
                      linha, odd_over, odd_under, usar_ia=usar_ia, repo=repo,
                      escopo_historico=escopo_historico, league_id=league_id)
    return {
        "jogo": jogo,
        "candidatos": out.get("candidatos", []),
        "ia": out.get("ia", {}),
        "em_validacao": em_validacao,
    }


def apostar_paper(repo, event_id, candidato: dict, em_validacao: bool = False) -> None:
    """Modo pré-jogo: grava a aposta-papel no paper_ledger. Bloqueia mercados
    em validação (gols/escanteios não calibram → não registrar como aposta real)."""
    if em_validacao:
        raise ValueError("mercado em validação — não registrar aposta-papel")
    repo.save_ledger([{
        "event_id": str(event_id),
        "jogador": candidato["jogador"],
        "linha": candidato["linha"],
        "market_type": candidato["market_type"],
        "odd_flag": candidato["odd"],
        "prob_modelo": candidato["prob_modelo"],
        "prob_devig": candidato["prob_devig"],
        "edge": candidato["edge"],
        "ev": candidato["ev"],
    }])


def resultado_real_jogador(client, event_id, market_key, linha) -> dict:
    """Modo pós-jogo: lê os actuals de /events/{id}/player-stats/ e diz, por player_id,
    o valor real do stat do mercado e se superou a linha. Chave = str(player_id)."""
    market = MARKETS[market_key]
    field = market.stat_field
    data = client.event_player_stats(event_id)
    rows = data.get("player_stats", []) if isinstance(data, dict) else []
    out = {}
    for row in rows:
        pid = row.get("player_id")
        if pid is None:
            continue
        valor = row.get(field) or 0
        out[str(pid)] = {"valor_real": valor, "bateu": valor > linha}
    return out
