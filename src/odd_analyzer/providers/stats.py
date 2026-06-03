"""StatsProvider protocol + implementações skeleton.

Contrato (Protocol):
    elenco(event)          -> list[dict]   [{id, name, team_id, posicao}]
    entity_taxa(id, mkt, ctx) -> dict|None  {mu, minutos_esperados, xi_confirmado,
                                              amostra_jogos, concedido_adversario, incerteza}
    team_rates(team_id, ctx)  -> dict|None  {attack, defense} p/ match_model
"""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec


@runtime_checkable
class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]: ...
    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None: ...
    def team_rates(self, team_id, contexto: dict) -> dict | None: ...


class BSDStatsProvider:
    """Fonte primária: BSD/Bzzoiro. Implementação completa na Fase 1."""

    def __init__(self, client):
        if client is None:
            raise ValueError("BSDStatsProvider requer um BSDClient")
        self._client = client

    def elenco(self, event: dict) -> list[dict]:
        raise NotImplementedError("BSDStatsProvider.elenco — implementar na Fase 1")

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raise NotImplementedError("BSDStatsProvider.entity_taxa — implementar na Fase 1")

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        raise NotImplementedError("BSDStatsProvider.team_rates — implementar na Fase 1")


class ApiFootballStatsProvider:
    """Fallback: API-Football. Envolve stats/apifootball.py existente."""

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key

    def elenco(self, event: dict) -> list[dict]:
        raise NotImplementedError("ApiFootballStatsProvider.elenco — implementar na Fase 1")

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raise NotImplementedError("ApiFootballStatsProvider.entity_taxa — implementar na Fase 1")

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        raise NotImplementedError("ApiFootballStatsProvider.team_rates — implementar na Fase 1")


class FallbackStatsProvider:
    """Tenta BSD; se retornar None/erro, cai para API-Football. Loga a fonte servida."""

    def __init__(self, primary: BSDStatsProvider, fallback: ApiFootballStatsProvider):
        if primary is None or fallback is None:
            raise ValueError("FallbackStatsProvider requer primary e fallback não-nulos")
        self._primary = primary
        self._fallback = fallback

    def elenco(self, event: dict) -> list[dict]:
        try:
            result = self._primary.elenco(event)
            if result is not None:
                return result
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("BSD elenco falhou (%s); usando fallback", exc)
        return self._fallback.elenco(event)

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        try:
            result = self._primary.entity_taxa(entity_id, market, contexto)
            if result is not None:
                return result
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("BSD entity_taxa falhou (%s); usando fallback", exc)
        return self._fallback.entity_taxa(entity_id, market, contexto)

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        try:
            result = self._primary.team_rates(team_id, contexto)
            if result is not None:
                return result
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("BSD team_rates falhou (%s); usando fallback", exc)
        return self._fallback.team_rates(team_id, contexto)
