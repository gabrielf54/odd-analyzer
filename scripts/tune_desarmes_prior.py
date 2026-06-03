"""Sweep limitado do prior_rate de desarmes p/ minimizar ECE (linhas 0.5/1.5).
Reusa collect_bsd + score_records. Throwaway (não comitar necessariamente)."""
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.backtest.collect_bsd import collect_bsd
from odd_analyzer.backtest.run_backtest import score_records
from odd_analyzer.backtest.calibration import expected_calibration_error, brier_skill_score

m = MARKETS["desarmes"]
c = BSDClient(get_required("BZZOIRO_API_KEY"))
meta, records, conceded_pg, league_avg, hf, af = collect_bsd(c, 9, 120, m.stat_field)
print(f"jogos={len(meta)} | records={len(records)} | league_avg={league_avg:.2f} | hf={hf:.2f} af={af:.2f}")
print()
print(f"{'prior_rate':>12} | {'linha':>6} | {'ECE':>8} | {'BrierSkill':>10}")
print("-" * 48)
results = {}
for pr in (1.0, 1.3, 1.6, 2.0):
    preds, actuals = score_records(meta, records, conceded_pg, league_avg, hf, af,
        lines=m.lines, prior_rate=pr, prior_strength=m.prior_strength, nb_dispersion=m.nb_dispersion)
    eces = {}
    bsss = {}
    print(f"\nprior_rate={pr}")
    for l in (0.5, 1.5):
        ece = expected_calibration_error(preds[l], actuals[l])
        bss = brier_skill_score(preds[l], actuals[l])
        eces[l] = ece
        bsss[l] = bss
        print(f"  over {l}: ECE {ece:.4f} | BrierSkill {bss:.3f}")
    avg_ece = (eces[0.5] + eces[1.5]) / 2
    both_positive = bsss[0.5] > 0 and bsss[1.5] > 0
    results[pr] = {"avg_ece": avg_ece, "both_positive": both_positive, "eces": eces, "bsss": bsss}
    print(f"  avg_ECE(0.5+1.5)={avg_ece:.4f} | BrierSkill>0 em ambas={both_positive}")

print("\n=== DECISÃO ===")
eligible = {pr: v for pr, v in results.items() if v["both_positive"]}
if eligible:
    winner = min(eligible, key=lambda pr: eligible[pr]["avg_ece"])
    print(f"Melhor prior_rate (menor avg_ECE, BrierSkill>0 nas duas linhas): {winner}")
    print(f"  ECE 0.5={eligible[winner]['eces'][0.5]:.4f} | ECE 1.5={eligible[winner]['eces'][1.5]:.4f}")
    print(f"  avg_ECE={eligible[winner]['avg_ece']:.4f}")
else:
    print("Nenhum candidato elegível (BrierSkill>0 em ambas as linhas).")
