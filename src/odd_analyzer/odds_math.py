def american_to_decimal(value: str | float) -> float:
    """Converte odd americana (ex.: '-120', '+150') para decimal.
    Se o valor já parecer decimal (tem ponto e não tem sinal), retorna como float.

    Assunção: odds decimais chegam SEM sinal (ex.: '1.83'); odds americanas
    chegam com sinal ('-120'/'+150') ou como inteiro sem ponto ('100'). Um
    decimal COM sinal (ex.: '+2.50') cairia no caminho americano e daria valor
    errado — não esperado vindo da SGO, mas validar a forma real na Fase 0."""
    s = str(value).strip()
    if "." in s and not s.startswith(("+", "-")):
        return float(s)
    a = float(s)
    if a > 0:
        return round(1 + a / 100, 4)
    return round(1 + 100 / abs(a), 4)
