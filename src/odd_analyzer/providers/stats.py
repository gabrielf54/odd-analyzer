"""StatsProvider protocol + implementações skeleton.

Contrato (Protocol):
    elenco(event)          -> list[dict]   [{id, name, team_id, posicao}]
    entity_taxa(id, mkt, ctx) -> dict|None  {mu, minutos_esperados, xi_confirmado,
                                              amostra_jogos, concedido_adversario, incerteza}
    team_rates(team_id, ctx)  -> dict|None  {attack, defense} p/ match_model
"""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec
from odd_analyzer.model.assemble import windowed_rate, assemble_mu
from odd_analyzer.model.shrinkage import shrink_rate
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier


@runtime_checkable
class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]: ...
    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None: ...
    def team_rates(self, team_id, contexto: dict) -> dict | None: ...


class BSDStatsProvider:
    """Fonte primária: BSD/Bzzoiro. Implementação completa na Fase 1."""

    HOME_FACTOR = 1.08
    AWAY_FACTOR = 0.92

    def __init__(self, client):
        if client is None:
            raise ValueError("BSDStatsProvider requer um BSDClient")
        self._client = client

    def elenco(self, event: dict) -> list[dict]:
        # Forma REAL: {lineups: {home: {team_id, players:[...], substitutes:[...]}, away:{...}}}
        # Titulares = `players` (suplentes ficam em `substitutes` e NÃO entram).
        data = self._client.lineups(event["id"])
        lineups = data.get("lineups", {})
        players: list[dict] = []
        for side in ("home", "away"):
            side_data = lineups.get(side, {})
            team_id = str(side_data.get("team_id", ""))
            for p in side_data.get("players", []):
                players.append({
                    "id": str(p["id"]),
                    "name": p["name"],
                    "team_id": team_id,
                    "posicao": p.get("position", ""),
                })
        return players

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        if market.kind != "contagem":
            return None
        event = contexto["event"]
        is_home: bool = contexto.get("is_home", False)
        league_avg: float = contexto.get("league_avg_conceded", 1.0)
        xi_team_ids: set = contexto.get("xi_team_ids", set())
        entity_team_id = str(contexto.get("entity_team_id", entity_id))

        raw = self._client.player_stats(entity_id)
        # Forma REAL de /players/{id}/stats/: {count,next,previous, results:[{...campos flat...}]}.
        # Cada row já tem o campo do mercado (total_tackle/shots_on_target/total_shots) — alimenta
        # windowed_rate direto. (Sem `mando` no payload → sem split casa/fora no v1; ver follow-up.)
        games: list[dict] = raw.get("results", [])
        if not games:
            return None

        rates = windowed_rate(games, market.stat_field)
        w5, w3, w10 = rates.get("w5"), rates.get("w3"), rates.get("w10")
        raw_rate = w5 if w5 is not None else (w3 if w3 is not None else w10)
        if raw_rate is None:
            return None

        shrunk = shrink_rate(rate=raw_rate, apps=len(games),
                             prior_rate=market.prior_rate, prior_strength=market.prior_strength)
        # Concessão do adversário: /events/{id}/team-stats/ dá 404 no BSD real → degrada p/
        # league_avg (matchup NEUTRO no v1). Concessão por-mercado real (via /events/{id}/stats/
        # ou agregação de event_player_stats) é follow-up da doutrina de confronto.
        try:
            team_stats = self._client.team_stats(event["id"])
            opp_side = "away" if is_home else "home"
            opp_conceded = float(team_stats.get(opp_side, {}).get(market.stat_field, league_avg))
        except Exception:
            opp_conceded = league_avg

        opp_mult = opponent_multiplier(opp_conceded, league_avg)
        ha_mult = home_away_multiplier(is_home, self.HOME_FACTOR, self.AWAY_FACTOR)
        minutos_esperados = 90.0
        mu = assemble_mu(rate_per90=shrunk, minutos_esperados=minutos_esperados,
                         opp_mult=opp_mult, ha_mult=ha_mult)
        xi_confirmado = (entity_team_id in xi_team_ids) if xi_team_ids else True
        n = len(games)
        incerteza = "alta" if n < 5 else ("media" if n < 12 else "baixa")
        return {
            "mu": mu, "minutos_esperados": minutos_esperados,
            "xi_confirmado": xi_confirmado, "amostra_jogos": n,
            "concedido_adversario": str(opp_conceded), "incerteza": incerteza,
        }

    # market.stat_field (de jogador) → nome do campo no /events/{id}/stats/ (nível TIME).
    _TEAM_STAT_FIELD = {
        "corners": "corner_kicks",
        "total_tackle": "total_tackles",
        "shots_on_target": "shots_on_target",
        "total_shots": "total_shots",
    }

    def team_taxa(self, team_id, market: MarketSpec, contexto: dict, janela: int = 10) -> dict | None:
        """Taxa por-TIME (#25): agrega o stat de time (ex.: corner_kicks) nos últimos
        jogos finalizados do time. Resolve nivel=partida (escanteios) sem player_stats."""
        if market.kind != "contagem":
            return None
        team_id = str(team_id)
        team_field = self._TEAM_STAT_FIELD.get(market.stat_field, market.stat_field)

        events = self._client.events(team_id=team_id, status="finished", limit=janela)
        results = events.get("results", []) if isinstance(events, dict) else []
        games: list[dict] = []
        for ev in results[:janela]:
            side = "home" if str(ev.get("home_team_id")) == team_id else "away"
            try:
                stats = self._client.event_stats(ev["id"]).get("stats", {})
                valor = stats.get(side, {}).get(team_field)
            except Exception:
                valor = None
            if valor is not None:
                games.append({team_field: valor})
        if not games:
            return None

        rates = windowed_rate(games, team_field)
        w5, w3, w10 = rates.get("w5"), rates.get("w3"), rates.get("w10")
        raw_rate = w5 if w5 is not None else (w3 if w3 is not None else w10)
        if raw_rate is None:
            return None

        shrunk = shrink_rate(rate=raw_rate, apps=len(games),
                             prior_rate=market.prior_rate, prior_strength=market.prior_strength)
        is_home: bool = contexto.get("is_home", False)
        ha_mult = home_away_multiplier(is_home, self.HOME_FACTOR, self.AWAY_FACTOR)
        # Concessão do adversário NEUTRA no v1 (mesmo follow-up do caminho de jogador).
        mu = assemble_mu(rate_per90=shrunk, minutos_esperados=90.0, opp_mult=1.0, ha_mult=ha_mult)
        n = len(games)
        incerteza = "alta" if n < 5 else ("media" if n < 12 else "baixa")
        return {
            "mu": mu, "minutos_esperados": 90.0,
            "xi_confirmado": True, "amostra_jogos": n,
            "concedido_adversario": "n/d", "incerteza": incerteza,
        }

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        return None


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
