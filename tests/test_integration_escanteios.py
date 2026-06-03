"""Integração ponta-a-ponta: escanteios com providers FAKE (sem rede).

Doutrina validada:
  - EV calculado em código (filtro decide), IA só explica.
  - mu computado em código (assemble_mu via entity_taxa).
  - matchup = multiplicador de concessão no mesmo eixo (concedido_adversario).
  - Candidato com edge/EV positivo → filtro mantém → IA recebe → repo grava.
"""
import pytest
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev
from odd_analyzer.store.repo import InMemoryRepo

MARKET = MARKETS["escanteios"]

EVENT = {
    "id": "wc2026-bra-cro",
    "jogo": "Brasil x Croácia — WC2026",
    "home_team": {"id": "bra", "name": "Brasil"},
    "away_team": {"id": "cro", "name": "Croácia"},
}

# Escanteios = TOTAL da partida: mu_total = corners-for(home) + corners-for(away).
# Cada time contribui 6.5 → mu_total=13.0. edge positivo vs odd_over=1.87/odd_under=1.93 (r=3.0):
# fair_prob_over(1.87, 1.93) ≈ 0.509; prob_over_line(13.0, 9.5, r=3.0) ≈ 0.603 → edge ≈ 0.094 ✓
TEAM_MU = 13.0
TEAM_MU_LADO = 6.5  # por time (home/away), somam o total


class FakeStatsE2E:
    def team_taxa(self, team_id, market, contexto):
        return {"mu": TEAM_MU_LADO, "minutos_esperados": 90.0, "xi_confirmado": True,
                "amostra_jogos": 15, "concedido_adversario": "n/d", "incerteza": "baixa"}
    def team_rates(self, team_id, contexto):
        return None


class FakeOddsE2E:
    def linhas(self, event, market):
        return [{"entidade": "partida", "linha": 9.5, "odd_over": 1.87, "odd_under": 1.93, "book": "Pinnacle"}]


def _fake_analista_apostar(candidatos, contexto):
    best = candidatos[0] if candidatos else None
    return {"melhor_aposta": ({"jogador": best["jogador"], "linha": best["linha"],
            "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge positivo"} if best else None),
            "outras": [], "alertas": []}


def test_precondition_prob_modelo_acima_de_devig():
    prob_modelo = prob_over_line(TEAM_MU, 9.5, r=MARKET.nb_dispersion)
    prob_justa = fair_prob_over(1.87, 1.93)
    assert prob_modelo > prob_justa, f"fixture inválido: prob_modelo={prob_modelo:.3f} <= prob_justa={prob_justa:.3f}"


def test_precondition_ev_positivo():
    prob_modelo = prob_over_line(TEAM_MU, 9.5, r=MARKET.nb_dispersion)
    m = edge_ev(prob_modelo, fair_prob_over(1.87, 1.93), 1.87)
    assert m["ev"] > 0.05, f"EV={m['ev']:.3f} deve ser > 0.05"
    assert m["edge"] > 0.04, f"edge={m['edge']:.3f} deve ser > 0.04"


def test_pipeline_produz_candidato_com_edge_ev_positivos():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                           odds_provider=FakeOddsE2E(), repo=repo, analista_fn=_fake_analista_apostar)
    assert len(result["candidatos"]) >= 1
    c = result["candidatos"][0]
    assert c["edge"] > 0
    assert c["ev"] > 0


def test_pipeline_candidato_tem_market_type_escanteios():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                           odds_provider=FakeOddsE2E(), repo=repo, analista_fn=_fake_analista_apostar)
    for c in result["candidatos"]:
        assert c["market_type"] == "escanteios"


def test_pipeline_filtro_mantem_candidato_acima_dos_cortes():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                           odds_provider=FakeOddsE2E(), repo=repo, analista_fn=_fake_analista_apostar)
    from odd_analyzer.candidates.filtro import Cortes
    cuts = Cortes()
    for c in result["candidatos"]:
        assert c["edge"] >= cuts.edge_min
        assert c["ev"] >= cuts.ev_min
        assert c["xi_confirmado"] is True
        assert c["amostra_jogos"] >= cuts.amostra_min


def test_pipeline_ia_recebe_candidatos_e_recomenda():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                           odds_provider=FakeOddsE2E(), repo=repo, analista_fn=_fake_analista_apostar)
    aposta = result["ia"]["melhor_aposta"]
    assert aposta is not None
    assert aposta["veredito"] == "APOSTAR"
    assert aposta["jogador"] == EVENT["jogo"]  # entidade = a PARTIDA (total), não um time
    assert aposta["linha"] == 9.5


def test_pipeline_analise_persistida_no_repo():
    repo = InMemoryRepo()
    analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                  odds_provider=FakeOddsE2E(), repo=repo, analista_fn=_fake_analista_apostar)
    analise = repo.get_analise(EVENT["id"])
    assert analise is not None
    assert analise["market_type"] == "escanteios"


def test_pipeline_ledger_gravado_com_market_type():
    repo = InMemoryRepo()
    analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                  odds_provider=FakeOddsE2E(), repo=repo, analista_fn=_fake_analista_apostar)
    assert len(repo.ledger) == 1
    row = repo.ledger[0]
    assert row["market_type"] == "escanteios"
    assert row["event_id"] == EVENT["id"]
    assert row["jogador"] == EVENT["jogo"]
    assert row["linha"] == 9.5


def test_pipeline_ia_nao_inventa_candidato_fora_do_conjunto():
    repo = InMemoryRepo()
    def ia_inventora(candidatos, contexto):
        return {"melhor_aposta": {"jogador": "Jogador Inventado", "linha": 99.5,
                "veredito": "APOSTAR", "confianca": "alta", "motivo": "inventei"}, "outras": [], "alertas": []}
    analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                  odds_provider=FakeOddsE2E(), repo=repo, analista_fn=ia_inventora)
    assert len(repo.ledger) == 0


def test_pipeline_sem_odds_nao_produz_candidatos():
    from odd_analyzer.providers.odds import NullOdds
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET, stats_provider=FakeStatsE2E(),
                           odds_provider=NullOdds(), repo=repo, analista_fn=_fake_analista_apostar)
    assert result["candidatos"] == []
    assert result["ia"]["melhor_aposta"] is None
    assert repo.ledger == []
