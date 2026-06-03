"""Registry de mercados do MVP. Cada MarketSpec carrega TODOS os seus parâmetros
de forma que o pipeline e o backtest não precisam de nenhum parâmetro hard-coded
além do que está aqui."""
from dataclasses import dataclass


@dataclass(frozen=True)
class MarketSpec:
    key: str
    nivel: str           # "jogador" | "partida"
    kind: str            # "contagem" | "partida_totais" | "partida_1x2"
    stat_field: str      # campo BSD: "corners" | "shots_on_target" | "total_shots" | "total_tackle" | "goals"
    prior_rate: float
    prior_strength: float
    nb_dispersion: float
    lines: list[float]
    eixo_concessao: str  # descrição do eixo de concessão do adversário (p/ matchup + prompt)
    label: str
    # Baseline nível-TIME de quanto um time concede deste stat por jogo (média da liga,
    # rough prior pendente de league-sweep na calibração/Fase 4). É o denominador do
    # opponent_multiplier — NÃO confundir com prior_rate (que é nível-jogador).
    concede_baseline: float = 0.0


MARKETS: dict[str, MarketSpec] = {
    "sot": MarketSpec(
        key="sot",
        nivel="jogador",
        kind="contagem",
        stat_field="shots_on_target",
        prior_rate=0.4,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="chutes_a_gol_concedidos_por_jogo",
        label="Chutes a Gol (SOT)",
        concede_baseline=4.55,  # league-sweep BSD liga 9, 80 jogos (2026-06-03)
    ),
    "finalizacoes": MarketSpec(
        key="finalizacoes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_shots",
        prior_rate=1.2,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="finalizacoes_concedidas_por_jogo",
        label="Finalizações Totais",
        concede_baseline=13.46,  # league-sweep BSD liga 9, 80 jogos (2026-06-03)
    ),
    "desarmes": MarketSpec(
        key="desarmes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_tackle",
        prior_rate=2.0,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="desarmes_concedidos_por_jogo",
        label="Desarmes",
        concede_baseline=14.64,  # league-sweep BSD liga 9, 80 jogos (2026-06-03)
    ),
    "escanteios": MarketSpec(
        key="escanteios",
        nivel="partida",
        kind="contagem",
        stat_field="corners",
        prior_rate=5.0,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[8.5, 9.5, 10.5],
        eixo_concessao="escanteios_concedidos_por_jogo",
        label="Escanteios (Total)",
        concede_baseline=4.79,  # league-sweep BSD liga 9, 80 jogos (2026-06-03)
    ),
    "gols": MarketSpec(
        key="gols",
        nivel="partida",
        kind="partida_totais",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[1.5, 2.5, 3.5],
        eixo_concessao="gols_concedidos_por_jogo",
        label="Gols (Total)",
        concede_baseline=1.3,
    ),
    "vitoria": MarketSpec(
        key="vitoria",
        nivel="partida",
        kind="partida_1x2",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[1.5, 2.5, 3.5],
        eixo_concessao="gols_concedidos_por_jogo",
        label="Resultado (1X2)",
        concede_baseline=1.3,
    ),
}
