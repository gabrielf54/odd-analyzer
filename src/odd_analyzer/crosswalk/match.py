"""Liga o nome do jogador na odd (The Odds API) ao ID do elenco (API-Football).
NFKD->ASCII + difflib (stdlib, sem rapidfuzz). FAIL-CLOSED: sem match confiável
acima do threshold, retorna None (nunca chuta jogador)."""
import unicodedata
from difflib import SequenceMatcher

def normalize(nome: str) -> str:
    s = unicodedata.normalize("NFKD", nome)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().split())

def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()

def match_player(odd_name: str, elenco: list[dict],
                 overrides: dict | None = None, threshold: float = 0.90) -> dict | None:
    n = normalize(odd_name)
    if overrides:
        overrides = {normalize(k): v for k, v in overrides.items()}  # tolera chave não-normalizada
    if overrides and n in overrides:
        oid = overrides[n]
        nome = next((p["name"] for p in elenco if p["id"] == oid), odd_name)
        return {"id": oid, "name": nome, "confianca": 1.0}
    melhor, score = None, 0.0
    for p in elenco:
        s = _sim(n, normalize(p["name"]))
        if s > score:
            melhor, score = p, s
    if melhor is None or score < threshold:
        return None  # fail-closed
    return {"id": melhor["id"], "name": melhor["name"], "confianca": round(score, 3)}
