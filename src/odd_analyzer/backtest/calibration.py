def brier_score(preds: list[float], actuals: list[int]) -> float:
    """Erro quadrático médio entre probabilidade prevista e resultado (0/1).
    Menor = melhor; 0 = perfeito."""
    if not preds:
        raise ValueError("preds vazio")
    return sum((p - a) ** 2 for p, a in zip(preds, actuals)) / len(preds)

def reliability_bins(preds: list[float], actuals: list[int], n_bins: int = 10) -> list[dict]:
    """Agrupa previsões em n_bins faixas [0,1] e mede prob média prevista vs
    frequência real. Bom modelo: mean_pred ≈ mean_actual em cada bin."""
    buckets = [[] for _ in range(n_bins)]
    for p, a in zip(preds, actuals):
        idx = min(int(p * n_bins), n_bins - 1)
        buckets[idx].append((p, a))
    out = []
    for i, b in enumerate(buckets):
        if not b:
            continue
        out.append({
            "bin": i,
            "mean_pred": sum(p for p, _ in b) / len(b),
            "mean_actual": sum(a for _, a in b) / len(b),
            "count": len(b),
        })
    return out
