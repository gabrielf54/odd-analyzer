"""Diagnóstico (throwaway): o gap de calibração em seleção é TAXA ou MINUTOS?

Compara, no mesmo conjunto de jogos-alvo de seleção, o ECE/BrierSkill com:
  (A) projeção de 90 min (como a PRODUÇÃO faz hoje) — mu_90
  (B) minutos REAIS do jogo-alvo (isola a taxa, como o backtest da liga 9) — mu_real = mu_90 * min_real/90

Se (B) calibra muito melhor que (A) → o gap é MINUTOS (fix = modelar minutos esperados).
Se (B) continua ruim → o gap é a TAXA (fix = re-tunar priors de seleção).

Uso: .venv\\Scripts\\python.exe scripts\\diag_minutos_selecao.py [market_key] [n_per_league]
"""
import sys
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier
from odd_analyzer.model.assemble import filter_games_by_scope, player_mu_from_games
from odd_analyzer.backtest.collect_national import pool_targets, games_before_target, NATIONAL_LEAGUES
from odd_analyzer.backtest.calibration import (
    brier_score, expected_calibration_error, brier_skill_score,
)

HOME_FACTOR, AWAY_FACTOR = 1.08, 0.92
OPP_MULT_MIN, OPP_MULT_MAX = 0.7, 1.4


def _clamp_opp(opp_conceded, league_avg):
    if opp_conceded is None or not league_avg:
        return 1.0
    return max(OPP_MULT_MIN, min(OPP_MULT_MAX, opponent_multiplier(opp_conceded, league_avg)))


def main():
    mk = sys.argv[1] if len(sys.argv) > 1 else "desarmes"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    market = MARKETS[mk]
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    targets, conceded_pg, league_avg = pool_targets(
        c, NATIONAL_LEAGUES, n, market.stat_field, include_friendlies=True)
    lines = market.lines
    # dois conjuntos de previsões sobre os MESMOS atuais
    preds90 = {l: [] for l in lines}
    predsR = {l: [] for l in lines}
    actuals = {l: [] for l in lines}
    hist = {}
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
            min_real = row.get("minutes_played") or 0
            if min_real <= 0:
                continue
            if pid not in hist:
                try:
                    hist[pid] = c.player_stats(pid).get("results", [])
                except Exception:
                    hist[pid] = []
            older = filter_games_by_scope(games_before_target(hist[pid], eid), "selecao", tid)
            opp_mult = _clamp_opp(conceded_pg.get(opp_id), league_avg)
            ha_mult = home_away_multiplier(is_home, HOME_FACTOR, AWAY_FACTOR)
            calc = player_mu_from_games(older, stat_field=market.stat_field,
                                        prior_rate=market.prior_rate, prior_strength=market.prior_strength,
                                        opp_mult=opp_mult, ha_mult=ha_mult)
            if calc is None:
                continue
            mu90 = calc["mu"]
            mu_real = mu90 * (min_real / 90.0)   # escala pela presença real
            for l in lines:
                preds90[l].append(prob_over_line(mu90, l, r=market.nb_dispersion))
                predsR[l].append(prob_over_line(mu_real, l, r=market.nb_dispersion))
                actuals[l].append(1 if actual_val > l else 0)

    print(f"mercado={mk} | alvos={len(targets)} | escopo=selecao+amistoso | n_per_league={n}")
    print(f"{'linha':>10} {'freq':>6} | {'ECE_90':>7} {'BS_90':>7} | {'ECE_real':>8} {'BS_real':>8}")
    for l in lines:
        if not actuals[l]:
            continue
        fr = sum(actuals[l]) / len(actuals[l])
        e90 = expected_calibration_error(preds90[l], actuals[l])
        b90 = brier_skill_score(preds90[l], actuals[l])
        er = expected_calibration_error(predsR[l], actuals[l])
        br = brier_skill_score(predsR[l], actuals[l])
        print(f"  over {l:>4} {fr:>6.3f} | {e90:>7.4f} {b90:>+7.3f} | {er:>8.4f} {br:>+8.3f}")


if __name__ == "__main__":
    main()
