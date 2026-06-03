"""Sonda exploratoria das rotas BSD relevantes para CALIBRACAO.

Objetivo: entender a forma real das respostas que o backtest precisa para
montar um dataset de calibracao em dado vivo do BSD (sem API-Football):
  - listar jogos FINALIZADOS de uma liga (com paginacao)
  - actuals por jogador por jogo (event player-stats)
  - historico por jogador (players/{id}/stats) para montar a rate leave-one-out
  - odds de partida para de-vig (mercados que existem)

Roda chamadas REAIS. Salva cada resposta (trimada) em
docs/apis/bsd-bzzoiro/examples/<nome>.json para virar referencia.

Uso: .venv\\Scripts\\python.exe scripts\\probe_calibration_routes.py
"""
import json
import os
from pathlib import Path

from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required

OUT = Path("docs/apis/bsd-bzzoiro/examples")
OUT.mkdir(parents=True, exist_ok=True)

# Brasileirao Serie A = 9 (doc); evento finalizado conhecido = 7166 (Cruzeiro x Flu)
LEAGUE_A = 9
KNOWN_EVENT = 7166


def trim(obj, max_list=3):
    """Encurta listas longas para o exemplo nao ficar gigante."""
    if isinstance(obj, dict):
        return {k: trim(v, max_list) for k, v in obj.items()}
    if isinstance(obj, list):
        head = [trim(x, max_list) for x in obj[:max_list]]
        if len(obj) > max_list:
            head.append(f"... (+{len(obj) - max_list} itens omitidos)")
        return head
    return obj


def save(name, obj):
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(trim(obj), ensure_ascii=False, indent=2), encoding="utf-8")
    # resumo no stdout
    if isinstance(obj, dict):
        keys = list(obj.keys())
        n = obj.get("count")
        print(f"[{name}] keys={keys} count={n} -> {path}")
    else:
        print(f"[{name}] type={type(obj).__name__} -> {path}")


def main():
    c = BSDClient(get_required("BZZOIRO_API_KEY"))

    # 1) Quais filtros listam jogos FINALIZADOS de uma liga?
    #    Testa varios nomes de parametro para descobrir o que o BSD aceita.
    filter_tries = {
        "events_league_only": dict(league_id=LEAGUE_A),
        "events_finished_true": dict(league_id=LEAGUE_A, finished="true"),
        "events_status_finished": dict(league_id=LEAGUE_A, status="finished"),
        "events_season_2024": dict(league_id=LEAGUE_A, season=2024),
    }
    for name, params in filter_tries.items():
        try:
            r = c.events(**params)
            save(name, r)
            # mostra status do 1o resultado pra entender o flag de finalizado
            res = (r.get("results") or []) if isinstance(r, dict) else []
            if res:
                first = res[0]
                flags = {k: first.get(k) for k in
                         ("id", "status", "finished", "status_type",
                          "start_time", "home_team", "away_team",
                          "home_score", "away_score") if k in first}
                print(f"    {name} primeiro evento: {flags}")
        except Exception as e:
            print(f"[{name}] ERRO: {type(e).__name__}: {e}")

    # 2) Forma de um evento + actuals por jogador
    try:
        save("event_detail", c.get_event(KNOWN_EVENT))
    except Exception as e:
        print(f"[event_detail] ERRO: {e}")

    try:
        ps = c.event_player_stats(KNOWN_EVENT)
        save("event_player_stats", ps)
        # pega um player_id pra sondar o historico dele
        pid = None
        res = ps.get("results") or ps.get("player_stats") or []
        if isinstance(res, dict):
            res = res.get("home", []) + res.get("away", [])
        for row in res:
            pid = row.get("player_id") or row.get("id") or (row.get("player") or {}).get("id")
            if pid:
                break
        print(f"    player_id de amostra: {pid}")
    except Exception as e:
        pid = None
        print(f"[event_player_stats] ERRO: {e}")

    # 3) Historico do jogador (rate leave-one-out). Tem data/ordenacao por jogo?
    if pid:
        try:
            save("player_stats_history", c.player_stats(pid))
        except Exception as e:
            print(f"[player_stats_history] ERRO: {e}")

    # 4) Odds de partida pra de-vig (quais mercados existem num finalizado)
    try:
        save("event_odds", c.event_odds(KNOWN_EVENT))
    except Exception as e:
        print(f"[event_odds] ERRO: {e}")

    # 5) Stats de time (escanteios etc)
    try:
        save("event_stats_team", c.event_stats(KNOWN_EVENT))
    except Exception as e:
        print(f"[event_stats_team] ERRO: {e}")

    print("\nDumps em", OUT.resolve())


if __name__ == "__main__":
    main()
