"""OddsProvider protocol + implementações.

Contrato (Protocol):
    linhas(event, market) -> list[dict]
        contagem : [{entidade, linha, odd_over, odd_under, book}]
        partida_1x2: [{lado, odd}]  lado in {"home", "draw", "away"}
"""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec

# Mapeamento market.key → chave de mercado no BSD
_BSD_MARKET_KEY: dict[str, str] = {
    "escanteios": "corners_total",
    "gols": "goals_total",
    "vitoria": "match_winner",
}


@runtime_checkable
class OddsProvider(Protocol):
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]: ...


class NullOdds:
    """Sem odds externas — modo modelo-only. EV não é calculado."""

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return []


class ManualOdds:
    """Odds fornecidas manualmente pelo usuário (colar da casa)."""

    def __init__(self, linhas: list[dict]):
        self._linhas = linhas

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return self._linhas


class PropOddsProvider:
    """Slot reservado para feed de odds de props de jogador (futuro).
    Raise NotImplementedError até haver um feed barato disponível."""

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raise NotImplementedError(
            "PropOddsProvider não tem fonte implementada — "
            "use ManualOdds para inserir odds de props manualmente."
        )


class BSDMatchOdds:
    """Odds de partida via BSD /events/{id}/odds/. Implementação completa na Fase 1."""

    def __init__(self, client=None):
        self._client = client

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        bsd_market_key = _BSD_MARKET_KEY.get(market.key)
        if bsd_market_key is None:
            return []
        try:
            data = self._client.event_odds(event["id"])
        except Exception:
            return []
        grouped: dict[tuple, dict] = {}
        for bm in data.get("bookmakers", []):
            book = bm.get("name", "")
            for mk in bm.get("markets", []):
                if mk.get("key") != bsd_market_key:
                    continue
                for outcome in mk.get("outcomes", []):
                    name = (outcome.get("name") or "").lower()
                    point = outcome.get("point")
                    price = outcome.get("price")
                    if point is None or price is None:
                        continue
                    entry = grouped.setdefault(
                        (book, point),
                        {"entidade": "partida", "linha": point,
                         "odd_over": None, "odd_under": None, "book": book},
                    )
                    if name == "over":
                        entry["odd_over"] = price
                    elif name == "under":
                        entry["odd_under"] = price
        return [l for l in grouped.values() if l["odd_over"] and l["odd_under"]]
