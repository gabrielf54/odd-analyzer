# Minutos Esperados (parar de assumir 90) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Estimar minutos esperados por jogador (média recente) e escalar o mu por eles, em produção e no backtest, e re-validar a calibração de seleção com minutos ESTIMADOS → liberar money-ready os mercados que passarem o crivo.

**Architecture:** Helper `expected_minutes(games)` em assemble.py reusa `windowed_rate` (média de `minutes_played` na janela w5/w3/w10). `entity_taxa` (produção) e `score_targets` (backtest) passam esse valor como `minutos_esperados` à conta pura `player_mu_from_games` (que já o aceita), substituindo o 90 chumbado. Re-validação roda o backtest e o veredito por mercado vira um status na UI.

**Tech Stack:** Python 3.14, pytest, stdlib. Sem libs novas. Fakes nos testes (sem rede).

**Spec:** [../specs/2026-06-03-minutos-esperados-design.md](../specs/2026-06-03-minutos-esperados-design.md)

**Rodar a suíte:** `.venv\Scripts\python.exe -m pytest -q`

**🚫 GIT SAFETY (todo subagente):** só `git add/commit/diff/log/status`. NUNCA `checkout/switch/reset/branch/stash/cherry-pick/restore/merge/rebase`. O controlador verifica a branch após cada commit. Commit trailer (linha em branco, depois): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Princípio:** NÃO re-tunar priors da taxa. A mudança é só escalar o mu por minutos estimados.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/odd_analyzer/model/assemble.py` | `expected_minutes(games)` — média de minutos na janela (reusa windowed_rate) | modificar |
| `src/odd_analyzer/providers/stats.py` | `entity_taxa` usa minutos estimados (não 90) | modificar |
| `src/odd_analyzer/backtest/run_national_backtest.py` | `score_targets` usa minutos estimados (não 90) | modificar |
| `app/streamlit_app.py` | status money-ready/paper por mercado no caption | modificar |
| `docs/ROADMAP.md` | veredito da re-validação com minutos estimados | modificar |
| `tests/test_assemble.py` | `expected_minutes` | modificar |
| `tests/test_stats_provider.py` | `entity_taxa` escala por minutos + reporta estimado | modificar |
| `tests/test_collect_national.py` | `score_targets` reflete minutos estimados | modificar |

---

## Task 1: `expected_minutes` em assemble.py

**Files:**
- Modify: `src/odd_analyzer/model/assemble.py`
- Test: `tests/test_assemble.py`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `tests/test_assemble.py`:

```python
from odd_analyzer.model.assemble import expected_minutes


def test_expected_minutes_media_da_janela():
    # 10 jogos, todos 45 min → média 45 (w5 pega os 5 últimos, todos 45)
    games = [{"minutes_played": 45} for _ in range(10)]
    assert expected_minutes(games) == 45.0


def test_expected_minutes_usa_w5_recente():
    # ordem crescente (recente no fim): 5 antigos com 30, 5 recentes com 90.
    # w5 = média dos 5 recentes = 90.
    games = [{"minutes_played": 30} for _ in range(5)] + [{"minutes_played": 90} for _ in range(5)]
    assert expected_minutes(games) == 90.0


def test_expected_minutes_vazio_retorna_none():
    assert expected_minutes([]) is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_assemble.py -q`
Expected: FAIL — `ImportError: cannot import name 'expected_minutes'`.

- [ ] **Step 3: Implementar**

Adicionar ao fim de `src/odd_analyzer/model/assemble.py`:

```python
def expected_minutes(games: list[dict]) -> float | None:
    """Minutos esperados = média de minutes_played na janela recente (mesma seleção
    w5/w3/w10 que a taxa usa). Reusa windowed_rate com minutes_field=None (média por-jogo).
    None se não há jogos. Captura rodízio: titular fixo ~88, rodado ~55."""
    rates = windowed_rate(games, "minutes_played")
    w5, w3, w10 = rates.get("w5"), rates.get("w3"), rates.get("w10")
    return w5 if w5 is not None else (w3 if w3 is not None else w10)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_assemble.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/assemble.py tests/test_assemble.py
git commit -m "feat: expected_minutes (media recente de minutos na janela)"
```

---

## Task 2: `entity_taxa` usa minutos estimados (produção)

**Files:**
- Modify: `src/odd_analyzer/providers/stats.py`
- Test: `tests/test_stats_provider.py`

Hoje `entity_taxa` chama `player_mu_from_games(..., minutos_esperados=90.0)` e retorna `"minutos_esperados": 90.0`. Trocar por minutos estimados via `expected_minutes(games)`, com fallback 90 se None/0.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `tests/test_stats_provider.py`:

```python
def test_entity_taxa_escala_mu_por_minutos_estimados():
    # mesma taxa por jogo (2 tackles/jogo), mas um histórico de 90 min/jogo e outro de 45.
    cheio = [{"event_id": 100+i, "team_id": 1, "total_tackle": 2, "minutes_played": 90} for i in range(10)]
    meio  = [{"event_id": 100+i, "team_id": 1, "total_tackle": 2, "minutes_played": 45} for i in range(10)]
    ctx = {"event": {"home_team": {"id": "1"}, "away_team": {"id": "2"}},
           "is_home": True, "entity_team_id": "1", "league_avg_conceded": 16.0}
    t90 = BSDStatsProvider(_FakeClient(cheio)).entity_taxa("p1", MARKETS["desarmes"], ctx)
    t45 = BSDStatsProvider(_FakeClient(meio)).entity_taxa("p1", MARKETS["desarmes"], ctx)
    assert t90 is not None and t45 is not None
    # 45 min reporta ~45 esperados (não 90) e mu menor (escala por minutos)
    assert abs(t45["minutos_esperados"] - 45.0) < 1e-9
    assert abs(t90["minutos_esperados"] - 90.0) < 1e-9
    assert t45["mu"] < t90["mu"]
    # escala ~linear: mu(45) ≈ mu(90) * 45/90 (per-90 rate idêntica nos dois)
    assert abs(t45["mu"] - t90["mu"] * 0.5) < 1e-6
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py -q`
Expected: FAIL — hoje ambos retornam `minutos_esperados=90.0` e o mesmo mu (assert `t45["minutos_esperados"]≈45` quebra).

- [ ] **Step 3: Implementar**

Em `src/odd_analyzer/providers/stats.py`:

(a) Adicionar `expected_minutes` ao import de assemble (linha ~11):
```python
from odd_analyzer.model.assemble import (
    windowed_rate, assemble_mu, filter_games_by_scope, player_mu_from_games, expected_minutes,
)
```

(b) Dentro de `entity_taxa`, no trecho que monta o mu, trocar o `minutos_esperados=90.0` da chamada e o `"minutos_esperados": 90.0` do return. O bloco passa a ser (a partir do cálculo de `ha_mult`):
```python
        ha_mult = home_away_multiplier(is_home, self.HOME_FACTOR, self.AWAY_FACTOR)
        minutos_esperados = expected_minutes(games) or 90.0

        calc = player_mu_from_games(
            games, stat_field=market.stat_field, prior_rate=market.prior_rate,
            prior_strength=market.prior_strength, opp_mult=opp_mult, ha_mult=ha_mult,
            minutos_esperados=minutos_esperados)
        if calc is None:
            return None
        xi_confirmado = (str(entity_id) in xi_team_ids) if xi_team_ids else True
        n = calc["n"]
        incerteza = "alta" if n < 5 else ("media" if n < 12 else "baixa")
        concedido = f"{opp_conceded:.1f}" if opp_conceded is not None else "n/d (neutro)"
        return {
            "mu": calc["mu"], "minutos_esperados": minutos_esperados,
            "xi_confirmado": xi_confirmado, "amostra_jogos": n,
            "concedido_adversario": concedido, "incerteza": incerteza,
        }
```
(Não mexer no resto de entity_taxa — o topo, o filtro de escopo, o opp_mult.)

- [ ] **Step 4: Rodar e ver passar (inclui regressão)**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py tests/test_pipeline.py tests/test_runner.py -q`
Expected: PASS — o teste novo passa; os antigos também (fixtures com `minutes_played=90` → `expected_minutes=90` → mu e `minutos_esperados` idênticos ao de antes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/stats.py tests/test_stats_provider.py
git commit -m "feat: entity_taxa escala mu por minutos estimados (nao 90 chumbado)"
```

---

## Task 3: `score_targets` usa minutos estimados (backtest)

**Files:**
- Modify: `src/odd_analyzer/backtest/run_national_backtest.py`
- Test: `tests/test_collect_national.py`

`score_targets` chama `player_mu_from_games(older, ...)` (default 90). Trocar por minutos estimados de `older`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `tests/test_collect_national.py`:

```python
def test_score_targets_reflete_minutos_estimados():
    # mesmo alvo/atual; histórico do jogador 10 com minutos diferentes (90 vs 45),
    # mesma contagem por jogo → pred do over 1.5 deve ser MENOR com 45 min.
    class _Cli:
        def __init__(self, mins): self._m = mins
        def events(self, league_id, status, limit):
            return {"results": [{"id": 900, "home_team_id": 1, "away_team_id": 2,
                                 "event_date": "2026-03-01"}]}
        def event_player_stats(self, eid):
            return {"player_stats": [
                {"player_id": 10, "team_id": 1, "minutes_played": 90, "total_tackle": 2},
                {"player_id": 20, "team_id": 2, "minutes_played": 90, "total_tackle": 1},
            ]}
        def player_stats(self, pid):
            return {"results": [
                {"event_id": 900, "team_id": 1, "total_tackle": 2, "minutes_played": 90},
                {"event_id": 803, "team_id": 1, "total_tackle": 3, "minutes_played": self._m},
                {"event_id": 802, "team_id": 1, "total_tackle": 3, "minutes_played": self._m},
                {"event_id": 801, "team_id": 1, "total_tackle": 3, "minutes_played": self._m},
            ]}
        def event_stats(self, eid):
            return {"stats": {}}

    def pred_o15(mins):
        cli = _Cli(mins)
        targets, conceded, lavg = pool_targets(cli, leagues=(64,), n_per_league=10,
                                               stat_field="total_tackle", include_friendlies=False)
        preds, _ = score_targets(cli, targets, conceded, lavg, MARKETS["desarmes"], escopo="selecao")
        return preds[1.5][0]

    p90 = pred_o15(90)
    p45 = pred_o15(45)
    assert p45 < p90  # menos minutos esperados → mu menor → prob menor
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: FAIL — hoje score_targets usa 90 fixo → p45 == p90.

- [ ] **Step 3: Implementar**

Em `src/odd_analyzer/backtest/run_national_backtest.py`:

(a) Adicionar `expected_minutes` ao import de assemble:
```python
from odd_analyzer.model.assemble import filter_games_by_scope, player_mu_from_games, expected_minutes
```

(b) Dentro de `score_targets`, no laço, trocar o trecho que chama `player_mu_from_games`. Hoje é:
```python
            calc = player_mu_from_games(
                older, stat_field=market.stat_field, prior_rate=market.prior_rate,
                prior_strength=market.prior_strength, opp_mult=opp_mult, ha_mult=ha_mult)
```
Passa a ser:
```python
            min_esp = expected_minutes(older) or 90.0
            calc = player_mu_from_games(
                older, stat_field=market.stat_field, prior_rate=market.prior_rate,
                prior_strength=market.prior_strength, opp_mult=opp_mult, ha_mult=ha_mult,
                minutos_esperados=min_esp)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_national.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/run_national_backtest.py tests/test_collect_national.py
git commit -m "feat: score_targets usa minutos estimados (espelha producao)"
```

---

## Task 4: Status money-ready/paper por mercado no front

**Files:**
- Modify: `app/streamlit_app.py`
- Test: parse + `tests/test_front_smoke.py`

O caption ⚠️ fixo vira condicional a um status por mercado (`COPA_STATUS`). Default = "paper" (os 3); a Task 5 promove pra "ready" os que passarem a re-validação.

- [ ] **Step 1: Adicionar o mecanismo de status + caption condicional**

Em `app/streamlit_app.py`, perto das constantes `MERCADOS_JOGADOR`/`MERCADOS_PARTIDA` (topo do arquivo), adicionar:
```python
# Status de calibração na Copa por mercado de jogador (atualizado pela re-validação de minutos):
# "ready" = passou o crivo (ECE<0.08 + BrierSkill>0) com minutos estimados → dinheiro liberado;
# "paper" = ainda não passou → paper/observação.
COPA_STATUS = {"sot": "paper", "finalizacoes": "paper", "desarmes": "paper"}
```

E em `_render_mercado`, substituir a linha do `st.caption("⚠️ Calibração de SELEÇÃO ...")` (inserida antes) por:
```python
    _status = COPA_STATUS.get(market_key, "paper")
    if _status == "ready":
        st.caption("✅ Calibração de seleção validada com minutos esperados (ECE<0.08, BrierSkill>0). "
                   "Mercado liberado para dinheiro na Copa.")
    else:
        st.caption("⚠️ Calibração de seleção: este mercado segue em **paper/observação** na Copa "
                   "(não dinheiro real) até passar o crivo com minutos estimados. Ver ROADMAP.")
```

- [ ] **Step 2: Verificar parse + smoke**

Run: `.venv\Scripts\python.exe -c "import ast; ast.parse(open('app/streamlit_app.py', encoding='utf-8').read()); print('ok')"` → `ok`
Run: `.venv\Scripts\python.exe -m pytest tests/test_front_smoke.py -q` → PASS

- [ ] **Step 3: Commit**

```bash
git add app/streamlit_app.py
git commit -m "feat: status money-ready/paper por mercado no caption do front"
```

---

## Task 5: DELIVERABLE — re-validar com minutos estimados, veredito, promover status

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `app/streamlit_app.py` (valores de `COPA_STATUS`)

Passos de execução real (produzem dados/veredito, não código).

- [ ] **Step 1: Re-rodar o backtest (agora minutos estimados) nos 3 mercados**

```
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_national_backtest sot 8
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_national_backtest finalizacoes 8
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_national_backtest desarmes 8
```
Coletar, do modo **selecao/com-amistoso**, ECE + BrierSkill por linha. Comparar com o teto (minutos reais, do diagnóstico) e o piso (90, já no ROADMAP).

- [ ] **Step 2: Veredito por mercado + promover status**

Critério: mercado passa se **ECE<0.08 + BrierSkill>0** nas linhas úteis (o1.5 e/ou o2.5). Para cada mercado que passar, mudar seu valor em `COPA_STATUS` (app/streamlit_app.py) de `"paper"` para `"ready"`. Os que não passarem ficam `"paper"`.

- [ ] **Step 3: Registrar no ROADMAP**

Adicionar à seção "Calibração — população de SELEÇÃO (Copa)" uma subseção **"Re-validação com minutos ESTIMADOS (2026-06-03)"** com a tabela (mercado | linha | ECE_estimado | BrierSkill_estimado) ao lado das colunas de referência (90 e real) e o veredito por mercado (money-ready vs paper). Frase honesta: minutos estimados ficam entre o piso (90) e o teto (reais); o que passar o crivo carrega dinheiro na Copa.

- [ ] **Step 4: Suíte cheia + commit**

Run: `.venv\Scripts\python.exe -m pytest -q` → PASS

```bash
git add docs/ROADMAP.md app/streamlit_app.py
git commit -m "feat: re-validacao com minutos estimados — veredito money-ready por mercado (Copa)"
```

---

## Self-Review (controlador)

**Spec coverage:**
- `expected_minutes` (estimador, janela w5/w3/w10) → Task 1. ✓
- mu escala por minutos em produção → Task 2. ✓
- backtest usa minutos estimados (não reais, não 90) → Task 3. ✓
- status money-ready/paper no front → Task 4 (mecanismo) + Task 5 (valores). ✓
- re-validação + veredito honesto + critério ECE<0.08/BS>0 → Task 5. ✓
- NÃO re-tunar priors → nenhuma task toca prior_rate/prior_strength. ✓
- conserta clube também (efeito colateral) → Task 2 muda entity_taxa pra todos os mercados de jogador. ✓
- YAGNI (sem lineup-aware, sem teto/piso) → estimador é média pura. ✓

**Type consistency:** `expected_minutes(games) -> float|None`; chamadores usam `expected_minutes(x) or 90.0` (fallback). `player_mu_from_games(..., minutos_esperados=...)` já existe com esse nome. Return de `entity_taxa` mantém as 6 chaves. ✓

**Placeholders:** os números/veredito da Task 5 são dados medidos em runtime, não placeholders de código. Resto tem código completo. ✓

**Risco:** `windowed_rate(games, "minutes_played")` faz `g["minutes_played"]` (KeyError se faltar) — as formas reais do BSD trazem o campo; os fakes dos testes também. Consistente com o uso já existente de windowed_rate.
