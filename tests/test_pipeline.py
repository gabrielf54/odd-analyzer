from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.store.repo import InMemoryRepo

EVENT = {
    "id": "evt1", "jogo": "BRA x CRO",
    "bookmakers": [{"key": "dk", "markets": [{"key": "player_shots_on_target", "outcomes": [
        {"description": "Vinicius Jr", "name": "Over", "point": 0.5, "price": 1.72},
        {"description": "Vinicius Jr", "name": "Under", "point": 0.5, "price": 2.10},
    ]}]}],
}
ELENCO = [{"id": 1, "name": "Vinicius Jr"}]

def taxa_fn(player_id, linha):
    # números do modelo já calculados em código (μ alto -> prob alta no over 0.5)
    return {"prob_modelo": 0.75, "mu": 1.9, "minutos_esperados": 88,
            "xi_confirmado": True, "amostra_jogos": 24,
            "sot_concedido_adversario": "alto", "incerteza": "media"}

def fake_analista(candidatos, contexto):
    melhor = candidatos[0] if candidatos else None
    return {"melhor_aposta": ({"jogador": melhor["jogador"], "linha": melhor["linha"],
            "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge alto"} if melhor else None),
            "outras": [], "alertas": []}

def test_pipeline_ponta_a_ponta_gera_candidato_e_grava_ledger():
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, ELENCO, taxa_fn, repo, analista_fn=fake_analista)
    assert len(out["candidatos"]) == 1
    assert out["candidatos"][0]["jogador"] == "Vinicius Jr"
    assert out["ia"]["melhor_aposta"]["jogador"] == "Vinicius Jr"
    assert repo.get_analise("evt1") is not None
    assert len(repo.ledger) == 1  # gravou a aposta sinalizada

def test_pipeline_descarta_jogador_sem_match():
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, [{"id": 9, "name": "Outro Nome Totalmente Diferente"}],
                        taxa_fn, repo, analista_fn=fake_analista)
    assert out["candidatos"] == []  # fail-closed do crosswalk
