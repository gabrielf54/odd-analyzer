import sys
from pathlib import Path


def probe_all() -> None:
    from odd_analyzer.probes.odds_probe import fetch_wc_events_with_sot, parse_sot_props
    from odd_analyzer.probes.lineups_probe import fetch_league, check_lineup_coverage
    from odd_analyzer.probes.stats_probe import fetch_fbref_shooting_sample, has_sot_column
    from odd_analyzer.probes.report import build_viability_report

    detalhes = {}

    # Odds
    try:
        data = fetch_wc_events_with_sot()
        total = sum(len(parse_sot_props(e)) for e in data.get("data", []))
        odds_ok = total > 0
        detalhes["odds"] = f"{total} props SOT em {len(data.get('data', []))} eventos"
    except Exception as e:
        odds_ok = False
        detalhes["odds"] = f"erro: {e}"

    # Lineups
    try:
        lineups_ok = check_lineup_coverage(fetch_league(1), 1, 2026)
        detalhes["lineups"] = "coverage.fixtures.lineups confirmado" if lineups_ok else "sem cobertura pré-jogo"
    except Exception as e:
        lineups_ok = False
        detalhes["lineups"] = f"erro: {e}"

    # Stats
    try:
        df = fetch_fbref_shooting_sample()
        stats_ok = has_sot_column(df)
        detalhes["stats"] = "FBref ainda tem SoT" if stats_ok else "FBref SEM SoT — testar Sofascore/Understat"
    except Exception as e:
        stats_ok = False
        detalhes["stats"] = f"erro (provável 403/Cloudflare): {e} — testar Sofascore/Understat"

    report = build_viability_report(odds_ok, stats_ok, lineups_ok, detalhes)
    # Ancorado no root do projeto (cli.py vive em src/odd_analyzer/), nao no CWD.
    project_root = Path(__file__).resolve().parents[2]
    out = project_root / "docs" / "superpowers" / "reports" / "fase0-viabilidade.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nSalvo em {out}")


def bsd_probe(event_id: str) -> None:
    from odd_analyzer.probes.bsd_probe import probe_event
    probe_event(event_id)


def analisar(argv: list[str]) -> None:
    import argparse
    from odd_analyzer.config import get_required
    from odd_analyzer.bsd.client import BSDClient
    from odd_analyzer.model.markets import MARKETS
    from odd_analyzer.runner import run_analise, format_resultado

    ap = argparse.ArgumentParser(prog="odd_analyzer.cli analisar",
                                 description="Analisa 1 mercado de jogador num jogo real do BSD (odd manual).")
    ap.add_argument("--event", required=True, help="event_id do BSD (ex.: 7166)")
    ap.add_argument("--market", required=True, help="mercado: desarmes/sot/finalizacoes (jogador) ou escanteios (partida)")
    ap.add_argument("--player", default=None, help="id ou parte do nome do jogador; OMITIR escaneia o elenco inteiro (só mercado de jogador)")
    ap.add_argument("--linha", type=float, default=0.0, help="linha da casa (odd manual; ex.: 1.5)")
    ap.add_argument("--over", type=float, default=0.0, help="odd do over (odd manual)")
    ap.add_argument("--under", type=float, default=0.0, help="odd do under (odd manual)")
    ap.add_argument("--odds-fonte", default="manual", choices=["manual", "the_odds_api"],
                    help="manual (cola --linha/--over/--under) ou the_odds_api "
                         "(busca automática gols/1X2 da Copa via THE_ODDS_API_KEY)")
    ap.add_argument("--ia", action="store_true", help="liga a explicação da IA (usa OPENROUTER_API_KEY)")
    args = ap.parse_args(argv)

    odds_provider = None
    if args.odds_fonte == "the_odds_api":
        from odd_analyzer.providers.odds import TheOddsApiMatchOdds
        odds_provider = TheOddsApiMatchOdds()

    client = BSDClient(get_required("BZZOIRO_API_KEY"))
    out = run_analise(client, args.event, args.market, args.player,
                      linha=args.linha, odd_over=args.over, odd_under=args.under,
                      usar_ia=args.ia, odds_provider=odds_provider)
    label = MARKETS[args.market].label if args.market in MARKETS else args.market
    print(format_resultado(out, label))


def main() -> None:
    try:  # Windows: console cp1252 quebra em acento/símbolo; força utf-8 se possível.
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) >= 2 and sys.argv[1] == "probe-all":
        probe_all()
    elif len(sys.argv) >= 3 and sys.argv[1] == "bsd-probe":
        bsd_probe(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == "analisar":
        analisar(sys.argv[2:])
    else:
        print("uso: python -m odd_analyzer.cli probe-all")
        print("     python -m odd_analyzer.cli bsd-probe <event_id>   (ex.: 7166)")
        print("     python -m odd_analyzer.cli analisar --event 7166 --market desarmes \\")
        print("            --player Pereira --linha 1.5 --over 1.90 --under 1.90 [--ia]")


if __name__ == "__main__":
    main()
