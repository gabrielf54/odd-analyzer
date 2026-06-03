"""Calibração no dado vivo do BSD, por mercado de contagem de JOGADOR.
Reusa score_records (puro) — só troca a fonte (BSD em vez de API-Football).

Uso: .venv\\Scripts\\python.exe -m odd_analyzer.backtest.run_bsd_backtest <market_key> [league_id] [n_events]
  ex.: ... run_bsd_backtest desarmes 9 120
"""
import sys
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.backtest.collect_bsd import collect_bsd
from odd_analyzer.backtest.run_backtest import score_records
from odd_analyzer.backtest.calibration import (
    brier_score, log_loss, expected_calibration_error, brier_skill_score, reliability_bins,
)

def run(market_key, league_id=9, n_events=120):
    market = MARKETS[market_key]
    if market.nivel == "partida":
        from odd_analyzer.backtest.collect_bsd import collect_bsd_team
        from odd_analyzer.model.sot_model import prob_over_line
        c = BSDClient(get_required("BZZOIRO_API_KEY"))
        team_field = "corner_kicks" if market.stat_field == "corners" else market.stat_field
        totais, _ = collect_bsd_team(c, league_id, n_events, team_field)
        if not totais:
            raise SystemExit("sem amostra de totais")
        mu = sum(totais) / len(totais)   # baseline simples: média da liga (sem matchup no backtest)
        print(f"mercado={market_key} | jogos={len(totais)} | média total/jogo={mu:.2f}")
        for l in market.lines:
            preds = [prob_over_line(mu, l, r=market.nb_dispersion)] * len(totais)
            actuals = [1 if t > l else 0 for t in totais]
            base = sum(actuals) / len(actuals)
            print(f"\n=== {market_key} over {l} | n={len(totais)} | freq real={base:.3f} ===")
            print(f"Brier {brier_score(preds, actuals):.4f} | ECE {expected_calibration_error(preds, actuals):.4f} | "
                  f"BrierSkill {brier_skill_score(preds, actuals):.3f}")
        return
    if market.nivel != "jogador":
        raise SystemExit(f"{market_key} não é mercado de jogador (use o caminho de partida).")
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    meta, records, conceded_pg, league_avg, hf, af = collect_bsd(
        c, league_id, n_events, market.stat_field)
    print(f"mercado={market_key} ({market.stat_field}) | jogos={len(meta)} | "
          f"records={len(records)} | concedido/jogo médio={league_avg:.2f} | mando {hf:.2f}/{af:.2f}")
    preds, actuals = score_records(
        meta, records, conceded_pg, league_avg, hf, af,
        lines=market.lines, prior_rate=market.prior_rate,
        prior_strength=market.prior_strength, nb_dispersion=market.nb_dispersion)
    for l in market.lines:
        if not preds[l]:
            print(f"\nover {l}: sem amostra"); continue
        base = sum(actuals[l]) / len(actuals[l])
        print(f"\n=== {market_key} over {l} | n={len(preds[l])} | freq real={base:.3f} ===")
        print(f"Brier {brier_score(preds[l], actuals[l]):.4f} | "
              f"LogLoss {log_loss(preds[l], actuals[l]):.4f} | "
              f"ECE {expected_calibration_error(preds[l], actuals[l]):.4f} | "
              f"BrierSkill {brier_skill_score(preds[l], actuals[l]):.3f}")
        for b in reliability_bins(preds[l], actuals[l]):
            print(f"  {b['bin']/10:.1f}-{(b['bin']+1)/10:.1f}: "
                  f"{b['mean_pred']:.3f}->{b['mean_actual']:.3f} (n={b['count']})")

def main():
    if len(sys.argv) < 2:
        raise SystemExit("uso: run_bsd_backtest <market_key> [league_id] [n_events]")
    run(sys.argv[1],
        int(sys.argv[2]) if len(sys.argv) > 2 else 9,
        int(sys.argv[3]) if len(sys.argv) > 3 else 120)

if __name__ == "__main__":
    main()
