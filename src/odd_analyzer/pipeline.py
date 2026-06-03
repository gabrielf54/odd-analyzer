"""Orquestra a análise de UM jogo: props -> crosswalk -> modelo -> candidatos
-> filtro -> IA -> grava paper_ledger e cache. A matemática vem do código
(builder); a IA só lê. taxa_fn e analista_fn são injetados p/ testar offline."""
from odd_analyzer.odds.the_odds_api import parse_sot_props
from odd_analyzer.crosswalk.match import match_player
from odd_analyzer.candidates.builder import build_candidate
from odd_analyzer.candidates.filtro import filter_candidates
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.ai.analista import analisar as _default_analista

from odd_analyzer.model.params import NB_DISPERSION  # fonte única (mesmo r do backtest)

def analisar_jogo(event: dict, elenco: list[dict], taxa_fn, repo,
                  overrides: dict | None = None, analista_fn=_default_analista) -> dict:
    """Analisa 1 jogo e devolve {"candidatos": [...], "ia": {...}}.

    taxa_fn(player_id, linha) -> dict com as chaves:
        mu, minutos_esperados, xi_confirmado, amostra_jogos,
        sot_concedido_adversario, incerteza.
    `prob_modelo` NÃO vem do taxa_fn: é sempre recomputado aqui de `mu` via
    prob_over_line (NB_DISPERSION) — a matemática mora no código.
    analista_fn(candidatos, contexto) -> dict no formato de ai.analista.analisar.
    """
    candidatos = []
    for prop in parse_sot_props(event):
        m = match_player(prop["player_name"], elenco, overrides=overrides)
        if m is None:
            continue  # fail-closed: sem jogador confiável, descarta
        t = taxa_fn(m["id"], prop["line"])
        prob_modelo = prob_over_line(t["mu"], prop["line"], r=NB_DISPERSION)
        candidatos.append(build_candidate(
            jogador=m["name"], linha=prop["line"],
            odd_over=prop["odd_over"], odd_under=prop["odd_under"],
            prob_modelo=prob_modelo, mu=t["mu"],
            minutos_esperados=t["minutos_esperados"], xi_confirmado=t["xi_confirmado"],
            amostra_jogos=t["amostra_jogos"],
            concedido_adversario=t["sot_concedido_adversario"], incerteza=t["incerteza"],
            market_type="sot",
        ))
    selecionados = filter_candidates(candidatos)
    ia = analista_fn(selecionados, {"jogo": event.get("jogo", event["id"])})
    repo.save_analise(event["id"], {"jogo": event.get("jogo"), "candidatos": selecionados,
                                    "llm_resultado": ia})
    aposta = ia.get("melhor_aposta")
    if aposta and aposta.get("veredito") == "APOSTAR":
        c = next((c for c in selecionados
                  if c["jogador"] == aposta["jogador"] and c["linha"] == aposta["linha"]), None)
        if c:
            repo.save_ledger([{"event_id": event["id"], "jogador": c["jogador"], "linha": c["linha"],
                               "odd_flag": c["odd"], "prob_modelo": c["prob_modelo"],
                               "prob_devig": c["prob_devig"], "edge": c["edge"], "ev": c["ev"]}])
    return {"candidatos": selecionados, "ia": ia}
