"""Calibração dos mercados de jogador na população de SELEÇÃO (Copa).

Replica a produção (conta pura compartilhada) em jogos de seleção já jogados,
com recorte anti-espiada e varredura 4× (escopo × amistoso). Imprime tabela de
métricas por mercado×modo. Reusa calibration.py.

Uso: .venv\\Scripts\\python.exe -m odd_analyzer.backtest.run_national_backtest <market_key> [n_per_league]
"""
import sys
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier
from odd_analyzer.model.assemble import filter_games_by_scope, player_mu_from_games, expected_minutes
from odd_analyzer.backtest.collect_national import (
    pool_targets, games_before_target, NATIONAL_LEAGUES,
)
from odd_analyzer.backtest.calibration import (
    brier_score, log_loss, expected_calibration_error, brier_skill_score, reliability_bins,
)

HOME_FACTOR, AWAY_FACTOR = 1.08, 0.92
OPP_MULT_MIN, OPP_MULT_MAX = 0.7, 1.4


def _clamp_opp(opp_conceded, league_avg):
    if opp_conceded is None or not league_avg:
        return 1.0
    return max(OPP_MULT_MIN, min(OPP_MULT_MAX, opponent_multiplier(opp_conceded, league_avg)))


def score_targets(client, targets, conceded_pg, league_avg, market, escopo):
    """PURO em relação à decisão (faz IO só pra puxar o histórico do jogador).
    Devolve ({linha:[preds]}, {linha:[actuals]}). Recorte anti-espiada + escopo + conta pura."""
    lines = market.lines
    preds = {l: [] for l in lines}
    actuals = {l: [] for l in lines}
    hist_cache = {}
    for tg in targets:
        eid = tg["event_id"]
        for row in tg["player_stats"]:
            pid = row.get("player_id")
            if pid is None:
                continue
            tid = row.get("team_id")
            is_home = (tid == tg["home_id"])
            opp_id = tg["away_id"] if is_home else tg["home_id"]
            actual_val = row.get(market.stat_field) or 0
            if pid not in hist_cache:
                try:
                    hist_cache[pid] = client.player_stats(pid).get("results", [])
                except Exception:
                    hist_cache[pid] = []
            older = games_before_target(hist_cache[pid], eid)        # anti-espiada (crescente)
            older = filter_games_by_scope(older, escopo, tid)        # escopo por team_id
            opp_mult = _clamp_opp(conceded_pg.get(opp_id), league_avg)
            ha_mult = home_away_multiplier(is_home, HOME_FACTOR, AWAY_FACTOR)
            min_esp = expected_minutes(older) or 90.0
            calc = player_mu_from_games(
                older, stat_field=market.stat_field, prior_rate=market.prior_rate,
                prior_strength=market.prior_strength, opp_mult=opp_mult, ha_mult=ha_mult,
                minutos_esperados=min_esp)
            if calc is None:
                continue
            for l in lines:
                preds[l].append(prob_over_line(calc["mu"], l, r=market.nb_dispersion))
                actuals[l].append(1 if actual_val > l else 0)
    return preds, actuals


def _report(market_key, modo, preds, actuals):
    market = MARKETS[market_key]
    print(f"\n##### {market_key} | modo={modo} #####")
    for l in market.lines:
        if not preds[l]:
            print(f"  over {l}: sem amostra"); continue
        base = sum(actuals[l]) / len(actuals[l])
        print(f"  === over {l} | n={len(preds[l])} | freq real={base:.3f} ===")
        print(f"    Brier {brier_score(preds[l], actuals[l]):.4f} | "
              f"LogLoss {log_loss(preds[l], actuals[l]):.4f} | "
              f"ECE {expected_calibration_error(preds[l], actuals[l]):.4f} | "
              f"BrierSkill {brier_skill_score(preds[l], actuals[l]):.3f}")
        for b in reliability_bins(preds[l], actuals[l]):
            print(f"      {b['bin']/10:.1f}-{(b['bin']+1)/10:.1f}: "
                  f"{b['mean_pred']:.3f}->{b['mean_actual']:.3f} (n={b['count']})")


def run_sweep(market_key, n_per_league=60):
    """Varredura 4×: {selecao, todos} × {com amistoso, sem amistoso}."""
    market = MARKETS[market_key]
    if market.nivel != "jogador":
        raise SystemExit(f"{market_key} não é mercado de jogador.")
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    for include_friendlies in (False, True):
        targets, conceded_pg, league_avg = pool_targets(
            c, NATIONAL_LEAGUES, n_per_league, market.stat_field, include_friendlies)
        amist = "com-amistoso" if include_friendlies else "sem-amistoso"
        print(f"\n======== {market_key} | {amist} | alvos={len(targets)} | "
              f"concede médio={league_avg:.2f} ========")
        for escopo in ("selecao", "todos"):
            preds, actuals = score_targets(c, targets, conceded_pg, league_avg, market, escopo)
            _report(market_key, f"{escopo}/{amist}", preds, actuals)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("uso: run_national_backtest <market_key> [n_per_league]")
    mk = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    run_sweep(mk, n)


if __name__ == "__main__":
    main()
