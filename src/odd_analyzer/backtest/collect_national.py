"""Coletor de calibração na população de SELEÇÃO (Copa).

Replica a produção em jogos de seleção JÁ JOGADOS, com recorte anti-espiada
(só jogos mais antigos que o alvo) e pool de várias ligas de seleção.
Formas reais do BSD em docs/apis/bsd-bzzoiro/examples/ (wc_*.json).
"""

NATIONAL_LEAGUES = (58, 59, 60, 61, 62, 64, 65, 66, 67, 31)
FRIENDLY_LEAGUE = 31


def games_before_target(history_desc: list[dict], target_event_id) -> list[dict]:
    """history_desc: histórico do jogador em ordem DECRESCENTE (BSD: recente primeiro),
    cada linha com 'event_id'. Devolve só os jogos ESTRITAMENTE mais antigos que o alvo,
    em ordem CRESCENTE (mais antigo primeiro) para alimentar a conta pura.
    Se o alvo não está no histórico → [] (não dá pra estabelecer 'antes' com segurança)."""
    ids = [str(r.get("event_id")) for r in history_desc]
    alvo = str(target_event_id)
    if alvo not in ids:
        return []
    idx = ids.index(alvo)
    older_desc = history_desc[idx + 1:]   # depois do alvo no DESC = mais antigos
    return list(reversed(older_desc))      # crescente


def pool_targets(client, leagues, n_per_league, stat_field, include_friendlies):
    """Junta jogos-alvo finalizados de várias ligas de seleção.
    Devolve (targets, conceded_pg, league_avg):
      targets: [{event_id, league_id, home_id, away_id, date, player_stats:[...]}]
               (player_stats = actuals de quem entrou em campo, minutos>0)
      conceded_pg: {team_id: média do stat que os adversários DELE produziram/jogo}
      league_avg: média de conceded_pg (denominador do opponent_multiplier)
    Mesma metodologia de concessão do collect_bsd (pool inteiro, sem leave-one-out no matchup)."""
    targets = []
    t_against, t_games = {}, {}
    for lid in leagues:
        if lid == FRIENDLY_LEAGUE and not include_friendlies:
            continue
        evs = client.events(league_id=lid, status="finished", limit=n_per_league)
        results = evs.get("results", []) if isinstance(evs, dict) else []
        for ev in results[:n_per_league]:
            home_id, away_id = ev.get("home_team_id"), ev.get("away_team_id")
            if home_id is None or away_id is None:
                continue
            try:
                ps = client.event_player_stats(ev["id"]).get("player_stats", [])
            except Exception:
                continue
            jogadores, stat_by_team = [], {}
            for row in ps:
                if (row.get("minutes_played") or 0) <= 0:
                    continue
                tid = row.get("team_id")
                val = row.get(stat_field) or 0
                jogadores.append(row)
                stat_by_team[tid] = stat_by_team.get(tid, 0) + val
            if not jogadores:
                continue
            targets.append({
                "event_id": ev["id"], "league_id": lid,
                "home_id": home_id, "away_id": away_id,
                "date": ev.get("event_date"), "player_stats": jogadores,
            })
            if home_id in stat_by_team and away_id in stat_by_team:
                t_against[home_id] = t_against.get(home_id, 0) + stat_by_team[away_id]
                t_against[away_id] = t_against.get(away_id, 0) + stat_by_team[home_id]
                t_games[home_id] = t_games.get(home_id, 0) + 1
                t_games[away_id] = t_games.get(away_id, 0) + 1
    conceded_pg = {t: t_against[t] / t_games[t] for t in t_against}
    league_avg = (sum(conceded_pg.values()) / len(conceded_pg)) if conceded_pg else 0.0
    return targets, conceded_pg, league_avg
