"""Orquestra a análise de UM jogo: provider → mu → candidatos → filtro → IA → repo.
A matemática (builder) é código; a IA só lê e explica.
stats_provider e odds_provider são injetados — sem import direto de fonte."""
from odd_analyzer.candidates.builder import build_candidate
from odd_analyzer.candidates.filtro import filter_candidates
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.ai.analista import analisar as _default_analista
from odd_analyzer.model.markets import MarketSpec


def analisar_jogo(
    event: dict,
    market: MarketSpec,
    stats_provider,
    odds_provider,
    repo,
    overrides: dict | None = None,
    analista_fn=_default_analista,
) -> dict:
    """Analisa 1 jogo para 1 mercado. Retorna {"candidatos": [...], "ia": {...}}.

    dispatch por market.kind:
      "contagem"      → prob_over_line (NB) por linha × entidade
      "partida_totais"/ "partida_1x2" → match_model (Fase 3, ainda não implementado)
    """
    if market.kind == "contagem":
        candidatos = _run_contagem(event, market, stats_provider, odds_provider)
    else:
        candidatos = []

    selecionados = filter_candidates(candidatos)
    ia = analista_fn(selecionados, {"jogo": event.get("jogo", event["id"])})

    repo.save_analise(event["id"], {
        "jogo": event.get("jogo"),
        "market_type": market.key,
        "candidatos": selecionados,
        "llm_resultado": ia,
    })

    aposta = ia.get("melhor_aposta")
    if aposta and aposta.get("veredito") == "APOSTAR":
        c = next(
            (c for c in selecionados
             if c["jogador"] == aposta["jogador"] and c["linha"] == aposta["linha"]),
            None,
        )
        if c:
            repo.save_ledger([{
                "event_id": event["id"],
                "jogador": c["jogador"],
                "linha": c["linha"],
                "market_type": c["market_type"],
                "odd_flag": c["odd"],
                "prob_modelo": c["prob_modelo"],
                "prob_devig": c["prob_devig"],
                "edge": c["edge"],
                "ev": c["ev"],
            }])

    return {"candidatos": selecionados, "ia": ia}


def _run_contagem(event, market: MarketSpec, stats_provider, odds_provider) -> list[dict]:
    """Constrói candidatos para mercados de contagem (time ou jogador)."""
    elenco = stats_provider.elenco(event)
    linhas = odds_provider.linhas(event, market)
    if not linhas:
        return []
    candidatos = []
    for entidade in elenco:
        contexto = {
            "event": event,
            "entity_team_id": entidade.get("team_id", entidade["id"]),
            "is_home": entidade.get("team_id") == str(event.get("home_team", {}).get("id", "")),
            "league_avg_conceded": market.prior_rate,
        }
        taxa = stats_provider.entity_taxa(entidade["id"], market, contexto)
        if taxa is None:
            continue
        for linha_info in linhas:
            prob_modelo = prob_over_line(taxa["mu"], linha_info["linha"], r=market.nb_dispersion)
            candidatos.append(build_candidate(
                jogador=entidade["name"],
                linha=linha_info["linha"],
                odd_over=linha_info["odd_over"],
                odd_under=linha_info["odd_under"],
                prob_modelo=prob_modelo,
                mu=taxa["mu"],
                minutos_esperados=taxa["minutos_esperados"],
                xi_confirmado=taxa["xi_confirmado"],
                amostra_jogos=taxa["amostra_jogos"],
                concedido_adversario=taxa["concedido_adversario"],
                incerteza=taxa["incerteza"],
                market_type=market.key,
            ))
    return candidatos
