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


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "probe-all":
        probe_all()
    else:
        print("uso: python -m odd_analyzer.cli probe-all")


if __name__ == "__main__":
    main()
