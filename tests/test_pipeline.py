"""Tests for the new analisar_jogo signature (fase1: market-aware, provider-injected)."""
import pytest
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.store.repo import InMemoryRepo

MARKET_ESCANTEIOS = MARKETS["escanteios"]
EVENT = {"id": "evt-corners-1", "jogo": "BRA x CRO"}

class FakeStatsProvider:
    def elenco(self, event):
        return [{"id": "10", "name": "Brasil", "team_id": "10", "posicao": ""}]
    def entity_taxa(self, entity_id, market, contexto):
        return {"mu": 13.0, "minutos_esperados": 90.0, "xi_confirmado": True,
                "amostra_jogos": 12, "concedido_adversario": "alto", "incerteza": "baixa"}
    def team_rates(self, team_id, contexto):
        return None

class FakeOddsProviderWithOdds:
    def linhas(self, event, market):
        return [{"entidade": "partida", "linha": 9.5, "odd_over": 1.87, "odd_under": 1.93, "book": "Pinnacle"}]

class FakeOddsProviderEmpty:
    def linhas(self, event, market):
        return []

def fake_analista_apostar(candidatos, contexto):
    best = candidatos[0] if candidatos else None
    return {"melhor_aposta": ({"jogador": best["jogador"], "linha": best["linha"],
            "veredito": "APOSTAR", "confianca": "alta", "motivo": "ev positivo"} if best else None),
            "outras": [], "alertas": []}

def fake_analista_nao(candidatos, contexto):
    return {"melhor_aposta": None, "outras": [], "alertas": []}

def test_pipeline_nova_assinatura_aceita_market_e_providers():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET_ESCANTEIOS, stats_provider=FakeStatsProvider(),
                           odds_provider=FakeOddsProviderWithOdds(), repo=repo, analista_fn=fake_analista_nao)
    assert "candidatos" in result and "ia" in result

def test_pipeline_contagem_gera_candidato_com_odds():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET_ESCANTEIOS, stats_provider=FakeStatsProvider(),
                           odds_provider=FakeOddsProviderWithOdds(), repo=repo, analista_fn=fake_analista_nao)
    assert len(result["candidatos"]) >= 1
    c = result["candidatos"][0]
    assert c["market_type"] == "escanteios"
    assert c["linha"] == 9.5

def test_pipeline_contagem_null_odds_produz_lista_vazia_de_candidatos():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET_ESCANTEIOS, stats_provider=FakeStatsProvider(),
                           odds_provider=FakeOddsProviderEmpty(), repo=repo, analista_fn=fake_analista_nao)
    assert result["candidatos"] == []

def test_pipeline_grava_analise_no_repo():
    repo = InMemoryRepo()
    analisar_jogo(event=EVENT, market=MARKET_ESCANTEIOS, stats_provider=FakeStatsProvider(),
                  odds_provider=FakeOddsProviderWithOdds(), repo=repo, analista_fn=fake_analista_nao)
    assert repo.get_analise(EVENT["id"]) is not None

def test_pipeline_grava_ledger_quando_apostar():
    repo = InMemoryRepo()
    analisar_jogo(event=EVENT, market=MARKET_ESCANTEIOS, stats_provider=FakeStatsProvider(),
                  odds_provider=FakeOddsProviderWithOdds(), repo=repo, analista_fn=fake_analista_apostar)
    assert len(repo.ledger) >= 1
    assert repo.ledger[0]["market_type"] == "escanteios"

def test_pipeline_nao_grava_ledger_sem_apostar():
    repo = InMemoryRepo()
    analisar_jogo(event=EVENT, market=MARKET_ESCANTEIOS, stats_provider=FakeStatsProvider(),
                  odds_provider=FakeOddsProviderWithOdds(), repo=repo, analista_fn=fake_analista_nao)
    assert repo.ledger == []

def test_pipeline_market_type_propagado_para_candidato():
    repo = InMemoryRepo()
    result = analisar_jogo(event=EVENT, market=MARKET_ESCANTEIOS, stats_provider=FakeStatsProvider(),
                           odds_provider=FakeOddsProviderWithOdds(), repo=repo, analista_fn=fake_analista_nao)
    for c in result["candidatos"]:
        assert c["market_type"] == "escanteios"
