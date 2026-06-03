from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.store.repo import InMemoryRepo

class _Stats:
    def elenco(self, e): return []
    def entity_taxa(self, *a): return None
    def team_taxa(self, *a, **k): return None
    def team_rates(self, team_id, ctx, **k):
        # lh=2.5, la=1.8 → P(total>2.5)≈0.80 >> fair_prob(1.90/2.10)≈0.53 → edge>0.04 ✓
        return {"lambda_for": 2.5 if str(team_id) == "10" else 1.8}

class _Odds:
    def linhas(self, event, market):
        return [{"linha": 2.5, "odd_over": 1.90, "odd_under": 2.10}]

def _fake_ia(c, ctx): return {"melhor_aposta": None, "outras": [], "alertas": []}

def test_pipeline_partida_totais_gera_candidato():
    event = {"id": "1", "jogo": "A x B",
             "home_team": {"id": "10", "name": "A"}, "away_team": {"id": "20", "name": "B"}}
    out = analisar_jogo(event, MARKETS["gols"], _Stats(), _Odds(), InMemoryRepo(),
                        analista_fn=_fake_ia)
    assert out["candidatos"]  # pelo menos 1 candidato com prob_modelo de total>2.5
    assert 0.0 <= out["candidatos"][0]["prob_modelo"] <= 1.0
