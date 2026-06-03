"""Tests for BSDStatsProvider — all offline, BSD client responses are fakes.

Fixtures inline usam a FORMA REAL do BSD (inspecionada via `cli.py bsd-probe 7166`,
que dumpa em .probe_dumps/ — descartável/gitignorado, não é input destes testes):
  - lineups    : {lineups: {home: {team_id, players:[{id,name,position}], substitutes:[...]}, away:{...}}}
  - player_stats: {count,next,previous, results:[{player_id, minutes_played, total_tackle, shots_on_target, total_shots, ...}]}
  - /events/{id}/stats/ é a fonte de stats de time (/team-stats/ dá 404).
"""
import pytest
from odd_analyzer.providers.stats import BSDStatsProvider
from odd_analyzer.model.markets import MARKETS

FIXTURE_LINEUPS = {
    "event_id": 7166,
    "lineup_status": "confirmed",
    "beta": False,
    "lineups": {
        "home": {
            "team_id": 150,
            "team_name": "Cruzeiro",
            "formation": "4-2-3-1",
            "players": [
                {"id": 3946, "name": "Otávio", "position": "G"},
                {"id": 1867, "name": "M. Pereira", "position": "M"},
            ],
            "substitutes": [
                {"id": 1874, "name": "M. Henrique", "position": "M"},
            ],
        },
        "away": {
            "team_id": 153,
            "team_name": "Fluminense",
            "formation": "4-3-3",
            "players": [
                {"id": 2001, "name": "Fábio", "position": "G"},
            ],
            "substitutes": [],
        },
    },
}

# 10 jogos (newest-first), forma real de /players/{id}/stats/. total_tackle p/ desarmes.
FIXTURE_PLAYER_STATS = {
    "count": 10,
    "next": None,
    "previous": None,
    "results": [
        {"player_id": 1867, "event_id": 7000 + i, "team_id": 150,
         "minutes_played": 90, "total_tackle": 2 + (i % 3),
         "shots_on_target": 1, "total_shots": 2}
        for i in range(10)
    ],
}

# /events/{id}/stats/ real: stats.home/away com nomes de campo de TIME (corner_kicks, total_tackles).
FIXTURE_EVENT_STATS = {
    "event_id": 7166,
    "stats": {
        "home": {"corner_kicks": 7, "total_tackles": 12, "shots_on_target": 3},
        "away": {"corner_kicks": 3, "total_tackles": 18, "shots_on_target": 5},
    },
}

EVENT = {
    "id": "7166",
    "home_team": {"id": "150", "name": "Cruzeiro"},
    "away_team": {"id": "153", "name": "Fluminense"},
}

DESARMES = MARKETS["desarmes"]


class FakeBSDClient:
    """Forma REAL. team_stats levanta (espelha o 404 de /team-stats/)."""
    def lineups(self, event_id):
        return FIXTURE_LINEUPS
    def player_stats(self, player_id, **filtros):
        return FIXTURE_PLAYER_STATS
    def team_stats(self, event_id):
        raise RuntimeError("404 Not Found: /team-stats/ não existe")
    def event_stats(self, event_id):
        return FIXTURE_EVENT_STATS


def make_provider():
    return BSDStatsProvider(client=FakeBSDClient())


# ---- elenco (forma real de lineups) ----

def test_elenco_returns_only_starters_with_required_fields():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    # titulares: 2 (home) + 1 (away) = 3; substitutos NÃO entram
    assert len(elenco) == 3
    ids = {p["id"] for p in elenco}
    assert ids == {"3946", "1867", "2001"}
    for p in elenco:
        assert "id" in p and "name" in p and "team_id" in p and "posicao" in p


def test_elenco_excludes_substitutes():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    assert "1874" not in {p["id"] for p in elenco}  # M. Henrique é suplente


def test_elenco_home_players_get_correct_team_id():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    for p in [p for p in elenco if p["id"] in ("3946", "1867")]:
        assert p["team_id"] == "150"


def test_elenco_away_players_get_correct_team_id():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    away = next(p for p in elenco if p["id"] == "2001")
    assert away["team_id"] == "153"


# ---- entity_taxa (forma real de player_stats; mercado de jogador = desarmes) ----

def _contexto():
    return {"event": EVENT, "entity_team_id": "150", "is_home": True, "league_avg_conceded": 2.0}


def test_entity_taxa_returns_required_keys():
    provider = make_provider()
    result = provider.entity_taxa("1867", DESARMES, _contexto())
    assert result is not None
    for key in ("mu", "minutos_esperados", "xi_confirmado", "amostra_jogos", "concedido_adversario", "incerteza"):
        assert key in result, f"chave ausente: {key}"


def test_entity_taxa_mu_is_positive():
    provider = make_provider()
    result = provider.entity_taxa("1867", DESARMES, _contexto())
    assert result["mu"] > 0


def test_entity_taxa_amostra_jogos_reflects_results_count():
    provider = make_provider()
    result = provider.entity_taxa("1867", DESARMES, _contexto())
    assert result["amostra_jogos"] == 10


def test_entity_taxa_degrada_para_neutro_quando_team_stats_404():
    """Slice 1: /team-stats/ 404 não pode derrubar a análise — degrada p/ league_avg."""
    provider = make_provider()
    result = provider.entity_taxa("1867", DESARMES, _contexto())
    assert result is not None
    assert result["mu"] > 0


def test_entity_taxa_returns_none_when_no_results():
    class EmptyClient(FakeBSDClient):
        def player_stats(self, player_id, **filtros):
            return {"count": 0, "next": None, "previous": None, "results": []}
    provider = BSDStatsProvider(client=EmptyClient())
    result = provider.entity_taxa("1867", DESARMES, _contexto())
    assert result is None


# ---- team_taxa (#25): histórico de escanteios do TIME via events(team)+event_stats ----

ESCANTEIOS = MARKETS["escanteios"]


class FakeTeamClient:
    """events(team) devolve 10 jogos finalizados; o time 150 alterna casa/fora.
    event_stats real: stats.{home,away}.corner_kicks (nome de campo de TIME)."""
    def events(self, **filtros):
        res = []
        for i in range(10):
            if i % 2 == 0:
                res.append({"id": 1000 + i, "home_team_id": 150, "away_team_id": 999, "status": "finished"})
            else:
                res.append({"id": 1000 + i, "home_team_id": 999, "away_team_id": 150, "status": "finished"})
        return {"count": 10, "results": res}
    def event_stats(self, event_id):
        return {"event_id": event_id, "stats": {"home": {"corner_kicks": 6}, "away": {"corner_kicks": 4}}}


def _team_ctx():
    return {"event": EVENT, "is_home": True, "league_avg_conceded": ESCANTEIOS.prior_rate}


def test_team_taxa_agrega_corner_kicks_do_lado_certo():
    provider = BSDStatsProvider(client=FakeTeamClient())
    result = provider.team_taxa("150", ESCANTEIOS, _team_ctx())
    assert result is not None
    assert result["mu"] > 0
    assert result["amostra_jogos"] == 10


def test_team_taxa_usa_corner_kicks_nao_corners():
    # garante que mapeia market.stat_field("corners") -> campo real de time "corner_kicks"
    provider = BSDStatsProvider(client=FakeTeamClient())
    result = provider.team_taxa("150", ESCANTEIOS, _team_ctx())
    # casa=6, fora=4, alternado -> média 5; mu deve ficar na vizinhança (×ha, shrink p/ prior 5)
    assert 3.0 < result["mu"] < 8.0


def test_team_taxa_none_quando_sem_jogos_finalizados():
    class EmptyTeamClient(FakeTeamClient):
        def events(self, **filtros):
            return {"count": 0, "results": []}
    provider = BSDStatsProvider(client=EmptyTeamClient())
    assert provider.team_taxa("150", ESCANTEIOS, _team_ctx()) is None


# ---- #1 matchup REAL: concessão do adversário entra no mu (produção × concessão) ----

def test_markets_tem_concede_baseline_nivel_time():
    # baseline de concessão é nível-TIME (não o prior de jogador) — senão o
    # multiplicador divide concessão-de-time (~12 desarmes) pelo prior do jogador (~2) e explode.
    for k in ("sot", "finalizacoes", "desarmes", "escanteios"):
        assert MARKETS[k].concede_baseline > 0


class FakeMatchupClient(FakeBSDClient):
    """Rate de jogador fixo + histórico do ADVERSÁRIO (153). opp_concede = quantos
    total_tackles o adversário concede por jogo (lado oposto ao 153 nos jogos dele)."""
    def __init__(self, opp_concede):
        self._oc = opp_concede
    def player_stats(self, player_id, **filtros):
        return {"count": 10, "next": None, "previous": None,
                "results": [{"player_id": 1867, "event_id": 7000 + i, "team_id": 150,
                             "minutes_played": 90, "total_tackle": 2} for i in range(10)]}
    def events(self, **filtros):
        # adversário 153 sempre como mandante → concessão = lado away.
        return {"count": 10, "results": [
            {"id": 2000 + i, "home_team_id": 153, "away_team_id": 777, "status": "finished"}
            for i in range(10)]}
    def event_stats(self, event_id):
        return {"event_id": event_id,
                "stats": {"home": {"total_tackles": 1}, "away": {"total_tackles": self._oc}}}


def _matchup_ctx():
    return {"event": EVENT, "entity_team_id": "150", "is_home": True,
            "league_avg_conceded": 12.0, "opp_team_id": "153"}


def test_entity_taxa_matchup_adversario_vazado_aumenta_mu():
    leaky = BSDStatsProvider(client=FakeMatchupClient(opp_concede=24))  # 2x baseline
    solid = BSDStatsProvider(client=FakeMatchupClient(opp_concede=6))   # 0.5x baseline
    mu_leaky = leaky.entity_taxa("1867", DESARMES, _matchup_ctx())["mu"]
    mu_solid = solid.entity_taxa("1867", DESARMES, _matchup_ctx())["mu"]
    assert mu_leaky > mu_solid


def test_entity_taxa_matchup_clampado_nao_explode():
    extreme = BSDStatsProvider(client=FakeMatchupClient(opp_concede=240))  # 20x baseline
    neutral = BSDStatsProvider(client=FakeMatchupClient(opp_concede=12))   # 1x baseline
    mu_ext = extreme.entity_taxa("1867", DESARMES, _matchup_ctx())["mu"]
    mu_neu = neutral.entity_taxa("1867", DESARMES, _matchup_ctx())["mu"]
    assert mu_ext > mu_neu                      # matchup ligado (subiu)
    assert mu_ext <= mu_neu * 1.4 + 1e-9        # mas clampado em 1.4


class FakeTeamMatchupClient:
    """Time-alvo (mandante) produz 5 corners/jogo; adversário concede opp_concede."""
    def __init__(self, opp_concede):
        self._oc = opp_concede
    def events(self, team_id=None, **filtros):
        return {"count": 10, "results": [
            {"id": 3000 + i, "home_team_id": int(team_id), "away_team_id": 888, "status": "finished"}
            for i in range(10)]}
    def event_stats(self, event_id):
        return {"event_id": event_id,
                "stats": {"home": {"corner_kicks": 5}, "away": {"corner_kicks": self._oc}}}


def test_team_taxa_matchup_adversario_vazado_aumenta_mu():
    leaky = BSDStatsProvider(client=FakeTeamMatchupClient(opp_concede=10))  # 2x baseline 5
    solid = BSDStatsProvider(client=FakeTeamMatchupClient(opp_concede=2))   # 0.4x baseline 5
    ctx = {"event": EVENT, "is_home": True, "league_avg_conceded": 5.0, "opp_team_id": "153"}
    mu_leaky = leaky.team_taxa("150", ESCANTEIOS, ctx)["mu"]
    mu_solid = solid.team_taxa("150", ESCANTEIOS, ctx)["mu"]
    assert mu_leaky > mu_solid


# ---- entity_taxa defensivo: player_stats 404 (id que não resolve) não derruba ----

def test_entity_taxa_returns_none_quando_player_stats_levanta():
    class Boom(FakeBSDClient):
        def player_stats(self, player_id, **filtros):
            raise RuntimeError("404 Not Found")
    provider = BSDStatsProvider(client=Boom())
    assert provider.entity_taxa("974505", DESARMES, _contexto()) is None


# ---- CrosswalkStatsProvider: resolve ids do lineup → stats-ids (por nome) ----

from odd_analyzer.providers.stats import CrosswalkStatsProvider

CW_EVENT = {
    "id": "207441",
    "home_team": {"id": "489", "name": "Argentina"},
    "away_team": {"id": "665", "name": "Iceland"},
}


class FakeCrosswalkClient:
    """lineup traz ids do namespace-lineup (grandes) + nomes; o histórico/stats usa
    outro namespace (387/500). events+player-stats+player dão o tradutor."""
    def __init__(self, confirmed=False):
        self._status = "confirmed" if confirmed else "predicted"

    def lineups(self, event_id):
        return {"lineup_status": self._status, "lineups": {
            "home": {"team_id": 489, "players": [
                {"id": 974505, "name": "Enzo Fernández", "position": "M"}]},
            "away": {"team_id": 665, "players": [
                {"id": 888888, "name": "Gylfi Sigurdsson", "position": "M"}]},
        }}

    def events(self, team_id=None, **filtros):
        return {"results": [{"id": 9001 if str(team_id) == "489" else 9101}]}

    def event_player_stats(self, event_id):
        if event_id == 9001:
            return {"player_stats": [{"player_id": 387, "team_id": 489}]}
        return {"player_stats": [{"player_id": 500, "team_id": 665}]}

    def player(self, player_id):
        return {"id": player_id, "name": {387: "Enzo Fernández", 500: "Gylfi Sigurdsson"}[player_id]}


def _wrap():
    client = FakeCrosswalkClient()
    return CrosswalkStatsProvider(BSDStatsProvider(client), client)


def test_crosswalk_elenco_devolve_stats_ids():
    elenco = _wrap().elenco(CW_EVENT)
    by_name = {p["name"]: p for p in elenco}
    assert by_name["Enzo Fernández"]["id"] == "387"
    assert by_name["Gylfi Sigurdsson"]["id"] == "500"
    # team_id e posicao preservados
    assert by_name["Enzo Fernández"]["team_id"] == "489"
    assert by_name["Enzo Fernández"]["posicao"] == "M"


def test_crosswalk_xi_ids_vazio_quando_nao_confirmado():
    assert _wrap().xi_ids(CW_EVENT) == set()


def test_crosswalk_xi_ids_resolvido_quando_confirmado():
    client = FakeCrosswalkClient(confirmed=True)
    prov = CrosswalkStatsProvider(BSDStatsProvider(client), client)
    assert prov.xi_ids(CW_EVENT) == {"387", "500"}


def test_crosswalk_delega_entity_taxa_ao_inner():
    """entity_taxa não é tocado pelo wrapper — delega o stats-id ao provider real."""
    class CapturingInner:
        def entity_taxa(self, entity_id, market, contexto):
            return {"capturado": entity_id}
    prov = CrosswalkStatsProvider(CapturingInner(), FakeCrosswalkClient())
    assert prov.entity_taxa("387", DESARMES, {})["capturado"] == "387"
