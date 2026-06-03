"""Runner de análise REAL (Slice 1): liga BSDClient → BSDStatsProvider → ManualOdds
→ pipeline e imprime os candidatos com edge/EV (+ veredito da IA se ligada).

Mercado de jogador (desarmes/SOT/finalizações): odd colada à mão (ManualOdds) p/
UM jogador. `OnlyPlayer` restringe o elenco ao jogador-alvo — senão o pipeline
aplicaria a mesma linha a todos os 22 jogadores.
"""
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.providers.odds import ManualOdds
from odd_analyzer.store.repo import InMemoryRepo


def normalize_event(raw: dict) -> dict:
    """Forma real flat de /events/{id}/ → forma aninhada que o pipeline espera."""
    home = str(raw.get("home_team", ""))
    away = str(raw.get("away_team", ""))
    return {
        "id": str(raw["id"]),
        "jogo": f"{home} x {away}",
        "home_team": {"id": str(raw.get("home_team_id", "")), "name": home},
        "away_team": {"id": str(raw.get("away_team_id", "")), "name": away},
    }


class OnlyPlayer:
    """Wrapper de StatsProvider que restringe elenco() a UM jogador (id exato ou
    substring de nome, case-insensitive). Delega o resto ao provider real."""

    def __init__(self, provider, player_ref: str):
        self._p = provider
        self._ref = str(player_ref)

    def elenco(self, event: dict) -> list[dict]:
        todos = self._p.elenco(event)
        ref = self._ref.lower()
        filtrados = [
            p for p in todos
            if str(p["id"]) == self._ref or ref in p["name"].lower()
        ]
        if not filtrados:
            disponiveis = ", ".join(f'{p["name"]} (id={p["id"]})' for p in todos)
            raise ValueError(f"jogador '{self._ref}' não encontrado no elenco. Disponíveis: {disponiveis}")
        return filtrados

    def entity_taxa(self, entity_id, market, contexto):
        return self._p.entity_taxa(entity_id, market, contexto)

    def team_rates(self, team_id, contexto):
        return self._p.team_rates(team_id, contexto)


def fake_analista(candidatos: list[dict], contexto: dict) -> dict:
    """IA desligada (offline/sem custo): não opina, só deixa os candidatos passarem."""
    return {
        "melhor_aposta": None,
        "outras": [],
        "alertas": ["IA desligada — exibindo apenas candidatos do modelo (edge/EV em código)."],
    }


def format_resultado(out: dict, market_label: str) -> str:
    """Renderiza candidatos + veredito da IA em texto pro terminal."""
    linhas = [f"\n=== Análise: {market_label} ==="]
    cands = out.get("candidatos", [])
    if not cands:
        linhas.append("Nenhum candidato passou nos cortes (edge>=0.04, ev>=0.05, xi_confirmado, amostra>=10).")
    else:
        linhas.append(f"{'jogador':<22}{'linha':>6}{'p_mod':>8}{'p_devig':>9}"
                      f"{'edge':>8}{'EV':>8}{'n':>4}  {'adv_concede':<14}")
        for c in cands:
            linhas.append(
                f"{str(c['jogador']):<22}{c['linha']:>6}"
                f"{c['prob_modelo']:>8.3f}{c['prob_devig']:>9.3f}"
                f"{c['edge']:>+8.3f}{c['ev']:>+8.3f}{c['amostra_jogos']:>4}  "
                f"{str(c.get('concedido_adversario', 'n/d')):<14}"
            )
    ap = (out.get("ia") or {}).get("melhor_aposta")
    if ap:
        linhas.append(f"\nIA: {ap['jogador']} {ap['linha']} — {ap['veredito']} "
                      f"({ap['confianca']}) · {ap['motivo']}")
    for alerta in (out.get("ia") or {}).get("alertas", []):
        linhas.append(f"[alerta] {alerta}")
    return "\n".join(linhas)


def run_analise(client, event_id: str, market_key: str, player_ref: str | None,
                linha: float, odd_over: float, odd_under: float,
                usar_ia: bool = False, repo=None) -> dict:
    """Orquestra um run real com odd manual. nivel=jogador exige `player_ref`
    (restringe o elenco); nivel=partida usa as duas equipes via team_taxa."""
    from odd_analyzer.providers.stats import BSDStatsProvider

    if market_key not in MARKETS:
        raise ValueError(f"mercado desconhecido: {market_key}. Opções: {list(MARKETS)}")
    market = MARKETS[market_key]

    raw_event = client.get_event(event_id)
    event = normalize_event(raw_event)

    if market.nivel == "partida":
        stats = BSDStatsProvider(client)
        entidade = "partida"
    elif player_ref:
        # Jogador específico: restringe o elenco (mesma linha não vaza p/ os 22).
        stats = OnlyPlayer(BSDStatsProvider(client), player_ref)
        entidade = player_ref
    else:
        # Varredura (#2): sem --player, escaneia o elenco inteiro e deixa o
        # filtro edge/EV revelar quem tem valor — sem adivinhar o jogador antes.
        stats = BSDStatsProvider(client)
        entidade = "jogadores"
    odds = ManualOdds([{
        "entidade": entidade, "linha": linha,
        "odd_over": odd_over, "odd_under": odd_under, "book": "manual",
    }])

    if usar_ia:
        from odd_analyzer.ai.analista import analisar as analista_fn
    else:
        analista_fn = fake_analista

    return analisar_jogo(
        event=event, market=market, stats_provider=stats, odds_provider=odds,
        repo=repo if repo is not None else InMemoryRepo(), analista_fn=analista_fn,
    )
