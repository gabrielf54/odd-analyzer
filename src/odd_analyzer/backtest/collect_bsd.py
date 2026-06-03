"""Coletor de dados de calibração no BSD (substitui o coletor API-Football).
Produz a MESMA forma que score_records consome, para um stat_field de jogador.

Forma real (ver docs/apis/bsd-bzzoiro/examples/):
  /events/?league_id=&status=finished&limit=N -> {results:[{id, home_team_id, away_team_id, ...}]}
  /events/{id}/player-stats/ -> {player_stats:[{player_id, team_id, minutes_played, <stat_field>}]}
"""

def collect_bsd(client, league_id, n_events, stat_field):
    """Retorna (meta, records, conceded_pg, league_avg, home_factor, away_factor).
    meta {event_id:(home_id,away_id)}; records [(eid,pid,tid,min,stat)] de quem jogou."""
    evs = client.events(league_id=league_id, status="finished", limit=n_events)
    results = evs.get("results", []) if isinstance(evs, dict) else []
    meta = {}
    records = []
    t_against, t_games = {}, {}
    home_for = away_for = home_games = away_games = 0
    for ev in results[:n_events]:
        eid = ev["id"]
        home_id, away_id = ev.get("home_team_id"), ev.get("away_team_id")
        if home_id is None or away_id is None:
            continue
        meta[eid] = (home_id, away_id)
        try:
            ps = client.event_player_stats(eid).get("player_stats", [])
        except Exception:
            del meta[eid]
            continue
        stat_by_team = {}
        for row in ps:
            minutes = row.get("minutes_played") or 0
            if minutes <= 0:
                continue  # não entrou em campo
            tid = row.get("team_id")
            val = row.get(stat_field) or 0
            records.append((eid, row.get("player_id"), tid, minutes, val))
            stat_by_team[tid] = stat_by_team.get(tid, 0) + val
        if home_id in stat_by_team and away_id in stat_by_team:
            t_against[home_id] = t_against.get(home_id, 0) + stat_by_team[away_id]
            t_against[away_id] = t_against.get(away_id, 0) + stat_by_team[home_id]
            t_games[home_id] = t_games.get(home_id, 0) + 1
            t_games[away_id] = t_games.get(away_id, 0) + 1
            home_for += stat_by_team[home_id]; away_for += stat_by_team[away_id]
            home_games += 1; away_games += 1
    conceded_pg = {t: t_against[t] / t_games[t] for t in t_against}
    league_avg = (sum(conceded_pg.values()) / len(conceded_pg)) if conceded_pg else 0.0
    if home_games and away_games:
        ah, aa = home_for / home_games, away_for / away_games
        mid = (ah + aa) / 2 or 1.0
        home_factor, away_factor = ah / mid, aa / mid
    else:
        home_factor = away_factor = 1.0
    return meta, records, conceded_pg, league_avg, home_factor, away_factor


def collect_bsd_team(client, league_id, n_events, team_field):
    """Para mercado de partida (escanteios): retorna (totais_por_jogo, corners_for_por_time).
    totais = [home+away por jogo]; by_team {team_id: [valor-for em cada jogo]}."""
    evs = client.events(league_id=league_id, status="finished", limit=n_events)
    results = evs.get("results", []) if isinstance(evs, dict) else []
    totais, by_team = [], {}
    for ev in results[:n_events]:
        try:
            stats = client.event_stats(ev["id"]).get("stats", {})
        except Exception:
            continue
        h = stats.get("home", {}).get(team_field)
        a = stats.get("away", {}).get(team_field)
        if h is None or a is None:
            continue
        totais.append(float(h) + float(a))
        by_team.setdefault(ev["home_team_id"], []).append(float(h))
        by_team.setdefault(ev["away_team_id"], []).append(float(a))
    return totais, by_team
