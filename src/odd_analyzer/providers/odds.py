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


class TheOddsApiMatchOdds:
    """Odds de PARTIDA via The Odds API (gols=totals, vitoria=h2h). Casa o evento do
    BSD com o do The Odds API por NOME de time (sem id compartilhado entre as fontes).

    Arena = Copa (sport_key default 'soccer_fifa_world_cup'). Props de jogador NÃO
    são cobertas por nenhuma fonte barata → ficam manuais (follow-up odds-prop-jogador).
    fetch_*_fn injetáveis p/ testar offline; default = o módulo real (com cache).
    """

    def __init__(self, sport_key: str = "soccer_fifa_world_cup",
                 regions: str = "us,uk,eu",
                 fetch_events_fn=None, fetch_event_odds_fn=None):
        from odd_analyzer.odds import the_odds_api as _api
        self._sport = sport_key
        self._regions = regions
        self._fetch_events = fetch_events_fn or _api.fetch_events
        self._fetch_odds = fetch_event_odds_fn or _api.fetch_event_odds

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        from odd_analyzer.odds.the_odds_api import (
            ODDSAPI_MATCH_MARKET, find_event, parse_totals, parse_h2h,
        )
        oddsapi_market = ODDSAPI_MATCH_MARKET.get(market.key)
        if oddsapi_market is None:
            return []
        home = (event.get("home_team") or {}).get("name", "")
        away = (event.get("away_team") or {}).get("name", "")
        try:
            events = self._fetch_events(self._sport)
            matched = find_event(events, home, away)
            if matched is None:
                return []
            ev_odds = self._fetch_odds(self._sport, matched["id"],
                                       markets=oddsapi_market, regions=self._regions)
        except Exception:
            return []
        if oddsapi_market == "totals":
            return parse_totals(ev_odds)
        return parse_h2h(ev_odds, home, away)


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
