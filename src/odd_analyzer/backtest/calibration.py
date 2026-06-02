import math

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


def log_loss(preds: list[float], actuals: list[int], eps: float = 1e-15) -> float:
    """Entropia cruzada média. Menor = melhor. Clipa p em [eps, 1-eps] p/ evitar log(0)
    (pune erro confiante mais que o Brier)."""
    if not preds:
        raise ValueError("preds vazio")
    total = 0.0
    for p, a in zip(preds, actuals):
        p = min(max(p, eps), 1 - eps)
        total += -(a * math.log(p) + (1 - a) * math.log(1 - p))
    return total / len(preds)

def expected_calibration_error(preds: list[float], actuals: list[int], n_bins: int = 10) -> float:
    """ECE = soma ponderada por bin de |mean_pred - mean_actual|. <~0.05 = bom.
    Reusa reliability_bins (mesma binagem)."""
    if not preds:
        raise ValueError("preds vazio")
    n = len(preds)
    return sum(b["count"] / n * abs(b["mean_pred"] - b["mean_actual"])
               for b in reliability_bins(preds, actuals, n_bins))

def brier_skill_score(preds: list[float], actuals: list[int]) -> float:
    """1 - Brier/Brier_base, onde base = prever sempre a freq média (climatologia).
    >0 = bate o chute-base (tem skill); <=0 = não agrega."""
    if not preds:
        raise ValueError("preds vazio")
    base = sum(actuals) / len(actuals)
    brier_base = sum((base - a) ** 2 for a in actuals) / len(actuals)
    if brier_base == 0:
        return 0.0
    return 1.0 - brier_score(preds, actuals) / brier_base
