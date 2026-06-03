"""Spike de VIABILIDADE-COPA (2026-06-03, 8 dias antes do dinheiro real 11/06).

Pergunta central: da pra validar/calibrar o motor para a Copa (selecoes) antes
de apostar dinheiro? O motor foi calibrado em liga 9 (Brasileirao, CLUBES). A Copa
e SELECOES -> shift de populacao. Este spike sonda, em dado VIVO:

  1) Liga 27 (World Cup 2026): quantos jogos, status, datas, odds ja populadas?
  2) Existe liga de AMISTOSOS INTERNACIONAIS com jogos FINALIZADOS + player-stats?
     (= a unica amostra forward de SELECAO disponivel antes do dia 11)
  3) Pool de selecao (/players/?national_team_id=) + historico de 1 jogador (clube).
  4) Qualquer evento internacional FINALIZADO tem player-stats utilizaveis?

Roda chamadas REAIS (so GET). Salva dumps trimados em docs/apis/bsd-bzzoiro/examples/wc_*.json.
Uso: .venv\\Scripts\\python.exe scripts\\probe_wc_validation.py
"""
import json
from pathlib import Path

from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required

OUT = Path("docs/apis/bsd-bzzoiro/examples")
OUT.mkdir(parents=True, exist_ok=True)
WC_LEAGUE = 27


def trim(obj, max_list=4):
    if isinstance(obj, dict):
        return {k: trim(v, max_list) for k, v in obj.items()}
    if isinstance(obj, list):
        head = [trim(x, max_list) for x in obj[:max_list]]
        if len(obj) > max_list:
            head.append(f"... (+{len(obj) - max_list} itens omitidos)")
        return head
    return obj


def save(name, obj):
    (OUT / f"{name}.json").write_text(
        json.dumps(trim(obj), ensure_ascii=False, indent=2), encoding="utf-8")


def results(r):
    return (r.get("results") or []) if isinstance(r, dict) else []


def main():
    c = BSDClient(get_required("BZZOIRO_API_KEY"))

    # ---- 1) Catalogo de ligas: achar International / amistosos -------------
    print("=== LIGAS (procurando International / friendlies / Copa) ===")
    leagues = []
    offset = 0
    while True:
        r = c.leagues(limit=50, offset=offset)
        batch = results(r)
        leagues.extend(batch)
        total = r.get("count") if isinstance(r, dict) else None
        offset += 50
        if not batch or (total and offset >= total) or offset > 400:
            break
    print(f"  total ligas listadas: {len(leagues)}")
    save("wc_leagues_all", {"count": len(leagues), "results": leagues})
    intl = [lg for lg in leagues
            if "international" in str(lg.get("country") or "").lower()
            or any(w in str(lg.get("name") or "").lower()
                   for w in ("world cup", "friendl", "nations", "qualif", "copa", "euro"))]
    for lg in intl:
        print(f"    id={lg.get('id'):>4}  {lg.get('name')!r:45}  country={lg.get('country')!r}")

    # ---- 2) Liga 27 (WC): jogos, status, datas, odds ----------------------
    print("\n=== LIGA 27 (World Cup 2026) ===")
    wc = c.events(league_id=WC_LEAGUE)
    save("wc_events_all", wc)
    evs = results(wc)
    print(f"  count={wc.get('count')}  amostra={len(evs)}")
    status_counts = {}
    for e in evs:
        status_counts[e.get("status")] = status_counts.get(e.get("status"), 0) + 1
    print(f"  status na amostra: {status_counts}")
    for e in evs[:6]:
        print(f"    id={e.get('id')} {e.get('home_team')!r} x {e.get('away_team')!r} "
              f"date={e.get('event_date')} status={e.get('status')}")

    wc_finished = c.events(league_id=WC_LEAGUE, status="finished")
    save("wc_events_finished", wc_finished)
    print(f"  finished count={wc_finished.get('count') if isinstance(wc_finished, dict) else '?'}")

    # odds ja populadas em algum jogo da WC?
    first_wc = evs[0] if evs else None
    if first_wc:
        eid = first_wc.get("id")
        try:
            od = c.event_odds(eid)
            save("wc_event_odds_sample", od)
            print(f"  odds do evento {eid}: keys={list(od.keys()) if isinstance(od, dict) else type(od)}")
            inner = od.get("odds") if isinstance(od, dict) else None
            print(f"    odds populadas? {'SIM' if inner else 'VAZIO (popula perto do kickoff)'}")
        except Exception as ex:
            print(f"  odds WC ERRO: {type(ex).__name__}: {ex}")
        # lineup ja confirmado?
        try:
            lu = c.lineups(eid)
            st = lu.get("lineup_status") if isinstance(lu, dict) else None
            print(f"  lineup status evento {eid}: {st!r}")
        except Exception as ex:
            print(f"  lineup WC ERRO: {type(ex).__name__}: {ex}")
        # national_team_id do mandante p/ sondar o pool
        nat_id = first_wc.get("home_team_id")
        print(f"  home_team_id (national?) = {nat_id}")
        if nat_id:
            try:
                pool = c.national_pool(nat_id)
                save("wc_national_pool", pool)
                pres = results(pool)
                print(f"  pool selecao {nat_id}: count={pool.get('count') if isinstance(pool, dict) else '?'} amostra={len(pres)}")
                # histgrico (clube) de 1 jogador do pool
                pid = None
                for p in pres:
                    pid = p.get("id") or p.get("player_id")
                    if pid:
                        print(f"    jogador amostra id={pid} {p.get('name')!r} current_team_id={p.get('current_team_id')}")
                        break
                if pid:
                    hist = c.player_stats(pid)
                    save("wc_player_history", hist)
                    hres = results(hist)
                    print(f"    historico jogador {pid}: {len(hres)} linhas (jogos de CLUBE)")
            except Exception as ex:
                print(f"  national_pool ERRO: {type(ex).__name__}: {ex}")

    # ---- 3) Amistoso internacional FINALIZADO com player-stats? -----------
    print("\n=== AMISTOSOS / INTERNACIONAL FINALIZADO (amostra forward de SELECAO) ===")
    for lg in intl:
        lid = lg.get("id")
        if lid == WC_LEAGUE:
            continue
        try:
            fin = c.events(league_id=lid, status="finished")
            n = fin.get("count") if isinstance(fin, dict) else 0
            fres = results(fin)
            print(f"  liga {lid} {lg.get('name')!r}: finished count={n}")
            if fres:
                e0 = fres[0]
                eid = e0.get("id")
                print(f"    ex finalizado: id={eid} {e0.get('home_team')!r} x {e0.get('away_team')!r} date={e0.get('event_date')}")
                ps = c.event_player_stats(eid)
                rows = ps.get("player_stats") or results(ps)
                save(f"wc_intl_finished_playerstats_{lid}", ps)
                print(f"    player-stats do {eid}: {len(rows) if isinstance(rows, list) else '?'} linhas")
                if isinstance(rows, list) and rows:
                    keys = [k for k in ("player_id", "minutes_played", "shots_on_target",
                                        "total_shots", "total_tackle") if k in rows[0]]
                    print(f"    campos presentes: {keys}")
        except Exception as ex:
            print(f"  liga {lid} ERRO: {type(ex).__name__}: {ex}")

    print("\nDumps em", OUT.resolve())


if __name__ == "__main__":
    main()
