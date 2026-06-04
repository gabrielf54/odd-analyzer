"""Gera fixtures douradas do motor Python p/ o gate de paridade do port TS.
Saída: ts/test/parity/golden/engine.json. Roda com a .venv do projeto."""
import json, os, sys
sys.path.insert(0, "src")
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.match_model import score_matrix, probs_1x2, prob_total_over
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev

count = []
for mu in [0.3, 0.8, 1.5, 2.7, 4.2, 7.1]:
    for line in [0.5, 1.5, 2.5, 3.5]:
        for r in [None, 1.5, 4.0, 12.0]:
            count.append({"mu": mu, "line": line, "r": r, "prob": prob_over_line(mu, line, r)})

match = []
for lh in [0.7, 1.1, 1.8, 2.5]:
    for la in [0.6, 1.0, 1.5]:
        m = score_matrix(lh, la)
        p = probs_1x2(m)
        match.append({
            "lh": lh, "la": la,
            "home": p["home"], "draw": p["draw"], "away": p["away"],
            "over15": prob_total_over(m, 1.5), "over25": prob_total_over(m, 2.5),
        })

value = []
for oo in [1.4, 1.8, 1.91, 2.1, 3.2]:
    for ou in [1.8, 1.91, 2.0, 2.5]:
        fp = fair_prob_over(oo, ou)
        m = edge_ev(0.55, fp, oo)
        value.append({"oo": oo, "ou": ou, "fair_over": fp, "edge": m["edge"], "ev": m["ev"]})

out = {"count": count, "match": match, "value": value}
dest = os.path.join("ts", "test", "parity", "golden", "engine.json")
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest, "w", encoding="utf-8") as f:
    json.dump(out, f)
print(f"golden: {len(count)} count, {len(match)} match, {len(value)} value -> {dest}")
