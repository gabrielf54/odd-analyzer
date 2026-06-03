"""OddsProvider protocol + implementações.

Contrato (Protocol):
    linhas(event, market) -> list[dict]
        contagem : [{entidade, linha, odd_over, odd_under, book}]
        partida_1x2: [{lado, odd}]  lado in {"home", "draw", "away"}
"""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec


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
        raise NotImplementedError("BSDMatchOdds.linhas — implementar na Fase 1")
