"""Orquestra a análise de UM jogo: provider → mu → candidatos → filtro → IA → repo.
A matemática (builder) é código; a IA só lê e explica.
stats_provider e odds_provider são injetados — sem import direto de fonte."""
from odd_analyzer.candidates.builder import build_candidate
from odd_analyzer.candidates.filtro import filter_candidates
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.match_model import score_matrix, probs_1x2, prob_total_over
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
    elif market.kind in ("partida_totais", "partida_1x2"):
        candidatos = _run_partida(event, market, stats_provider, odds_provider)
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


_INCERTEZA_ORDEM = {"baixa": 0, "media": 1, "alta": 2}


def _run_contagem(event, market: MarketSpec, stats_provider, odds_provider) -> list[dict]:
    """Constrói candidatos para mercados de contagem. Dispatch por market.nivel:
    'partida' → total da partida (soma dos dois times via team_taxa);
    'jogador' → um candidato por jogador do elenco (entity_taxa)."""
    linhas = odds_provider.linhas(event, market)
    if not linhas:
        return []
    if market.nivel == "partida":
        return _contagem_partida(event, market, stats_provider, linhas)
    return _contagem_jogador(event, market, stats_provider, linhas)


def _contagem_partida(event, market: MarketSpec, stats_provider, linhas) -> list[dict]:
    """Escanteios & cia: a linha é o TOTAL da partida → mu = corners-for(home) +
    corners-for(away), cada um do histórico do próprio time (team_taxa, #25)."""
    home = event.get("home_team", {})
    away = event.get("away_team", {})
    th = stats_provider.team_taxa(home.get("id"), market,
                                  {"event": event, "is_home": True, "opp_team_id": away.get("id"),
                                   "league_avg_conceded": market.concede_baseline})
    ta = stats_provider.team_taxa(away.get("id"), market,
                                  {"event": event, "is_home": False, "opp_team_id": home.get("id"),
                                   "league_avg_conceded": market.concede_baseline})
    if th is None or ta is None:
        return []
    mu_total = th["mu"] + ta["mu"]
    amostra = min(th["amostra_jogos"], ta["amostra_jogos"])
    incerteza = max((th["incerteza"], ta["incerteza"]), key=lambda x: _INCERTEZA_ORDEM.get(x, 2))
    label = event.get("jogo") or f'{home.get("name", "")} x {away.get("name", "")}'.strip() or "partida"

    candidatos = []
    for linha_info in linhas:
        prob_modelo = prob_over_line(mu_total, linha_info["linha"], r=market.nb_dispersion)
        candidatos.append(build_candidate(
            jogador=label, linha=linha_info["linha"],
            odd_over=linha_info["odd_over"], odd_under=linha_info["odd_under"],
            prob_modelo=prob_modelo, mu=mu_total, minutos_esperados=90.0,
            xi_confirmado=True, amostra_jogos=amostra,
            concedido_adversario="n/d", incerteza=incerteza, market_type=market.key,
        ))
    return candidatos


def _run_partida(event, market: MarketSpec, stats_provider, odds_provider) -> list[dict]:
    linhas = odds_provider.linhas(event, market)
    if not linhas:
        return []
    home = event.get("home_team", {})
    away = event.get("away_team", {})
    rh = stats_provider.team_rates(home.get("id"), {"event": event, "is_home": True})
    ra = stats_provider.team_rates(away.get("id"), {"event": event, "is_home": False})
    if rh is None or ra is None:
        return []
    matrix = score_matrix(rh["lambda_for"], ra["lambda_for"])
    label = event.get("jogo") or f'{home.get("name","")} x {away.get("name","")}'.strip()
    candidatos = []
    for linha_info in linhas:
        if market.kind == "partida_totais":
            prob = prob_total_over(matrix, linha_info["linha"])
            jogador = label
        else:  # partida_1x2: linha codifica o lado em odd_over (home) — convenção do MVP
            prob = probs_1x2(matrix)["home"]
            jogador = f"{label} (1)"
        candidatos.append(build_candidate(
            jogador=jogador, linha=linha_info["linha"],
            odd_over=linha_info["odd_over"], odd_under=linha_info["odd_under"],
            prob_modelo=prob, mu=rh["lambda_for"] + ra["lambda_for"],
            minutos_esperados=90.0, xi_confirmado=True, amostra_jogos=10,
            concedido_adversario="n/d", incerteza="media", market_type=market.key,
        ))
    return candidatos


def _contagem_jogador(event, market: MarketSpec, stats_provider, linhas) -> list[dict]:
    elenco = stats_provider.elenco(event)
    home_id = str(event.get("home_team", {}).get("id", ""))
    away_id = str(event.get("away_team", {}).get("id", ""))
    candidatos = []
    for entidade in elenco:
        is_home = entidade.get("team_id") == home_id
        contexto = {
            "event": event,
            "entity_team_id": entidade.get("team_id", entidade["id"]),
            "is_home": is_home,
            "opp_team_id": away_id if is_home else home_id,
            "league_avg_conceded": market.concede_baseline,
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
