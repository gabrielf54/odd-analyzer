"""Backtest de calibração do modelo de SOT em jogos de clube (free: seasons 2022-2024).

Estratégia: (1) puxa as taxas-base de SoT/90 dos jogadores da liga/temporada;
(2) para uma amostra de jogos, pega o SOT REAL de cada jogador naquele jogo e os
minutos jogados; (3) prevê P(SOT >= linha) ANTES do jogo usando a taxa-base do
jogador e os minutos REAIS daquele jogo (isola o modelo de taxa do problema de
projeção de minutos); (4) compara previsão vs resultado e mede calibração.

Linhas testadas: over 0.5 e over 1.5 SOT (as mais comuns em props).
Uso: PYTHONPATH=src python -m odd_analyzer.backtest.run_backtest <league_id> <season> <n_fixtures>
"""
import sys
import time
from odd_analyzer.config import get_required
from odd_analyzer.cache import cached_get
from odd_analyzer.stats.apifootball import BASE, parse_player_sot
from odd_analyzer.model.sot_model import expected_lambda, prob_over_line
from odd_analyzer.model.shrinkage import shrink_rate
from odd_analyzer.backtest.calibration import brier_score, reliability_bins
import requests

LINHAS = [0.5, 1.5]
PRIOR_RATE = 1.0      # SoT/90 médio de prior (ajustável)
PRIOR_STRENGTH = 6    # peso do prior (em "jogos equivalentes")
NB_DISPERSION = 4.0   # r da Binomial Negativa (overdispersion moderada)
_MIN_INTERVAL = 6.5   # segundos entre chamadas ao vivo (free tier = 10 req/min)
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
    # não cacheia resposta de erro (ex.: cota diária esgotada vem como 200 + errors)
    data = cached_get(keystr, fetch, should_cache=lambda d: not d.get("errors"))
    if data.get("errors"):
        raise LimiteAtingido(f"API retornou erro/limite: {data['errors']}")
    return data

def base_rates(league_id, season):
    """Mapa player_id -> sot_per90 (com shrinkage), varrendo todas as páginas em cache."""
    rates = {}
    page = 1
    while True:
        j = _get("players", {"league": league_id, "season": season, "page": page})
        for entry in j.get("response", []):
            p = parse_player_sot(entry, league_id)
            if p:
                rates[p["player_id"]] = shrink_rate(p["sot_per90"], p["apps"], PRIOR_RATE, PRIOR_STRENGTH)
        paging = j.get("paging", {})
        if page >= paging.get("total", 1):
            break
        page += 1
    return rates

def run(league_id, season, n_fixtures):
    preds = {l: [] for l in LINHAS}
    actuals = {l: [] for l in LINHAS}
    try:
        rates = base_rates(league_id, season)
        print(f"taxas-base carregadas: {len(rates)} jogadores")
        fj = _get("fixtures", {"league": league_id, "season": season})
        fixtures = [f["fixture"]["id"] for f in fj.get("response", [])][:n_fixtures]
        print(f"jogos no backtest: {len(fixtures)}")
        for fid in fixtures:
            pj = _get("fixtures/players", {"fixture": fid})
            for team in pj.get("response", []):
                for pl in team.get("players", []):
                    pid = pl["player"]["id"]
                    st = (pl.get("statistics") or [{}])[0]
                    minutes = (st.get("games") or {}).get("minutes")
                    sot = (st.get("shots") or {}).get("on")
                    if pid not in rates or not minutes or sot is None:
                        continue
                    mu = expected_lambda(rates[pid], minutes)
                    for l in LINHAS:
                        preds[l].append(prob_over_line(mu, l, r=NB_DISPERSION))
                        actuals[l].append(1 if sot > l else 0)
    except LimiteAtingido as e:
        print(f"\n[LIMITE] {e}\nReportando resultados PARCIAIS coletados até aqui (cache preserva o progresso; rode de novo depois).")
    for l in LINHAS:
        if not preds[l]:
            print(f"\nlinha over {l}: sem amostra"); continue
        print(f"\n=== linha over {l} SOT | n={len(preds[l])} ===")
        print(f"Brier: {brier_score(preds[l], actuals[l]):.4f}  (menor = melhor; chute 'sempre a base' ~0.25)")
        print("reliability (bin: prev_média -> real_média, n):")
        for b in reliability_bins(preds[l], actuals[l]):
            print(f"  {b['bin']/10:.1f}-{(b['bin']+1)/10:.1f}: {b['mean_pred']:.3f} -> {b['mean_actual']:.3f}  (n={b['count']})")

def main():
    league = int(sys.argv[1]) if len(sys.argv) > 1 else 39      # 39 = Premier League
    season = int(sys.argv[2]) if len(sys.argv) > 2 else 2023
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    run(league, season, n)

if __name__ == "__main__":
    main()
