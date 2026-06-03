"""Sonda de GROUND-TRUTH do BSD/Bzzoiro (T0 do plano).

Puxa o JSON REAL de um jogo FINALIZADO e salva cru em .probe_dumps/ (DESCARTÁVEL,
gitignorado — regenera quando quiser, não vai pro commit), pra inspecionar a
forma real da API. NÃO é fixture de teste (os testes usam dicts inline).

Settla os 3 desconhecidos do plano:
  1. /events/{id}/team-stats/ existe ou dá 404? (vs /events/{id}/stats/)
  2. events(team_id, status="finished") filtra de fato?
  3. formas populadas reais de lineups / player_stats / event_odds.

Uso: python -m odd_analyzer.cli bsd-probe 7166
IDs finalizados conhecidos (doc bsd-bzzoiro.md): 7155 Coritiba-Bahia, 7166 Cruzeiro-Flu.
"""
import json
from pathlib import Path

from odd_analyzer.config import get_required
from odd_analyzer.bsd.client import BSDClient

_DUMP_DIR = Path(__file__).resolve().parents[3] / ".probe_dumps"  # descartável, gitignorado
_PROBE_CACHE = Path(__file__).resolve().parents[3] / ".cache_api_probe"


def _summarize(payload) -> str:
    """Resumo compacto da forma: tipo, chaves de topo, count, chaves do 1º result."""
    if isinstance(payload, dict):
        keys = list(payload.keys())
        out = f"dict top_keys={keys}"
        results = payload.get("results")
        if isinstance(results, list):
            out += f" · count={payload.get('count')} · len(results)={len(results)}"
            if results and isinstance(results[0], dict):
                out += f" · result[0]_keys={list(results[0].keys())}"
        return out
    if isinstance(payload, list):
        out = f"list len={len(payload)}"
        if payload and isinstance(payload[0], dict):
            out += f" · item[0]_keys={list(payload[0].keys())}"
        return out
    return f"{type(payload).__name__}={payload!r}"


def _dump(name: str, payload) -> None:
    _DUMP_DIR.mkdir(parents=True, exist_ok=True)
    path = _DUMP_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  salvo: {path.relative_to(Path.cwd())}" if path.is_relative_to(Path.cwd()) else f"  salvo: {path}")


def probe_event(event_id: str) -> None:
    client = BSDClient(get_required("BZZOIRO_API_KEY"), cache_dir=_PROBE_CACHE)
    print(f"=== BSD ground-truth probe — event {event_id} ===\n")

    # 1) get_event → para team_id e sanity do confronto
    home_team_id = away_team_id = None
    try:
        evt = client.get_event(event_id)
        _dump(f"{event_id}_event", evt)
        home_team_id = (evt.get("home_team") or {}).get("id")
        away_team_id = (evt.get("away_team") or {}).get("id")
        print(f"[get_event] OK · {_summarize(evt)}")
        print(f"           home_team_id={home_team_id} away_team_id={away_team_id}")
    except Exception as e:
        print(f"[get_event] ERRO: {e}")

    # 2) lineups → forma real (seam do elenco, Slice 1)
    first_player_id = None
    try:
        lu = client.lineups(event_id)
        _dump(f"{event_id}_lineups", lu)
        print(f"[lineups] OK · {_summarize(lu)}")
        results = lu.get("results") if isinstance(lu, dict) else None
        if results and isinstance(results[0], dict):
            p0 = results[0]
            print(f"          sample[0]={json.dumps(p0, ensure_ascii=False)[:300]}")
            # tenta achar player_id pra sondar o retrospecto
            pl = p0.get("player")
            first_player_id = (pl or {}).get("id") if isinstance(pl, dict) else p0.get("player_id") or p0.get("id")
    except Exception as e:
        print(f"[lineups] ERRO: {e}")

    # 3) player_stats(retrospecto) → seam de entity_taxa (Slice 1)
    if first_player_id is not None:
        try:
            ps = client.player_stats(first_player_id)
            _dump(f"{event_id}_player_stats_{first_player_id}", ps)
            print(f"[player_stats {first_player_id}] OK · {_summarize(ps)}")
            results = ps.get("results") if isinstance(ps, dict) else None
            if results and isinstance(results[0], dict):
                print(f"          sample[0]={json.dumps(results[0], ensure_ascii=False)[:400]}")
        except Exception as e:
            print(f"[player_stats {first_player_id}] ERRO: {e}")
    else:
        print("[player_stats] PULADO — não achei player_id no lineups")

    # 4) event_player_stats → base de concessão do adversário
    try:
        eps = client.event_player_stats(event_id)
        _dump(f"{event_id}_event_player_stats", eps)
        print(f"[event_player_stats] OK · {_summarize(eps)}")
    except Exception as e:
        print(f"[event_player_stats] ERRO: {e}")

    # 5) DESEMPATE: /team-stats/ existe ou 404? vs /events/{id}/stats/
    try:
        ts = client.team_stats(event_id)
        _dump(f"{event_id}_team_stats", ts)
        print(f"[team_stats /team-stats/] OK · {_summarize(ts)}")
    except Exception as e:
        print(f"[team_stats /team-stats/] ERRO (provável 404 — usar /stats/): {e}")
    try:
        st = client._call(f"/events/{event_id}/stats/", ttl=3600)
        _dump(f"{event_id}_stats", st)
        print(f"[/events/id/stats/] OK · {_summarize(st)}")
    except Exception as e:
        print(f"[/events/id/stats/] ERRO: {e}")

    # 6) event_odds → seam de BSDMatchOdds (Slice 2: total_corners)
    try:
        od = client.event_odds(event_id)
        _dump(f"{event_id}_event_odds", od)
        print(f"[event_odds] OK · {_summarize(od)}")
        results = od.get("results") if isinstance(od, dict) else None
        bms = od.get("bookmakers") if isinstance(od, dict) else None
        sample = (results or bms or [None])[0]
        if isinstance(sample, dict):
            print(f"          sample[0]={json.dumps(sample, ensure_ascii=False)[:400]}")
    except Exception as e:
        print(f"[event_odds] ERRO: {e}")

    # 7) DESEMPATE Slice 2: events(team_id, status=finished) filtra?
    if home_team_id is not None:
        for params in ({"team_id": home_team_id, "status": "finished"},
                       {"team_id": home_team_id, "finished": "true"}):
            try:
                ev = client.events(**params)
                n = ev.get("count") if isinstance(ev, dict) else None
                print(f"[events {params}] OK · {_summarize(ev)} · count={n}")
            except Exception as e:
                print(f"[events {params}] ERRO: {e}")
    else:
        print("[events team filter] PULADO — sem home_team_id")

    print(f"\nDumps crus (descartáveis, gitignorados) em: {_DUMP_DIR}")
