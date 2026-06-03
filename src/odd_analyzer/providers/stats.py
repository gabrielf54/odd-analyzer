"""StatsProvider protocol + implementações skeleton.

Contrato (Protocol):
    elenco(event)          -> list[dict]   [{id, name, team_id, posicao}]
    entity_taxa(id, mkt, ctx) -> dict|None  {mu, minutos_esperados, xi_confirmado,
                                              amostra_jogos, concedido_adversario, incerteza}
    team_rates(team_id, ctx)  -> dict|None  {attack, defense} p/ match_model
"""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec
from odd_analyzer.model.assemble import (
    windowed_rate, assemble_mu, filter_games_by_scope, player_mu_from_games, expected_minutes,
)
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
    # Clamp do multiplicador de matchup: um adversário esquisito (ou baseline torto,
    # já que é prior estático pré-calibração) não pode explodir/zerar o mu. Banda
    # estreita = matchup ajusta, não domina. A revisar quando houver league-sweep (Fase 4).
    OPP_MULT_MIN = 0.7
    OPP_MULT_MAX = 1.4

    def __init__(self, client):
        if client is None:
            raise ValueError("BSDStatsProvider requer um BSDClient")
        self._client = client

    def _opp_team_id(self, contexto: dict) -> str | None:
        """Id do adversário: explícito no contexto, ou derivado do event (o outro time)."""
        explicit = contexto.get("opp_team_id")
        if explicit:
            return str(explicit)
        event = contexto.get("event", {})
        is_home = contexto.get("is_home", False)
        other = event.get("away_team" if is_home else "home_team", {})
        oid = other.get("id")
        return str(oid) if oid else None

    def _team_conceded(self, opp_team_id, team_field: str, janela: int = 10) -> float | None:
        """Concessão do adversário no eixo: média do que os adversários DELE produzem
        (lado oposto) por jogo, no histórico finalizado. None se sem dado."""
        if not opp_team_id:
            return None
        opp_team_id = str(opp_team_id)
        try:
            events = self._client.events(team_id=opp_team_id, status="finished", limit=janela)
        except Exception:
            return None
        results = events.get("results", []) if isinstance(events, dict) else []
        valores: list[float] = []
        for ev in results[:janela]:
            conceded_side = "away" if str(ev.get("home_team_id")) == opp_team_id else "home"
            try:
                stats = self._client.event_stats(ev["id"]).get("stats", {})
                valor = stats.get(conceded_side, {}).get(team_field)
            except Exception:
                valor = None
            if valor is not None:
                valores.append(float(valor))
        if not valores:
            return None
        return sum(valores) / len(valores)

    def _opp_mult(self, opp_conceded, league_avg: float) -> float:
        """opponent_multiplier + clamp. opp_conceded None → neutro (1.0)."""
        if opp_conceded is None:
            return 1.0
        mult = opponent_multiplier(opp_conceded, league_avg)
        return max(self.OPP_MULT_MIN, min(self.OPP_MULT_MAX, mult))

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

        try:
            raw = self._client.player_stats(entity_id)
        except Exception:
            # id que não resolve em /players/{id}/stats/ (ex.: lineup-id sem crosswalk)
            # não pode derrubar a análise — sem histórico = sem sinal.
            return None
        results: list[dict] = raw.get("results", [])
        if not results:
            return None
        # BSD entrega mais-recente-primeiro; a conta pura espera crescente (recente no fim).
        games = list(reversed(results))
        # Escopo de histórico (escolha do usuário): 'todos' (default, = comportamento atual),
        # 'selecao' (mesma camisa do jogo-alvo) ou 'clube' (outras camisas).
        escopo = contexto.get("escopo_historico", "todos")
        games = filter_games_by_scope(games, escopo, entity_team_id)
        if not games:
            return None

        opp_team_id = self._opp_team_id(contexto)
        team_field = self._TEAM_STAT_FIELD.get(market.stat_field, market.stat_field)
        opp_conceded = self._team_conceded(opp_team_id, team_field)
        opp_mult = self._opp_mult(opp_conceded, league_avg)
        ha_mult = home_away_multiplier(is_home, self.HOME_FACTOR, self.AWAY_FACTOR)
        minutos_esperados = expected_minutes(games) or 90.0

        calc = player_mu_from_games(
            games, stat_field=market.stat_field, prior_rate=market.prior_rate,
            prior_strength=market.prior_strength, opp_mult=opp_mult, ha_mult=ha_mult,
            minutos_esperados=minutos_esperados)
        if calc is None:
            return None
        xi_confirmado = (str(entity_id) in xi_team_ids) if xi_team_ids else True
        n = calc["n"]
        incerteza = "alta" if n < 5 else ("media" if n < 12 else "baixa")
        concedido = f"{opp_conceded:.1f}" if opp_conceded is not None else "n/d (neutro)"
        return {
            "mu": calc["mu"], "minutos_esperados": minutos_esperados,
            "xi_confirmado": xi_confirmado, "amostra_jogos": n,
            "concedido_adversario": concedido, "incerteza": incerteza,
        }

    # market.stat_field (de jogador) → nome do campo no /events/{id}/stats/ (nível TIME).
    _TEAM_STAT_FIELD = {
        "corners": "corner_kicks",
        "total_tackle": "total_tackles",
        "shots_on_target": "shots_on_target",
        "total_shots": "total_shots",
    }

    def xi_ids(self, event: dict) -> set:
        """Set de player_ids titulares se o lineup estiver confirmado; senão set vazio
        (gate inerte = não barra, comportamento atual em jogo finalizado)."""
        try:
            data = self._client.lineups(event["id"])
        except Exception:
            return set()
        lineups = data.get("lineups", {})
        status = data.get("lineup_status")
        confirmed_flag = any(v.get("confirmed") for v in lineups.values() if isinstance(v, dict))
        if status != "confirmed" and not confirmed_flag:
            return set()  # sem confirmação → não barrar
        ids = set()
        for side in ("home", "away"):
            for p in lineups.get(side, {}).get("players", []):
                ids.add(str(p["id"]))
        return ids

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

        # BSD events vêm decrescente; windowed_rate espera crescente (recente no fim).
        games = list(reversed(games))
        rates = windowed_rate(games, team_field)
        w5, w3, w10 = rates.get("w5"), rates.get("w3"), rates.get("w10")
        raw_rate = w5 if w5 is not None else (w3 if w3 is not None else w10)
        if raw_rate is None:
            return None

        shrunk = shrink_rate(rate=raw_rate, apps=len(games),
                             prior_rate=market.prior_rate, prior_strength=market.prior_strength)
        is_home: bool = contexto.get("is_home", False)
        ha_mult = home_away_multiplier(is_home, self.HOME_FACTOR, self.AWAY_FACTOR)
        # Matchup REAL: concessão do adversário no MESMO eixo (escanteios que ele cede).
        league_avg = contexto.get("league_avg_conceded", market.concede_baseline)
        opp_conceded = self._team_conceded(self._opp_team_id(contexto), team_field, janela)
        opp_mult = self._opp_mult(opp_conceded, league_avg)
        mu = assemble_mu(rate_per90=shrunk, minutos_esperados=90.0, opp_mult=opp_mult, ha_mult=ha_mult)
        n = len(games)
        incerteza = "alta" if n < 5 else ("media" if n < 12 else "baixa")
        concedido = f"{opp_conceded:.1f}" if opp_conceded is not None else "n/d (neutro)"
        return {
            "mu": mu, "minutos_esperados": 90.0,
            "xi_confirmado": True, "amostra_jogos": n,
            "concedido_adversario": concedido, "incerteza": incerteza,
        }

    def team_rates(self, team_id, contexto: dict, janela: int = 10) -> dict | None:
        """Gols-for (ataque) e gols-against (defesa) médios do histórico finalizado.
        match_model combina: lambda_side = ataque_proprio × defesa_adversario / media_liga.
        None se sem dado."""
        team_id = str(team_id)
        try:
            evs = self._client.events(team_id=team_id, status="finished", limit=janela)
        except Exception:
            return None
        results = evs.get("results", []) if isinstance(evs, dict) else []
        gols_for, gols_against = [], []
        for ev in results[:janela]:
            if str(ev.get("home_team_id")) == team_id:
                g, c = ev.get("home_score"), ev.get("away_score")
            else:
                g, c = ev.get("away_score"), ev.get("home_score")
            if g is not None:
                gols_for.append(float(g))
            if c is not None:
                gols_against.append(float(c))
        if not gols_for:
            return None
        return {
            "lambda_for": sum(gols_for) / len(gols_for),
            "lambda_against": (sum(gols_against) / len(gols_against)) if gols_against else sum(gols_for) / len(gols_for),
        }


class CrosswalkStatsProvider:
    """Envolve um StatsProvider (BSD) e resolve os player_ids da escalação (namespace
    do lineup, que dá 404 em /players/{id}/stats/) p/ os stats-ids reais, casando por
    NOME via os jogadores recentes de cada time. elenco()/xi_ids() saem em stats-id;
    entity_taxa/team_taxa/team_rates delegam ao provider real (recebem stats-id já
    resolvido). Sem isto, o motor não acha o histórico de quem está escalado."""

    def __init__(self, inner, client, n_jogos: int = 5, threshold: float = 0.85):
        if inner is None or client is None:
            raise ValueError("CrosswalkStatsProvider requer inner e client não-nulos")
        self._inner = inner
        self._client = client
        self._n = n_jogos
        self._threshold = threshold

    def elenco(self, event: dict) -> list[dict]:
        from odd_analyzer.crosswalk.bsd_ids import construir_mapa_time, resolver
        brutos = self._inner.elenco(event)
        out: list[dict] = []
        for team_id in dict.fromkeys(p.get("team_id", "") for p in brutos):
            grupo = [p for p in brutos if p.get("team_id", "") == team_id]
            mapa = construir_mapa_time(self._client, team_id, self._n)
            out.extend(resolver(grupo, mapa, self._threshold))
        return out

    def xi_ids(self, event: dict) -> set:
        inner_xi = self._inner.xi_ids(event) if hasattr(self._inner, "xi_ids") else set()
        if not inner_xi:
            return set()  # sem confirmação → gate inerte (igual ao provider base)
        return {p["id"] for p in self.elenco(event)}

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        return self._inner.entity_taxa(entity_id, market, contexto)

    def team_taxa(self, *args, **kwargs):
        return self._inner.team_taxa(*args, **kwargs)

    def team_rates(self, *args, **kwargs):
        return self._inner.team_rates(*args, **kwargs)


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
