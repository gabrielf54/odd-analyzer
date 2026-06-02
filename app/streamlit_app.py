"""Front mínimo (página única): lista jogos da Copa, analisa um jogo, mostra
candidatos de valor e a recomendação da IA, e o resumo do paper_ledger.
A lógica toda vem do pipeline; este arquivo só renderiza. Sem capricho visual.
Rodar: streamlit run app/streamlit_app.py"""
import streamlit as st
from odd_analyzer.odds.the_odds_api import fetch_events, fetch_event_odds
from odd_analyzer.store.repo import SupabaseRepo
from odd_analyzer.pipeline import analisar_jogo

SPORT = "soccer_fifa_world_cup"


def _taxa_fn(player_id, linha):
    # PLACEHOLDER de wiring: substituir pela leitura real do modelo (Fase 1a)
    # quando houver stats da temporada (API-Football Pro). Por ora sinaliza
    # "sem projeção" devolvendo amostra 0 -> filtro descarta.
    return {"prob_modelo": 0.0, "mu": 0.0, "minutos_esperados": 0,
            "xi_confirmado": False, "amostra_jogos": 0,
            "sot_concedido_adversario": "n/d", "incerteza": "alta"}


def render():
    st.title("odd-analyzer — Copa 2026")
    repo = SupabaseRepo()
    if st.button("↻ atualizar jogos"):
        st.session_state["eventos"] = fetch_events(SPORT)
    eventos = st.session_state.get("eventos", [])
    if not eventos:
        st.info("Clique em '↻ atualizar jogos' para carregar a lista.")
        return
    rotulos = {f'{e.get("home_team")} x {e.get("away_team")}': e for e in eventos}
    escolha = st.selectbox("Jogo", list(rotulos))
    evt = rotulos[escolha]
    if st.button("Analisar jogo"):
        odds = fetch_event_odds(SPORT, evt["id"])
        props = odds.get("bookmakers", [])
        if not props:
            st.warning("Odds de SOT ainda não postadas para este jogo (casas postam perto do kickoff).")
            return
        evt_full = dict(evt, jogo=escolha, bookmakers=props)
        out = analisar_jogo(evt_full, elenco=[], taxa_fn=_taxa_fn, repo=repo)
        if not out["candidatos"]:
            st.warning("Nenhuma oportunidade clara (sem projeção do modelo ou abaixo dos cortes).")
        else:
            st.table(out["candidatos"])
            ap = out["ia"].get("melhor_aposta")
            if ap:
                st.success(f'MELHOR: {ap["jogador"]} {ap["linha"]} — {ap["veredito"]} '
                           f'({ap["confianca"]}) · {ap["motivo"]}')


if __name__ == "__main__" or st.runtime.exists():
    render()
