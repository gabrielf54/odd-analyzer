"""E2E do runner (T6): BSDClient FAKE em FORMA REAL → run_analise → candidato.

Prova a cadeia ponta-a-ponta de mercado de JOGADOR (desarmes) com odd manual,
contra as formas reais capturadas do BSD (lineups aninhado, player_stats results,
/team-stats/ 404). EV decide no código; IA desligada.
"""
from odd_analyzer.runner import run_analise, format_resultado
from odd_analyzer.store.repo import InMemoryRepo

RAW_EVENT = {
    "id": 7166, "home_team_id": 150, "home_team": "Cruzeiro",
    "away_team_id": 153, "away_team": "Fluminense", "status": "finished",
}
LINEUPS = {
    "event_id": 7166, "lineup_status": "confirmed",
    "lineups": {
        "home": {"team_id": 150, "team_name": "Cruzeiro", "players": [
            {"id": 1867, "name": "M. Pereira", "position": "M"},
            {"id": 3946, "name": "Otávio", "position": "G"},
        ], "substitutes": []},
        "away": {"team_id": 153, "team_name": "Fluminense", "players": [
            {"id": 2001, "name": "Fábio", "position": "G"},
        ], "substitutes": []},
    },
}
# 12 jogos com ~3-4 desarmes → mu alto → prob_over(1.5) >> 0.5 = odd justa → edge+.
PLAYER_STATS = {
    "count": 12, "next": None, "previous": None,
    "results": [
        {"player_id": 1867, "event_id": 7000 + i, "team_id": 150,
         "minutes_played": 90, "total_tackle": 3 + (i % 2)}
        for i in range(12)
    ],
}


class FakeRealClient:
    # Crosswalk: a escalação e o histórico compartilham o mesmo namespace de id NESTE
    # fake (lineup-id == stats-id), então resolver por nome devolve o mesmo id — a
    # cadeia ponta-a-ponta passa pelo crosswalk sem mudar as asserções.
    _ROSTERS = {"150": [1867, 3946], "153": [2001]}
    _NAMES = {1867: "M. Pereira", 3946: "Otávio", 2001: "Fábio"}

    def get_event(self, event_id):
        return RAW_EVENT
    def lineups(self, event_id):
        return LINEUPS
    def player_stats(self, player_id, **filtros):
        return PLAYER_STATS
    def team_stats(self, event_id):
        raise RuntimeError("404 /team-stats/")
    def events(self, team_id=None, **filtros):
        return {"results": [{"id": f"g{team_id}", "home_team_id": int(team_id)}]}
    def event_player_stats(self, event_id):
        tid = str(event_id)[1:]  # "g150" → "150"
        return {"player_stats": [
            {"player_id": pid, "team_id": int(tid)} for pid in self._ROSTERS[tid]]}
    def player(self, player_id):
        return {"id": player_id, "name": self._NAMES[player_id]}


def test_e2e_desarmes_gera_candidato_com_edge_ev_positivos():
    repo = InMemoryRepo()
    out = run_analise(FakeRealClient(), "7166", "desarmes", "1867",
                      linha=1.5, odd_over=1.90, odd_under=1.90, repo=repo)
    cands = out["candidatos"]
    assert len(cands) == 1
    c = cands[0]
    assert c["jogador"] == "M. Pereira"
    assert c["market_type"] == "desarmes"
    assert c["linha"] == 1.5
    assert c["edge"] > 0.04 and c["ev"] > 0.05
    assert c["amostra_jogos"] == 12


def test_e2e_so_o_jogador_alvo_vira_candidato_nao_o_elenco_todo():
    # OnlyPlayer evita aplicar a linha de desarmes ao goleiro etc.
    out = run_analise(FakeRealClient(), "7166", "desarmes", "1867",
                      linha=1.5, odd_over=1.90, odd_under=1.90)
    assert {c["jogador"] for c in out["candidatos"]} == {"M. Pereira"}


def test_e2e_persiste_analise_com_market_type():
    repo = InMemoryRepo()
    run_analise(FakeRealClient(), "7166", "desarmes", "1867",
                linha=1.5, odd_over=1.90, odd_under=1.90, repo=repo)
    analise = repo.get_analise("7166")
    assert analise is not None
    assert analise["market_type"] == "desarmes"


def test_format_resultado_mostra_jogador_e_alerta_ia_desligada():
    out = run_analise(FakeRealClient(), "7166", "desarmes", "1867",
                      linha=1.5, odd_over=1.90, odd_under=1.90)
    texto = format_resultado(out, "Desarmes")
    assert "M. Pereira" in texto
    assert "IA desligada" in texto


# ---- #2 varredura: sem --player, escaneia o elenco inteiro (acha valor sem adivinhar) ----

def test_e2e_sem_player_escaneia_elenco_inteiro():
    # FakeRealClient devolve o MESMO player_stats (12 jogos, ~3 desarmes) p/ qualquer id,
    # logo os 3 jogadores do lineup viram candidato com a linha 1.5.
    out = run_analise(FakeRealClient(), "7166", "desarmes", None,
                      linha=1.5, odd_over=1.90, odd_under=1.90)
    nomes = {c["jogador"] for c in out["candidatos"]}
    assert len(out["candidatos"]) >= 2
    assert "M. Pereira" in nomes  # não restringe a 1 jogador
