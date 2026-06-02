"""Backtest de calibração do modelo de SOT em jogos de clube (free: seasons 2022-2024).

Estratégia: (1) coleta registros jogador-jogo (minutos + SOT real) e metadados de
mando/defesa via /fixtures e /fixtures/players (NÃO usa /players, capado na pág. 3
no free tier); (2) para cada (jogador, jogo), estima a taxa-base SoT/90 a partir dos
OUTROS jogos do jogador (leave-one-out) com shrinkage; (3) ajusta o lambda por
minutos reais, defesa do adversário (SoT concedido) e mando; (4) prevê P(SOT >= linha)
via NegBin e compara com o resultado real → calibração (Brier + reliability bins).

Linhas: over 0.5 e over 1.5 SOT.
Uso: PYTHONPATH=src python -m odd_analyzer.backtest.run_backtest <league_id> <season> <n_fixtures>
"""
import sys
import time
from odd_analyzer.config import get_required
from odd_analyzer.cache import cached_get
from odd_analyzer.stats.apifootball import BASE
from odd_analyzer.model.sot_model import expected_lambda, prob_over_line
from odd_analyzer.model.shrinkage import shrink_rate
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier
from odd_analyzer.backtest.calibration import brier_score, reliability_bins
import requests

from odd_analyzer.model.params import (
    LINHAS, PRIOR_RATE, PRIOR_STRENGTH, NB_DISPERSION, MIN_OTHER_MINUTES,
)
_MIN_INTERVAL = 6.5      # segundos entre chamadas ao vivo (free tier = 10 req/min)
_last_call = [0.0]

class LimiteAtingido(RuntimeError):
    """A API retornou erro de limite/cota — parar com elegância (cache preserva o progresso)."""

def _throttle():
    dt = time.time() - _last_call[0]
    if dt < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - dt)
    _last_call[0] = time.time()

def _get(path, params):
    key = get_required("APIFOOTBALL_KEY")
    keystr = f"{path}?{sorted(params.items())}"
    def fetch():
        _throttle()  # só em cache MISS (chamada real); respeita 10/min
        r = requests.get(f"{BASE}/{path}", params=params,
                         headers={"x-apisports-key": key}, timeout=30)
        if r.status_code == 429:
            raise LimiteAtingido("HTTP 429 (limite por minuto/dia). Rode de novo mais tarde; o cache guarda o progresso.")
        r.raise_for_status()
        return r.json()
    data = cached_get(keystr, fetch, should_cache=lambda d: not d.get("errors"))
    if data.get("errors"):
        raise LimiteAtingido(f"API retornou erro/limite: {data['errors']}")
    return data

def collect_data(league_id, season, n_fixtures):
    """Coleta via /fixtures + /fixtures/players (cada jogo = 1 chamada).
    Retorna: meta {fid:(home_id,away_id)}, records [(fid,pid,team_id,minutes,sot)],
    conceded_pg {team:SoT concedido/jogo}, league_avg, home_factor, away_factor."""
    fj = _get("fixtures", {"league": league_id, "season": season})
    meta = {}
    for f in fj.get("response", [])[:n_fixtures]:
        meta[f["fixture"]["id"]] = (f["teams"]["home"]["id"], f["teams"]["away"]["id"])
    records = []
    t_against, t_games = {}, {}
    home_sot = away_sot = home_games = away_games = 0
    for fid in meta:
        pj = _get("fixtures/players", {"fixture": fid})
        teams = pj.get("response", [])
        if len(teams) < 2:
            continue
        sot_by_team = {}
        for t in teams:
            tid = t["team"]["id"]
            ssum = 0
            for pl in t.get("players", []):
                st = (pl.get("statistics") or [{}])[0]
                minutes = (st.get("games") or {}).get("minutes")
                if not minutes:
                    continue  # não entrou em campo
                on = (st.get("shots") or {}).get("on")
                on = on if on is not None else 0  # jogou sem SOT: API retorna null = 0
                records.append((fid, pl["player"]["id"], tid, minutes, on))
                ssum += on
            sot_by_team[tid] = ssum
        ids = list(sot_by_team)
        if len(ids) == 2:
            a, b = ids
            t_against[a] = t_against.get(a, 0) + sot_by_team[b]; t_games[a] = t_games.get(a, 0) + 1
            t_against[b] = t_against.get(b, 0) + sot_by_team[a]; t_games[b] = t_games.get(b, 0) + 1
        home_id, away_id = meta[fid]
        if home_id in sot_by_team and away_id in sot_by_team:
            home_sot += sot_by_team[home_id]; away_sot += sot_by_team[away_id]
            home_games += 1; away_games += 1
    conceded_pg = {t: t_against[t] / t_games[t] for t in t_against}
    league_avg = (sum(conceded_pg.values()) / len(conceded_pg)) if conceded_pg else 0.0
    if home_games and away_games:
        ah, aa = home_sot / home_games, away_sot / away_games
        mid = (ah + aa) / 2 or 1.0
        home_factor, away_factor = ah / mid, aa / mid
    else:
        home_factor = away_factor = 1.0
    return meta, records, conceded_pg, league_avg, home_factor, away_factor

def run(league_id, season, n_fixtures):
    preds = {l: [] for l in LINHAS}
    actuals = {l: [] for l in LINHAS}
    try:
        meta, records, conceded_pg, league_avg, home_factor, away_factor = collect_data(league_id, season, n_fixtures)
        print(f"jogos: {len(meta)} | registros jogador-jogo: {len(records)} | "
              f"SoT concedido/jogo médio: {league_avg:.2f} | mando casa/fora: {home_factor:.2f}/{away_factor:.2f}")
        tot_min, tot_sot, apps = {}, {}, {}
        for _, pid, _, m, s in records:
            tot_min[pid] = tot_min.get(pid, 0) + m
            tot_sot[pid] = tot_sot.get(pid, 0) + s
            apps[pid] = apps.get(pid, 0) + 1
        usados = 0
        for fid, pid, tid, m, s in records:
            other_min = tot_min[pid] - m            # taxa SEM o jogo previsto (leave-one-out)
            other_sot = tot_sot[pid] - s
            if other_min < MIN_OTHER_MINUTES:
                continue
            rate = shrink_rate(other_sot / other_min * 90.0, apps[pid] - 1, PRIOR_RATE, PRIOR_STRENGTH)
            mu = expected_lambda(rate, m)           # minutos REAIS (isola o modelo de taxa)
            home_id, away_id = meta[fid]
            opp = away_id if tid == home_id else home_id
            mu *= opponent_multiplier(conceded_pg.get(opp, league_avg), league_avg)
            mu *= home_away_multiplier(tid == home_id, home_factor, away_factor)
            usados += 1
            for l in LINHAS:
                preds[l].append(prob_over_line(mu, l, r=NB_DISPERSION))
                actuals[l].append(1 if s > l else 0)
        print(f"registros usados (>= {MIN_OTHER_MINUTES}min fora): {usados}")
    except LimiteAtingido as e:
        print(f"\n[LIMITE] {e}\nReportando resultados PARCIAIS coletados até aqui (cache preserva o progresso; rode de novo depois).")
    for l in LINHAS:
        if not preds[l]:
            print(f"\nlinha over {l}: sem amostra"); continue
        base = sum(actuals[l]) / len(actuals[l])
        print(f"\n=== linha over {l} SOT | n={len(preds[l])} | freq real média={base:.3f} ===")
        print(f"Brier: {brier_score(preds[l], actuals[l]):.4f}  (menor = melhor; chute 'sempre a base' = base*(1-base))")
        print("reliability (bin: prev_média -> real_média, n):")
        for b in reliability_bins(preds[l], actuals[l]):
            print(f"  {b['bin']/10:.1f}-{(b['bin']+1)/10:.1f}: {b['mean_pred']:.3f} -> {b['mean_actual']:.3f}  (n={b['count']})")

def main():
    league = int(sys.argv[1]) if len(sys.argv) > 1 else 39      # 39 = Premier League
    season = int(sys.argv[2]) if len(sys.argv) > 2 else 2023
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    run(league, season, n)

if __name__ == "__main__":
    main()
