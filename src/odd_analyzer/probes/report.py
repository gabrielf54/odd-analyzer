def build_viability_report(odds_ok: bool, stats_ok: bool, lineups_ok: bool, detalhes: dict) -> str:
    def m(ok): return "GO" if ok else "NO-GO"
    veredito = "GO" if (odds_ok and stats_ok and lineups_ok) else "NO-GO"
    linhas = [
        "# Relatório de Viabilidade — Fase 0",
        "",
        f"VEREDITO: {veredito}",
        "",
        f"- Odds (SGO): {m(odds_ok)} — {detalhes.get('odds', '')}",
        f"- Stats: {m(stats_ok)} — {detalhes.get('stats', '')}",
        f"- Escalação (API-Football): {m(lineups_ok)} — {detalhes.get('lineups', '')}",
        "",
    ]
    if veredito == "NO-GO":
        linhas.append("> Pelo menos um portão falhou. Resolver antes de seguir pra Fase 1.")
    else:
        linhas.append("> Todos os portões passaram. Liberado para escrever o plano da Fase 1.")
    return "\n".join(linhas)
