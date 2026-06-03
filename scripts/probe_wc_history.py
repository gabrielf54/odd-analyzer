"""Spike 2 (viabilidade-Copa): a rate leave-one-out de SELECAO e montavel?

Pergunta: /players/{id}/stats/ traz jogos de SELECAO ou so de CLUBE? E quantos
jogos por jogador existem nas competicoes de selecao (p/ formar uma rate)?

Pega um evento FINALIZADO de eliminatoria UEFA (liga 58, populacao = selecoes da
Copa), inspeciona os actuals, e puxa o historico de alguns jogadores p/ ver se da
pra montar a rate na populacao certa. So GET. Salva dumps wc2_*.json.
"""
import json
from collections import Counter
from pathlib import Path

from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required

OUT = Path("docs/apis/bsd-bzzoiro/examples")


def save(name, obj):
    (OUT / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, indent=2)[:8000], encoding="utf-8")


def results(r):
    return (r.get("results") or []) if isinstance(r, dict) else []


def main():
    c = BSDClient(get_required("BZZOIRO_API_KEY"))

    # Universo de selecoes: eliminatorias UEFA (58) + CONMEBOL (59) finalizadas
    for lid in (58, 59):
        fin = c.events(league_id=lid, status="finished")
        evs = results(fin)
        print(f"\n=== liga {lid}: {fin.get('count')} finalizados; inspecionando 1 ===")
        if not evs:
            continue
        eid = evs[0].get("id")
        ps = c.event_player_stats(eid)
        rows = ps.get("player_stats") or results(ps)
        # distribuicao de SOT/tackle/minutos p/ ver se NAO e tudo zero
        sot = [r.get("shots_on_target") or 0 for r in rows]
        tck = [r.get("total_tackle") or 0 for r in rows]
        mins = [r.get("minutes_played") or 0 for r in rows]
        print(f"  evento {eid} {evs[0].get('home_team')} x {evs[0].get('away_team')}: {len(rows)} jogadores")
        print(f"    SOT soma={sum(sot)} max={max(sot) if sot else 0} | tackle soma={sum(tck)} max={max(tck) if tck else 0} | min soma={sum(mins)}")

        # pega 3 jogadores com minutos altos e puxa o historico de cada
        starters = sorted(rows, key=lambda r: r.get("minutes_played") or 0, reverse=True)[:3]
        for s in starters:
            pid = s.get("player_id")
            if not pid:
                continue
            hist = c.player_stats(pid)
            hres = results(hist)
            # tentar descobrir liga/competicao de cada linha do historico
            league_keys = [k for k in (hres[0].keys() if hres else []) if "league" in k.lower() or "competition" in k.lower() or "tournament" in k.lower()]
            comp_field = league_keys[0] if league_keys else None
            comps = Counter(str(r.get(comp_field)) for r in hres) if comp_field else None
            sample_keys = list(hres[0].keys()) if hres else []
            print(f"    jogador {pid} {s.get('name', '?')}: {len(hres)} linhas no historico")
            print(f"      campos da linha: {sample_keys}")
            if comp_field:
                print(f"      campo de competicao='{comp_field}' -> distrib: {dict(comps)}")
            else:
                print(f"      SEM campo de liga/competicao na linha -> nao da p/ separar selecao de clube pelo historico")
            save(f"wc2_history_{pid}", hist if isinstance(hist, dict) else {"results": hres})
            # so 1 historico por liga ja basta p/ ver a forma
            break

    print("\nDumps em", OUT.resolve())


if __name__ == "__main__":
    main()
