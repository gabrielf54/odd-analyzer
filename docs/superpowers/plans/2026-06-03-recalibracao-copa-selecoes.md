# Re-calibração dos mercados de jogador na população de SELEÇÃO (Copa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validar os 3 mercados de jogador (SOT · finalizações · desarmes) na população de SELEÇÃO, medindo exatamente a conta que o app roda ao vivo, e ligar na produção o modo que prestar — antes do dinheiro real em 11/06.

**Architecture:** Extrai a conta da taxa pra uma "conta pura" compartilhada (`assemble.py`) que prova e produção chamam. Um backtest novo (`collect_national.py` + `run_national_backtest.py`) replica a produção em jogos de seleção já jogados, com recorte anti-espiada (só jogos mais antigos que o alvo) e varredura 4× (só-seleção vs misto × com/sem amistoso). O app ganha um seletor de escopo de histórico e baseline ciente de população.

**Tech Stack:** Python 3.14, pytest, stdlib only (sem libs novas). BSD/Bzzoiro via `BSDClient`. Fakes nos testes (sem rede).

**Spec:** [../specs/2026-06-04-recalibracao-copa-selecoes-design.md](../specs/2026-06-04-recalibracao-copa-selecoes-design.md)

**Ligas de seleção (constante usada em vários lugares):** `{58, 59, 60, 61, 62, 64, 65, 66, 67, 31}` (amistosos = `31`).

**Rodar a suíte:** `.venv\Scripts\python.exe -m pytest -q`

**🚫 GIT SAFETY (todo subagente):** só `git add/commit/diff/log/status`. NUNCA `checkout/switch/reset/branch/stash/cherry-pick/restore/merge`. O controlador verifica a branch após cada commit.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/odd_analyzer/model/assemble.py` | conta pura: `filter_games_by_scope` + `player_mu_from_games` (compartilhada prova↔produção) | modificar |
| `src/odd_analyzer/providers/stats.py` | `entity_taxa` vira wrapper fino sobre a conta pura; lê `escopo_historico` do contexto | modificar |
| `src/odd_analyzer/model/markets.py` | `concede_baseline_nacional` (baseline de seleção) + helper `baseline_for` | modificar |
| `src/odd_analyzer/backtest/collect_national.py` | pool multi-liga de alvos + recorte anti-espiada `games_before_target` + concessão pooled | **criar** |
| `src/odd_analyzer/backtest/run_national_backtest.py` | scorer que replica produção + varredura 4× + tabela de métricas | **criar** |
| `scripts/measure_concede_baseline.py` | aceitar lista de ligas (pool de seleção) | modificar |
| `src/odd_analyzer/runner.py` | `normalize_event` carrega `league_id`; `run_analise` encaminha `escopo_historico`+`league_id` | modificar |
| `src/odd_analyzer/pipeline.py` | `analisar_jogo` encaminha `escopo_historico`; baseline via `baseline_for(market, league_id)` | modificar |
| `src/odd_analyzer/service.py` | `analisar` aceita `escopo_historico` + `league_id` | modificar |
| `app/streamlit_app.py` | seletor "Forma recente" (todos/só-seleção/só-clube) | modificar |
| `docs/ROADMAP.md` | veredito da calibração de seleção | modificar |
| `tests/test_assemble.py` | testes da conta pura + scope | modificar |
| `tests/test_stats_provider.py` | teste do escopo em `entity_taxa` | modificar |
| `tests/test_collect_national.py` | testes do coletor + anti-espiada | **criar** |
| `tests/test_service.py` | teste do escopo fim-a-fim | modificar |

---

## Task 1: Conta pura em `assemble.py` (seam de fidelidade)

**Files:**
- Modify: `src/odd_analyzer/model/assemble.py`
- Test: `tests/test_assemble.py`

Extrai a lógica de taxa→mu (hoje inline em `entity_taxa`) para funções puras que prova e produção compartilham. Sem nova matemática — só move e parametriza.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `tests/test_assemble.py`:

```python
from odd_analyzer.model.assemble import filter_games_by_scope, player_mu_from_games


def test_filter_games_by_scope_separa_por_team_id():
    games = [
        {"event_id": 1, "team_id": 100, "total_tackle": 2, "minutes_played": 90},  # seleção
        {"event_id": 2, "team_id": 200, "total_tackle": 5, "minutes_played": 90},  # clube
        {"event_id": 3, "team_id": 100, "total_tackle": 3, "minutes_played": 90},  # seleção
    ]
    assert len(filter_games_by_scope(games, "todos", 100)) == 3
    selecao = filter_games_by_scope(games, "selecao", 100)
    assert [g["event_id"] for g in selecao] == [1, 3]
    clube = filter_games_by_scope(games, "clube", 100)
    assert [g["event_id"] for g in clube] == [2]
    # team_id como str ou int não importa
    assert len(filter_games_by_scope(games, "selecao", "100")) == 2


def test_player_mu_from_games_pura_e_deterministica():
    games = [{"total_tackle": 2, "minutes_played": 90} for _ in range(10)]
    out = player_mu_from_games(games, stat_field="total_tackle", prior_rate=1.3,
                               prior_strength=12.0, opp_mult=1.0, ha_mult=1.0)
    assert out is not None
    assert out["n"] == 10
    assert out["mu"] > 0
    # multiplicadores compõem linearmente: dobrar opp_mult dobra o mu
    out2 = player_mu_from_games(games, stat_field="total_tackle", prior_rate=1.3,
                                prior_strength=12.0, opp_mult=2.0, ha_mult=1.0)
    assert abs(out2["mu"] - 2 * out["mu"]) < 1e-9


def test_player_mu_from_games_sem_amostra_retorna_none():
    assert player_mu_from_games([], stat_field="total_tackle", prior_rate=1.3,
                                prior_strength=12.0, opp_mult=1.0, ha_mult=1.0) is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_assemble.py -q`
Expected: FAIL — `ImportError: cannot import name 'filter_games_by_scope'`.

- [ ] **Step 3: Implementar as funções puras**

Em `src/odd_analyzer/model/assemble.py`, adicionar o import no topo (após o import existente) e as duas funções no fim:

```python
from odd_analyzer.model.shrinkage import shrink_rate


def filter_games_by_scope(games: list[dict], escopo: str, entity_team_id) -> list[dict]:
    """Filtra o histórico por escopo, comparando o team_id de cada jogo com o time que o
    jogador defende NESTE jogo-alvo (entity_team_id):
      'todos'   → tudo (clube + seleção).
      'selecao' → só os jogos com a MESMA camisa (team_id == entity_team_id).
      'clube'   → só as OUTRAS camisas (team_id != entity_team_id).
    Ordem preservada. team_id comparado como str (int/str não importa)."""
    if escopo == "todos":
        return games
    alvo = str(entity_team_id)
    if escopo == "selecao":
        return [g for g in games if str(g.get("team_id")) == alvo]
    if escopo == "clube":
        return [g for g in games if str(g.get("team_id")) != alvo]
    return games


def player_mu_from_games(games: list[dict], stat_field: str, prior_rate: float,
                         prior_strength: float, opp_mult: float, ha_mult: float,
                         minutos_esperados: float = 90.0) -> dict | None:
    """Conta pura compartilhada por produção (entity_taxa) e prova (backtest).
    `games` em ordem CRESCENTE (recente no fim). Devolve {mu, raw_rate, shrunk, n} ou None.
    Sem IO, sem rede — só janela + shrinkage + composição."""
    rates = windowed_rate(games, stat_field, minutes_field="minutes_played")
    w5, w3, w10 = rates.get("w5"), rates.get("w3"), rates.get("w10")
    raw_rate = w5 if w5 is not None else (w3 if w3 is not None else w10)
    if raw_rate is None:
        return None
    shrunk = shrink_rate(rate=raw_rate, apps=len(games),
                         prior_rate=prior_rate, prior_strength=prior_strength)
    mu = assemble_mu(rate_per90=shrunk, minutos_esperados=minutos_esperados,
                     opp_mult=opp_mult, ha_mult=ha_mult)
    return {"mu": mu, "raw_rate": raw_rate, "shrunk": shrunk, "n": len(games)}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_assemble.py -q`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/assemble.py tests/test_assemble.py
git commit -m "feat: conta pura compartilhada (filter_games_by_scope + player_mu_from_games)"
```

---

## Task 2: `entity_taxa` usa a conta pura + lê `escopo_historico`

**Files:**
- Modify: `src/odd_analyzer/providers/stats.py:100-146`
- Test: `tests/test_stats_provider.py`

`entity_taxa` deve (a) continuar com comportamento IDÊNTICO quando `escopo_historico` não vem (default "todos"); (b) aplicar o filtro de escopo quando vem.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `tests/test_stats_provider.py`:

```python
def test_entity_taxa_escopo_so_selecao_filtra_por_team_id():
    # histórico misto: 5 jogos pela seleção (team_id=1, 1 tackle) + 5 pelo clube (team_id=9, 6 tackles).
    # BSD entrega decrescente (recente primeiro).
    selecao = [{"event_id": 200+i, "team_id": 1, "total_tackle": 1, "minutes_played": 90} for i in range(5)]
    clube   = [{"event_id": 100+i, "team_id": 9, "total_tackle": 6, "minutes_played": 90} for i in range(5)]
    hist = selecao + clube
    prov = BSDStatsProvider(_FakeClient(hist))
    base_ctx = {"event": {"home_team": {"id": "1"}, "away_team": {"id": "2"}},
                "is_home": True, "entity_team_id": "1", "league_avg_conceded": 16.0}
    # só-seleção: taxa puxa pra ~1/jogo
    so_sel = prov.entity_taxa("p1", MARKETS["desarmes"], {**base_ctx, "escopo_historico": "selecao"})
    # só-clube: taxa puxa pra ~6/jogo (mu maior)
    so_clube = prov.entity_taxa("p1", MARKETS["desarmes"], {**base_ctx, "escopo_historico": "clube"})
    assert so_sel is not None and so_clube is not None
    assert so_sel["mu"] < so_clube["mu"]
    assert so_sel["amostra_jogos"] == 5 and so_clube["amostra_jogos"] == 5
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py -q`
Expected: FAIL — sem o filtro, ambos usam os 10 jogos → mesmas amostras/mu (assert quebra).

- [ ] **Step 3: Refatorar `entity_taxa` pra usar a conta pura + escopo**

Em `src/odd_analyzer/providers/stats.py`, trocar o import da linha 11 e o corpo de `entity_taxa` (linhas ~109-146). Novo import:

```python
from odd_analyzer.model.assemble import (
    windowed_rate, assemble_mu, filter_games_by_scope, player_mu_from_games,
)
```

Substituir o trecho de cálculo dentro de `entity_taxa` (da linha `raw = self._client.player_stats(entity_id)` até o `return {...}`) por:

```python
        raw = self._client.player_stats(entity_id)
        results: list[dict] = raw.get("results", [])
        if not results:
            return None
        # BSD entrega mais-recente-primeiro; a conta pura espera crescente (recente no fim).
        games = list(reversed(results))
        # Escopo de histórico (escolha do usuário): 'todos' (default, = comportamento atual),
        # 'selecao' (mesma camisa do jogo-alvo) ou 'clube' (outras camisas).
        escopo = contexto.get("escopo_historico", "todos")
        games = filter_games_by_scope(games, escopo, entity_team_id)
        if not games:
            return None

        opp_team_id = self._opp_team_id(contexto)
        team_field = self._TEAM_STAT_FIELD.get(market.stat_field, market.stat_field)
        opp_conceded = self._team_conceded(opp_team_id, team_field)
        opp_mult = self._opp_mult(opp_conceded, league_avg)
        ha_mult = home_away_multiplier(is_home, self.HOME_FACTOR, self.AWAY_FACTOR)

        calc = player_mu_from_games(
            games, stat_field=market.stat_field, prior_rate=market.prior_rate,
            prior_strength=market.prior_strength, opp_mult=opp_mult, ha_mult=ha_mult,
            minutos_esperados=90.0)
        if calc is None:
            return None
        xi_confirmado = (str(entity_id) in xi_team_ids) if xi_team_ids else True
        n = calc["n"]
        incerteza = "alta" if n < 5 else ("media" if n < 12 else "baixa")
        concedido = f"{opp_conceded:.1f}" if opp_conceded is not None else "n/d (neutro)"
        return {
            "mu": calc["mu"], "minutos_esperados": 90.0,
            "xi_confirmado": xi_confirmado, "amostra_jogos": n,
            "concedido_adversario": concedido, "incerteza": incerteza,
        }
```

> Nota: as variáveis `event`, `is_home`, `league_avg`, `xi_team_ids`, `entity_team_id` continuam vindo do bloco no topo de `entity_taxa` (linhas ~103-107) — não mexer nelas.

- [ ] **Step 4: Rodar e ver passar (inclui regressão)**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py tests/test_pipeline.py tests/test_runner.py -q`
Expected: PASS — o teste novo passa E os antigos (`test_entity_taxa_usa_jogos_recentes_e_per90` etc.) continuam verdes (escopo default "todos" preserva o comportamento).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/stats.py tests/test_stats_provider.py
git commit -m "feat: entity_taxa chama a conta pura e aceita escopo_historico"
```

---

## Task 3: Recorte anti-espiada em `collect_national.py`

**Files:**
- Create: `src/odd_analyzer/backtest/collect_national.py`
- Test: `tests/test_collect_national.py`

A função que garante "prova sem colar": dado o histórico (decrescente) e o id do jogo-alvo, devolve só os jogos MAIS ANTIGOS que o alvo, em ordem crescente.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_collect_national.py`:

```python
from odd_analyzer.backtest.collect_national import games_before_target


def test_games_before_target_pega_so_mais_antigos_em_ordem_crescente():
    # BSD decrescente (recente primeiro): ids 105..100. Alvo = 103.
    hist = [{"event_id": 105, "total_tackle": 9}, {"event_id": 104, "total_tackle": 8},
            {"event_id": 103, "total_tackle": 7}, {"event_id": 102, "total_tackle": 6},
            {"event_id": 101, "total_tackle": 5}, {"event_id": 100, "total_tackle": 4}]
    older = games_before_target(hist, 103)
    # só os mais antigos que 103 (102,101,100), em ordem CRESCENTE (100 primeiro)
    assert [g["event_id"] for g in older] == [100, 101, 102]


def test_games_before_target_alvo_ausente_retorna_vazio():
    hist = [{"event_id": 105}, {"event_id": 104}]
    assert games_before_target(hist, 999) == []


def test_games_before_target_alvo_mais_antigo_sem_historico():
    hist = [{"event_id": 105}, {"event_id": 100}]
    assert games_before_target(hist, 100) == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: FAIL — módulo/função inexistente.

- [ ] **Step 3: Implementar `games_before_target`**

Criar `src/odd_analyzer/backtest/collect_national.py`:

```python
"""Coletor de calibração na população de SELEÇÃO (Copa).

Replica a produção em jogos de seleção JÁ JOGADOS, com recorte anti-espiada
(só jogos mais antigos que o alvo) e pool de várias ligas de seleção.
Formas reais do BSD em docs/apis/bsd-bzzoiro/examples/ (wc_*.json).
"""

NATIONAL_LEAGUES = (58, 59, 60, 61, 62, 64, 65, 66, 67, 31)
FRIENDLY_LEAGUE = 31


def games_before_target(history_desc: list[dict], target_event_id) -> list[dict]:
    """history_desc: histórico do jogador em ordem DECRESCENTE (BSD: recente primeiro),
    cada linha com 'event_id'. Devolve só os jogos ESTRITAMENTE mais antigos que o alvo,
    em ordem CRESCENTE (mais antigo primeiro) para alimentar a conta pura.
    Se o alvo não está no histórico → [] (não dá pra estabelecer 'antes' com segurança)."""
    ids = [str(r.get("event_id")) for r in history_desc]
    alvo = str(target_event_id)
    if alvo not in ids:
        return []
    idx = ids.index(alvo)
    older_desc = history_desc[idx + 1:]   # depois do alvo no DESC = mais antigos
    return list(reversed(older_desc))      # crescente
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/collect_national.py tests/test_collect_national.py
git commit -m "feat: games_before_target (recorte anti-espiada do backtest de selecao)"
```

---

## Task 4: Pool multi-liga de alvos + concessão pooled

**Files:**
- Modify: `src/odd_analyzer/backtest/collect_national.py`
- Test: `tests/test_collect_national.py`

Junta jogos-alvo de várias ligas de seleção num balde, com o toggle de amistoso, e agrega a concessão por seleção (denominador do matchup) — mesma metodologia do `collect_bsd`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `tests/test_collect_national.py`:

```python
from odd_analyzer.backtest.collect_national import pool_targets


class _PoolClient:
    """Fake: 2 ligas (64 competitivo, 31 amistoso), 1 jogo cada, 2 jogadores por jogo."""
    def events(self, league_id, status, limit):
        base = {64: [{"id": 900, "home_team_id": 1, "away_team_id": 2, "event_date": "2026-03-01"}],
                31: [{"id": 800, "home_team_id": 1, "away_team_id": 3, "event_date": "2026-06-01"}]}
        return {"results": base.get(league_id, [])}
    def event_player_stats(self, eid):
        return {"player_stats": [
            {"player_id": 10, "team_id": 1, "minutes_played": 90, "total_tackle": 3},
            {"player_id": 20, "team_id": 2 if eid == 900 else 3, "minutes_played": 90, "total_tackle": 1},
        ]}


def test_pool_targets_junta_ligas_sem_amistoso():
    targets, conceded, league_avg = pool_targets(
        _PoolClient(), leagues=(64, 31), n_per_league=10, stat_field="total_tackle",
        include_friendlies=False)
    # liga 31 (amistoso) excluída → só o jogo 900
    assert [t["event_id"] for t in targets] == [900]
    assert targets[0]["home_id"] == 1 and targets[0]["away_id"] == 2
    # actual do jogador 10 está no target
    assert any(p["player_id"] == 10 for p in targets[0]["player_stats"])


def test_pool_targets_com_amistoso_inclui_liga_31():
    targets, _, _ = pool_targets(
        _PoolClient(), leagues=(64, 31), n_per_league=10, stat_field="total_tackle",
        include_friendlies=True)
    assert sorted(t["event_id"] for t in targets) == [800, 900]


def test_pool_targets_concede_por_time():
    # jogo 900: time 1 concede o que o time 2 produziu (1 tackle); time 2 concede 3.
    _, conceded, league_avg = pool_targets(
        _PoolClient(), leagues=(64,), n_per_league=10, stat_field="total_tackle",
        include_friendlies=False)
    assert conceded[1] == 1.0 and conceded[2] == 3.0
    assert abs(league_avg - 2.0) < 1e-9
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: FAIL — `pool_targets` inexistente.

- [ ] **Step 3: Implementar `pool_targets`**

Adicionar a `src/odd_analyzer/backtest/collect_national.py`:

```python
def pool_targets(client, leagues, n_per_league, stat_field, include_friendlies):
    """Junta jogos-alvo finalizados de várias ligas de seleção.
    Devolve (targets, conceded_pg, league_avg):
      targets: [{event_id, league_id, home_id, away_id, date, player_stats:[...]}]
               (player_stats = actuals de quem entrou em campo, minutos>0)
      conceded_pg: {team_id: média do stat que os adversários DELE produziram/jogo}
      league_avg: média de conceded_pg (denominador do opponent_multiplier)
    Mesma metodologia de concessão do collect_bsd (pool inteiro, sem leave-one-out no matchup)."""
    targets = []
    t_against, t_games = {}, {}
    for lid in leagues:
        if lid == FRIENDLY_LEAGUE and not include_friendlies:
            continue
        evs = client.events(league_id=lid, status="finished", limit=n_per_league)
        results = evs.get("results", []) if isinstance(evs, dict) else []
        for ev in results[:n_per_league]:
            home_id, away_id = ev.get("home_team_id"), ev.get("away_team_id")
            if home_id is None or away_id is None:
                continue
            try:
                ps = client.event_player_stats(ev["id"]).get("player_stats", [])
            except Exception:
                continue
            jogadores, stat_by_team = [], {}
            for row in ps:
                if (row.get("minutes_played") or 0) <= 0:
                    continue
                tid = row.get("team_id")
                val = row.get(stat_field) or 0
                jogadores.append(row)
                stat_by_team[tid] = stat_by_team.get(tid, 0) + val
            if not jogadores:
                continue
            targets.append({
                "event_id": ev["id"], "league_id": lid,
                "home_id": home_id, "away_id": away_id,
                "date": ev.get("event_date"), "player_stats": jogadores,
            })
            if home_id in stat_by_team and away_id in stat_by_team:
                t_against[home_id] = t_against.get(home_id, 0) + stat_by_team[away_id]
                t_against[away_id] = t_against.get(away_id, 0) + stat_by_team[home_id]
                t_games[home_id] = t_games.get(home_id, 0) + 1
                t_games[away_id] = t_games.get(away_id, 0) + 1
    conceded_pg = {t: t_against[t] / t_games[t] for t in t_against}
    league_avg = (sum(conceded_pg.values()) / len(conceded_pg)) if conceded_pg else 0.0
    return targets, conceded_pg, league_avg
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/collect_national.py tests/test_collect_national.py
git commit -m "feat: pool_targets (alvos multi-liga de selecao + concessao pooled)"
```

---

## Task 5: Scorer + varredura 4× em `run_national_backtest.py`

**Files:**
- Create: `src/odd_analyzer/backtest/run_national_backtest.py`
- Test: `tests/test_collect_national.py` (teste do scorer puro)

O scorer replica a produção: por alvo, por jogador com minutos, puxa o histórico, recorta anti-espiada, filtra escopo, monta o mu pela conta pura, prevê over por linha, compara com o actual. Junta as métricas. A varredura roda os 4 modos.

- [ ] **Step 1: Escrever o teste que falha (scorer puro com fake client)**

Adicionar a `tests/test_collect_national.py`:

```python
from odd_analyzer.backtest.run_national_backtest import score_targets
from odd_analyzer.model.markets import MARKETS


class _ScoreClient:
    """1 alvo (jogo 900). Jogador 10 tem histórico: alvo 900 + 3 jogos mais antigos de seleção."""
    def events(self, league_id, status, limit):
        return {"results": [{"id": 900, "home_team_id": 1, "away_team_id": 2,
                             "event_date": "2026-03-01"}]}
    def event_player_stats(self, eid):
        return {"player_stats": [
            {"player_id": 10, "team_id": 1, "minutes_played": 90, "total_tackle": 2},
            {"player_id": 20, "team_id": 2, "minutes_played": 90, "total_tackle": 1},
        ]}
    def player_stats(self, pid):
        # DESC (recente primeiro): alvo 900 no topo, depois 3 jogos mais antigos (901..903 são +antigos? não:
        # ids menores = mais antigos). Damos ao alvo id 900 e antigos 803/802/801.
        return {"results": [
            {"event_id": 900, "team_id": 1, "total_tackle": 2, "minutes_played": 90},
            {"event_id": 803, "team_id": 1, "total_tackle": 3, "minutes_played": 90},
            {"event_id": 802, "team_id": 1, "total_tackle": 2, "minutes_played": 90},
            {"event_id": 801, "team_id": 1, "total_tackle": 4, "minutes_played": 90},
        ]}
    def event_stats(self, eid):
        return {"stats": {}}


def test_score_targets_gera_preds_e_actuals_sem_espiar_o_alvo():
    targets, conceded, league_avg = pool_targets(
        _ScoreClient(), leagues=(64,), n_per_league=10, stat_field="total_tackle",
        include_friendlies=False)
    preds, actuals = score_targets(
        _ScoreClient(), targets, conceded, league_avg, MARKETS["desarmes"], escopo="selecao")
    # jogador 10 fez 2 tackles no alvo → actual de over 1.5 = 1
    assert actuals[1.5]  # tem amostra
    assert all(0.0 <= p <= 1.0 for p in preds[1.5])
    # a previsão usa só os 3 jogos ANTIGOS (801/802/803), nunca o alvo 900
    assert len(preds[1.5]) >= 1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: FAIL — `score_targets` inexistente.

- [ ] **Step 3: Implementar o scorer + sweep + CLI**

Criar `src/odd_analyzer/backtest/run_national_backtest.py`:

```python
"""Calibração dos mercados de jogador na população de SELEÇÃO (Copa).

Replica a produção (conta pura compartilhada) em jogos de seleção já jogados,
com recorte anti-espiada e varredura 4× (escopo × amistoso). Imprime tabela de
métricas por mercado×modo. Reusa calibration.py.

Uso: .venv\\Scripts\\python.exe -m odd_analyzer.backtest.run_national_backtest <market_key> [n_per_league]
"""
import sys
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier
from odd_analyzer.model.assemble import filter_games_by_scope, player_mu_from_games
from odd_analyzer.backtest.collect_national import (
    pool_targets, games_before_target, NATIONAL_LEAGUES,
)
from odd_analyzer.backtest.calibration import (
    brier_score, log_loss, expected_calibration_error, brier_skill_score, reliability_bins,
)

HOME_FACTOR, AWAY_FACTOR = 1.08, 0.92
OPP_MULT_MIN, OPP_MULT_MAX = 0.7, 1.4


def _clamp_opp(opp_conceded, league_avg):
    if opp_conceded is None or not league_avg:
        return 1.0
    return max(OPP_MULT_MIN, min(OPP_MULT_MAX, opponent_multiplier(opp_conceded, league_avg)))


def score_targets(client, targets, conceded_pg, league_avg, market, escopo):
    """PURO em relação à decisão (faz IO só pra puxar o histórico do jogador).
    Devolve ({linha:[preds]}, {linha:[actuals]}). Recorte anti-espiada + escopo + conta pura."""
    lines = market.lines
    preds = {l: [] for l in lines}
    actuals = {l: [] for l in lines}
    hist_cache = {}
    for tg in targets:
        eid = tg["event_id"]
        for row in tg["player_stats"]:
            pid = row.get("player_id")
            if pid is None:
                continue
            tid = row.get("team_id")
            is_home = (tid == tg["home_id"])
            opp_id = tg["away_id"] if is_home else tg["home_id"]
            actual_val = row.get(market.stat_field) or 0
            if pid not in hist_cache:
                try:
                    hist_cache[pid] = client.player_stats(pid).get("results", [])
                except Exception:
                    hist_cache[pid] = []
            older = games_before_target(hist_cache[pid], eid)        # anti-espiada (crescente)
            older = filter_games_by_scope(older, escopo, tid)        # escopo por team_id
            opp_mult = _clamp_opp(conceded_pg.get(opp_id), league_avg)
            ha_mult = home_away_multiplier(is_home, HOME_FACTOR, AWAY_FACTOR)
            calc = player_mu_from_games(
                older, stat_field=market.stat_field, prior_rate=market.prior_rate,
                prior_strength=market.prior_strength, opp_mult=opp_mult, ha_mult=ha_mult)
            if calc is None:
                continue
            for l in lines:
                preds[l].append(prob_over_line(calc["mu"], l, r=market.nb_dispersion))
                actuals[l].append(1 if actual_val > l else 0)
    return preds, actuals


def _report(market_key, modo, preds, actuals):
    market = MARKETS[market_key]
    print(f"\n##### {market_key} | modo={modo} #####")
    for l in market.lines:
        if not preds[l]:
            print(f"  over {l}: sem amostra"); continue
        base = sum(actuals[l]) / len(actuals[l])
        print(f"  === over {l} | n={len(preds[l])} | freq real={base:.3f} ===")
        print(f"    Brier {brier_score(preds[l], actuals[l]):.4f} | "
              f"LogLoss {log_loss(preds[l], actuals[l]):.4f} | "
              f"ECE {expected_calibration_error(preds[l], actuals[l]):.4f} | "
              f"BrierSkill {brier_skill_score(preds[l], actuals[l]):.3f}")
        for b in reliability_bins(preds[l], actuals[l]):
            print(f"      {b['bin']/10:.1f}-{(b['bin']+1)/10:.1f}: "
                  f"{b['mean_pred']:.3f}->{b['mean_actual']:.3f} (n={b['count']})")


def run_sweep(market_key, n_per_league=60):
    """Varredura 4×: {selecao, todos} × {com amistoso, sem amistoso}."""
    market = MARKETS[market_key]
    if market.nivel != "jogador":
        raise SystemExit(f"{market_key} não é mercado de jogador.")
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    for include_friendlies in (False, True):
        targets, conceded_pg, league_avg = pool_targets(
            c, NATIONAL_LEAGUES, n_per_league, market.stat_field, include_friendlies)
        amist = "com-amistoso" if include_friendlies else "sem-amistoso"
        print(f"\n======== {market_key} | {amist} | alvos={len(targets)} | "
              f"concede médio={league_avg:.2f} ========")
        for escopo in ("selecao", "todos"):
            preds, actuals = score_targets(c, targets, conceded_pg, league_avg, market, escopo)
            _report(market_key, f"{escopo}/{amist}", preds, actuals)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("uso: run_national_backtest <market_key> [n_per_league]")
    mk = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    run_sweep(mk, n)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/run_national_backtest.py tests/test_collect_national.py
git commit -m "feat: score_targets + varredura 4x da calibracao de selecao"
```

---

## Task 6: `measure_concede_baseline.py` aceita pool de ligas

**Files:**
- Modify: `scripts/measure_concede_baseline.py`

Permitir medir o `concede_baseline` agregando várias ligas de seleção (passar `pool` como argumento).

- [ ] **Step 1: Trocar o `main` para aceitar pool**

Em `scripts/measure_concede_baseline.py`, substituir a função `main` por:

```python
def _measure(c, leagues, n):
    soma = {campo: 0.0 for _, campo in EIXOS}
    cont = {campo: 0 for _, campo in EIXOS}
    total_jogos = 0
    for league in leagues:
        evs = c.events(league_id=league, status="finished", limit=n).get("results", [])[:n]
        total_jogos += len(evs)
        for ev in evs:
            try:
                stats = c.event_stats(ev["id"]).get("stats", {})
            except Exception:
                continue
            home, away = stats.get("home", {}), stats.get("away", {})
            for _, campo in EIXOS:
                for produtor in (home, away):
                    v = produtor.get(campo)
                    if v is not None:
                        soma[campo] += float(v); cont[campo] += 1
    return soma, cont, total_jogos


def main():
    # Uso: measure_concede_baseline.py [league_id|pool] [n]
    #   league_id numérico → 1 liga (compat); "pool" → ligas de seleção (Copa).
    arg = sys.argv[1] if len(sys.argv) > 1 else "9"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 80
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    if arg == "pool":
        from odd_analyzer.backtest.collect_national import NATIONAL_LEAGUES
        leagues = NATIONAL_LEAGUES
        rotulo = f"pool-selecao{list(leagues)}"
    else:
        leagues = (int(arg),)
        rotulo = f"liga={arg}"
    soma, cont, total_jogos = _measure(c, leagues, n)
    print(f"{rotulo} jogos={total_jogos}")
    print("Substituir em markets.py concede_baseline (ou concede_baseline_nacional):")
    for label, campo in EIXOS:
        media = soma[campo] / cont[campo] if cont[campo] else 0.0
        print(f"  {label:<28} = {media:.2f}  (n={cont[campo]})")
```

- [ ] **Step 2: Sanidade de import (não quebrou o módulo)**

Run: `.venv\Scripts\python.exe -c "import ast; ast.parse(open('scripts/measure_concede_baseline.py', encoding='utf-8').read()); print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add scripts/measure_concede_baseline.py
git commit -m "feat: measure_concede_baseline aceita pool de ligas de selecao"
```

---

## Task 7: Baseline ciente de população em `markets.py`

**Files:**
- Modify: `src/odd_analyzer/model/markets.py`
- Test: `tests/test_markets.py`

Adiciona o campo `concede_baseline_nacional` (preenchido na Task 10) e um helper `baseline_for(market, league_id)` que escolhe o baseline certo pela liga.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `tests/test_markets.py`:

```python
from odd_analyzer.model.markets import MARKETS, baseline_for
from odd_analyzer.backtest.collect_national import NATIONAL_LEAGUES


def test_baseline_for_escolhe_por_populacao():
    m = MARKETS["sot"]
    # liga de clube (9) → baseline de clube
    assert baseline_for(m, 9) == m.concede_baseline
    # liga de seleção (64) → baseline nacional
    assert baseline_for(m, 64) == m.concede_baseline_nacional
    # liga 27 (WC) tratada como seleção
    assert baseline_for(m, 27) == m.concede_baseline_nacional
    # liga desconhecida/None → clube (default seguro)
    assert baseline_for(m, None) == m.concede_baseline
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_markets.py -q`
Expected: FAIL — `concede_baseline_nacional`/`baseline_for` inexistentes.

- [ ] **Step 3: Implementar o campo + helper**

Em `src/odd_analyzer/model/markets.py`:

(a) Adicionar o campo ao dataclass (após `concede_baseline`):

```python
    # Baseline de SELEÇÃO (Copa) do mesmo eixo. Preenchido pelo league-sweep de seleção
    # (scripts/measure_concede_baseline.py pool). Default = igual ao de clube até medir.
    concede_baseline_nacional: float = 0.0
```

(b) Adicionar `concede_baseline_nacional=<igual ao concede_baseline atual>` em CADA um dos 3 mercados de jogador (sot, finalizacoes, desarmes) como valor inicial (será atualizado na Task 10 com o número medido). Ex. para `sot`: `concede_baseline_nacional=4.55,`. Para `finalizacoes`: `13.46`. Para `desarmes`: `14.64`.

(c) Adicionar o helper no fim do arquivo (após o dict `MARKETS`):

```python
# Ligas de seleção (Copa e correlatas) → usam o baseline nacional. WC2026 = 27.
_NATIONAL_LEAGUE_IDS = {58, 59, 60, 61, 62, 64, 65, 66, 67, 31, 27}


def baseline_for(market: MarketSpec, league_id) -> float:
    """Escolhe o concede_baseline certo pela liga do jogo: liga de seleção → nacional;
    senão (clube ou desconhecida) → o de clube (default seguro)."""
    try:
        lid = int(league_id)
    except (TypeError, ValueError):
        return market.concede_baseline
    if lid in _NATIONAL_LEAGUE_IDS:
        return market.concede_baseline_nacional or market.concede_baseline
    return market.concede_baseline
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_markets.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/markets.py tests/test_markets.py
git commit -m "feat: concede_baseline_nacional + baseline_for (baseline ciente de populacao)"
```

---

## Task 8: Encaminhar `escopo_historico` + `league_id` por todo o caminho

**Files:**
- Modify: `src/odd_analyzer/pipeline.py:12-20,82-92,146-162`
- Modify: `src/odd_analyzer/runner.py:14-23,87-126`
- Modify: `src/odd_analyzer/service.py:42-64`
- Test: `tests/test_service.py`

`escopo_historico` chega no contexto do `entity_taxa`; `league_id` escolhe o baseline via `baseline_for`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `tests/test_service.py` (seguir o padrão de fake client já usado no arquivo; este teste verifica que o escopo é repassado):

```python
def test_analisar_repassa_escopo_historico(monkeypatch):
    import odd_analyzer.service as svc
    capturado = {}

    def fake_run_analise(client, event_id, market_key, player_ref, linha, odd_over,
                         odd_under, usar_ia=False, repo=None, escopo_historico="todos",
                         league_id=None):
        capturado["escopo"] = escopo_historico
        capturado["league_id"] = league_id
        return {"candidatos": [], "ia": {}}

    class _C:
        def get_event(self, eid): return {"home_team": "A", "away_team": "B"}

    monkeypatch.setattr(svc, "run_analise", fake_run_analise)
    out = svc.analisar(_C(), "900", "desarmes", 1.5, 1.8, 2.0,
                       escopo_historico="selecao", league_id=64)
    assert capturado["escopo"] == "selecao"
    assert capturado["league_id"] == 64
    assert out["em_validacao"] is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -q`
Expected: FAIL — `analisar` não aceita `escopo_historico`/`league_id`.

- [ ] **Step 3a: `pipeline.analisar_jogo` aceita e propaga o escopo**

Em `src/odd_analyzer/pipeline.py`:

(i) Assinatura de `analisar_jogo` (linha ~12): adicionar dois params no fim:

```python
def analisar_jogo(
    event: dict,
    market: MarketSpec,
    stats_provider,
    odds_provider,
    repo,
    overrides: dict | None = None,
    analista_fn=_default_analista,
    escopo_historico: str = "todos",
    league_id=None,
) -> dict:
```

(ii) Passar para os dispatchers — trocar as chamadas no corpo:

```python
    if market.kind == "contagem":
        candidatos = _run_contagem(event, market, stats_provider, odds_provider,
                                   escopo_historico, league_id)
```

(iii) `_run_contagem` e `_contagem_jogador` recebem os params. Trocar assinaturas e o contexto:

```python
def _run_contagem(event, market, stats_provider, odds_provider,
                  escopo_historico="todos", league_id=None) -> list[dict]:
    linhas = odds_provider.linhas(event, market)
    if not linhas:
        return []
    if market.nivel == "partida":
        return _contagem_partida(event, market, stats_provider, linhas)
    return _contagem_jogador(event, market, stats_provider, linhas,
                             escopo_historico, league_id)
```

```python
def _contagem_jogador(event, market, stats_provider, linhas,
                      escopo_historico="todos", league_id=None) -> list[dict]:
    from odd_analyzer.model.markets import baseline_for
    elenco = stats_provider.elenco(event)
    home_id = str(event.get("home_team", {}).get("id", ""))
    away_id = str(event.get("away_team", {}).get("id", ""))
    xi_team_ids = stats_provider.xi_ids(event) if hasattr(stats_provider, "xi_ids") else set()
    base = baseline_for(market, league_id)
    candidatos = []
    for entidade in elenco:
        is_home = entidade.get("team_id") == home_id
        contexto = {
            "event": event,
            "entity_team_id": entidade.get("team_id", entidade["id"]),
            "is_home": is_home,
            "opp_team_id": away_id if is_home else home_id,
            "league_avg_conceded": base,
            "xi_team_ids": xi_team_ids,
            "escopo_historico": escopo_historico,
        }
        taxa = stats_provider.entity_taxa(entidade["id"], market, contexto)
        if taxa is None:
            continue
        for linha_info in linhas:
            prob_modelo = prob_over_line(taxa["mu"], linha_info["linha"], r=market.nb_dispersion)
            candidatos.append(build_candidate(
                jogador=entidade["name"], linha=linha_info["linha"],
                odd_over=linha_info["odd_over"], odd_under=linha_info["odd_under"],
                prob_modelo=prob_modelo, mu=taxa["mu"],
                minutos_esperados=taxa["minutos_esperados"], xi_confirmado=taxa["xi_confirmado"],
                amostra_jogos=taxa["amostra_jogos"], concedido_adversario=taxa["concedido_adversario"],
                incerteza=taxa["incerteza"], market_type=market.key, player_id=entidade["id"],
            ))
    return candidatos
```

- [ ] **Step 3b: `runner` carrega `league_id` e encaminha**

Em `src/odd_analyzer/runner.py`:

(i) `normalize_event` (linha ~14) inclui o league_id:

```python
def normalize_event(raw: dict) -> dict:
    """Forma real flat de /events/{id}/ → forma aninhada que o pipeline espera."""
    home = str(raw.get("home_team", ""))
    away = str(raw.get("away_team", ""))
    return {
        "id": str(raw["id"]),
        "jogo": f"{home} x {away}",
        "league_id": raw.get("league_id"),
        "home_team": {"id": str(raw.get("home_team_id", "")), "name": home},
        "away_team": {"id": str(raw.get("away_team_id", "")), "name": away},
    }
```

(ii) `run_analise` (linha ~87) aceita os params e os passa ao `analisar_jogo`. Assinatura:

```python
def run_analise(client, event_id: str, market_key: str, player_ref: str | None,
                linha: float, odd_over: float, odd_under: float,
                usar_ia: bool = False, repo=None,
                escopo_historico: str = "todos", league_id=None) -> dict:
```

E, dentro, derivar o league_id do evento quando não veio explícito, e passar no retorno:

```python
    if league_id is None:
        league_id = event.get("league_id")
    ...
    return analisar_jogo(
        event=event, market=market, stats_provider=stats, odds_provider=odds,
        repo=repo if repo is not None else InMemoryRepo(), analista_fn=analista_fn,
        escopo_historico=escopo_historico, league_id=league_id,
    )
```

- [ ] **Step 3c: `service.analisar` aceita e repassa**

Em `src/odd_analyzer/service.py`, trocar a assinatura e a chamada de `run_analise`:

```python
def analisar(client, event_id, market_key, linha, odd_over, odd_under,
             usar_ia: bool = False, repo=None, escopo_historico: str = "todos",
             league_id=None) -> dict:
```

```python
    out = run_analise(client, event_id, market_key, None,
                      linha, odd_over, odd_under, usar_ia=usar_ia, repo=repo,
                      escopo_historico=escopo_historico, league_id=league_id)
```

- [ ] **Step 4: Rodar e ver passar (inclui regressão de pipeline/runner/service)**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py tests/test_pipeline.py tests/test_runner.py tests/test_pipeline_xi.py -q`
Expected: PASS — escopo default "todos" preserva o comportamento dos testes antigos.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/pipeline.py src/odd_analyzer/runner.py src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: encaminha escopo_historico + league_id (baseline por populacao) ate o entity_taxa"
```

---

## Task 9: Seletor "Forma recente" no Streamlit

**Files:**
- Modify: `app/streamlit_app.py:88-129`
- Test: `tests/test_front_smoke.py` (se cobrir import) — senão, sanity de import

Adiciona o seletor de escopo na tela de análise e passa pro `service.analisar` (com o `league_id` do jogo).

- [ ] **Step 1: Adicionar o seletor e repassar**

Em `app/streamlit_app.py`, dentro de `_render_mercado`, antes do bloco de odds (`c1, c2, c3, c4 = st.columns(4)`), inserir o seletor:

```python
    ESCOPOS = {"Seleção + clube (todos)": "todos", "Só seleção": "selecao", "Só clube": "clube"}
    escopo_label = st.selectbox(
        "Forma recente (que jogos contar)", list(ESCOPOS), key=f"esc-{market_key}",
        help="Quais jogos do jogador entram na média: todos, só os pela seleção (mesma camisa "
             "deste jogo) ou só os do clube. Em jogo de Copa, 'Só seleção' usa apenas jogos pela seleção.")
    escopo_historico = ESCOPOS[escopo_label]
```

E na chamada do `service.analisar` (linha ~125), passar `escopo_historico` e o `league_id` do jogo (o jogo selecionado carrega a liga — ver Step 2):

```python
        out = service.analisar(_client(), j["id"], market_key, linha, over, under,
                               usar_ia=usar_ia, repo=_repo(),
                               escopo_historico=escopo_historico, league_id=j.get("league_id"))
```

- [ ] **Step 2: Garantir que o jogo carrega `league_id`**

Em `src/odd_analyzer/service.py`, `listar_jogos`, incluir `league_id` no dict de cada jogo (a lista de eventos do BSD traz `league_id`):

```python
        jogos.append({
            "id": ev.get("id"),
            "mandante": ev.get("home_team"),
            "visitante": ev.get("away_team"),
            "data": ev.get("event_date"),
            "status": ev.get("status"),
            "placar": placar,
            "league_id": ev.get("league_id"),
        })
```

> O `listar_jogos` é chamado com `league_id` já conhecido (a UI escolhe a liga). Se `ev` não trouxer `league_id`, usar o argumento: trocar `"league_id": ev.get("league_id")` por `"league_id": ev.get("league_id", league_id)`.

- [ ] **Step 3: Sanity de import do front + suíte de service**

Run: `.venv\Scripts\python.exe -c "import ast; ast.parse(open('app/streamlit_app.py', encoding='utf-8').read()); print('ok')"`
Expected: `ok`.
Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py tests/test_front_smoke.py -q`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/streamlit_app.py src/odd_analyzer/service.py
git commit -m "feat: seletor de escopo de historico no front + league_id no jogo"
```

---

## Task 10: Rodar a calibração de verdade — medir, preencher, vereditos (DELIVERABLE)

**Files:**
- Modify: `src/odd_analyzer/model/markets.py` (números medidos)
- Modify: `docs/ROADMAP.md` (tabela de veredito de seleção)

Esta é a entrega: rodar contra o BSD vivo, registrar os números honestos, ligar o modo vencedor por mercado e selar o que não calibrar. (Passos de execução real — produzem dados, não código.)

- [ ] **Step 1: Medir o baseline de seleção (pool)**

Run: `.venv\Scripts\python.exe scripts\measure_concede_baseline.py pool 60`
Anotar a saída (sot/finalizações/desarmes). **Atualizar** `concede_baseline_nacional` dos 3 mercados de jogador em `src/odd_analyzer/model/markets.py` com os valores impressos.

- [ ] **Step 2: Rodar a varredura 4× por mercado**

```
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_national_backtest sot 60
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_national_backtest finalizacoes 60
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_national_backtest desarmes 60
```

Coletar Brier/ECE/BrierSkill por mercado × modo (4 modos cada).

- [ ] **Step 3: Veredito honesto + selagem**

Por mercado, escolher o **modo vencedor** (menor ECE com BrierSkill>0 nas linhas úteis), seguindo o mesmo crivo da liga 9 (ECE<0.08 aceitável, BrierSkill>0). Critério de selagem: se **nenhum** modo dá BrierSkill>0 nas linhas úteis → o mercado entra "em validação" pra Copa.

Registrar em `docs/ROADMAP.md` uma nova subseção **"Calibração — população de SELEÇÃO (Copa)"** com a tabela (mercado | modo | linha | n | freq_real | Brier | ECE | BrierSkill) e o veredito por mercado, no mesmo formato da seção de liga 9 existente. Marcar qual escopo virou default por mercado.

- [ ] **Step 4: Default do seletor = modo vencedor**

Se o veredito apontar um escopo melhor que "todos" para algum mercado, ajustar o `index` default do `st.selectbox` em `app/streamlit_app.py` para esse mercado (ex.: `index=list(ESCOPOS).index("Só seleção")`). Se "todos" vencer em todos, deixar como está.

- [ ] **Step 5: Suíte cheia + commit**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: PASS (toda a suíte).

```bash
git add src/odd_analyzer/model/markets.py docs/ROADMAP.md app/streamlit_app.py
git commit -m "feat: veredito da calibracao de selecao (Copa) + baseline nacional medido"
```

---

## Self-Review (controlador)

**Spec coverage:**
- Conta pura compartilhada → Task 1, 2. ✓
- Varredura 4× (escopo × amistoso) → Task 5. ✓
- Anti-espiada sem mapa de datas → Task 3. ✓
- Pool multi-liga + concessão → Task 4. ✓
- Escopo escolhível no app → Task 9; threading → Task 8. ✓
- Baseline ciente de população → Task 7; medido → Task 10. ✓
- Veredito honesto + selagem → Task 10. ✓
- YAGNI (sem odds auto, sem mexer em gols/escanteios) → respeitado (nenhuma task toca). ✓

**Type consistency:** `escopo_historico` (str), `league_id` (int|None), `player_mu_from_games(...)→{mu,raw_rate,shrunk,n}|None`, `filter_games_by_scope(games,escopo,entity_team_id)`, `games_before_target(history_desc,target_event_id)→list crescente`, `pool_targets(...)→(targets,conceded_pg,league_avg)`, `score_targets(...)→(preds,actuals)`, `baseline_for(market,league_id)→float` — consistentes entre tasks. ✓

**Placeholders:** os números de baseline/veredito da Task 10 são DADOS medidos em runtime (não placeholders de código); todo o resto tem código completo. ✓

**Risco conhecido:** `windowed_rate` faz `g[stat_field]` (KeyError se faltar o campo numa linha de histórico) — comportamento já existente na produção, não introduzido aqui; as formas reais do BSD (spike) trazem o campo em todas as linhas de jogador.
