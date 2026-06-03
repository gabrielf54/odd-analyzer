"""Tradutor de player_id do BSD.

A escalação (/events/{id}/lineups/) traz NOME + um player_id de um namespace que
**não resolve** em /players/{id}/stats/ (dá 404). O histórico de stats usa outro
namespace de id (o mesmo de /events/{id}/player-stats/ e /players/{id}/). Sem
casar os dois, o motor não acha o histórico do jogador escalado.

Estratégia barata: os jogadores que ATUARAM nos últimos jogos finalizados do time
já vêm com o stats-id certo (via player-stats de jogo); pega o nome de cada um em
/players/{id}/ e casa por nome com a escalação. Fail-closed: sem match confiável,
o jogador é descartado (nunca chuta id errado → nunca inventa histórico)."""
from odd_analyzer.crosswalk.match import match_player


def construir_mapa_time(client, team_id, n_jogos: int = 5) -> list[dict]:
    """[{id: stats_id, name}] de quem atuou nos últimos `n_jogos` finalizados do
    time. Nome vem de /players/{id}/ (o player-stats de jogo não traz nome).
    Dedup por id, preservando ordem. Barato: 1 call player() por id único."""
    if not team_id:
        return []
    team_id = str(team_id)
    evs = client.events(team_id=team_id, status="finished", limit=n_jogos)
    results = evs.get("results", []) if isinstance(evs, dict) else []
    ids: list[int] = []
    vistos: set = set()
    for ev in results[:n_jogos]:
        ps = client.event_player_stats(ev["id"])
        rows = ps.get("player_stats", []) if isinstance(ps, dict) else []
        for r in rows:
            pid = r.get("player_id")
            if pid is None or str(r.get("team_id")) != team_id:
                continue
            if pid not in vistos:
                vistos.add(pid)
                ids.append(pid)
    mapa: list[dict] = []
    for pid in ids:
        try:
            d = client.player(pid)
        except Exception:
            continue
        nome = d.get("name") if isinstance(d, dict) else None
        if nome:
            mapa.append({"id": str(pid), "name": nome})
    return mapa


def resolver(jogadores: list[dict], mapa: list[dict], threshold: float = 0.85) -> list[dict]:
    """Troca o `id` de cada jogador da escalação pelo stats-id casado por nome.
    Preserva os demais campos (name, team_id, posicao). Sem match acima do
    threshold → descarta o jogador (fail-closed)."""
    out: list[dict] = []
    for p in jogadores:
        m = match_player(p.get("name", ""), mapa, threshold=threshold)
        if m is None:
            continue
        novo = dict(p)
        novo["id"] = m["id"]
        out.append(novo)
    return out
