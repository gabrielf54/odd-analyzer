def american_to_decimal(value: str | float) -> float:
    """Converte odd americana (ex.: '-120', '+150') para decimal.
    Se o valor já parecer decimal (tem ponto e não tem sinal), retorna como float."""
    s = str(value).strip()
    if "." in s and not s.startswith(("+", "-")):
        return float(s)
    a = float(s)
    if a > 0:
        return round(1 + a / 100, 4)
    return round(1 + 100 / abs(a), 4)
