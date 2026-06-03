# Motor + Calibração Validados (pré-front) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o `mu` numericamente correto (forma recente + per-90 + baseline de concessão medido) e **medir honesto** se o modelo de contagem calibra no dado vivo do BSD, construindo o modelo de partida só se a contagem prestar, e fechando a dívida de operação que destrava o front.

**Architecture:** Quatro fases sequenciais. A (consertar entradas do `mu`) → B (calibrar no BSD, gate de veredito) → C (modelo de partida, **condicional** ao veredito de B) → D (dívida de operação). Reaproveita o motor puro existente (`score_records`, `calibration.py`, `assemble_mu`, `shrink_rate`); só troca a origem dos dados (BSD em vez de API-Football) e corrige duas falhas de `windowed_rate`.

**Tech Stack:** Python 3 (`.venv`), pytest, BSD/Bzzoiro API (`BSDClient`), Supabase (persistência). Sem libs novas.

**Spec:** [../specs/2026-06-03-motor-calibracao-validados-pre-front-design.md](../specs/2026-06-03-motor-calibracao-validados-pre-front-design.md)

**Rodar testes:** `.venv\Scripts\python.exe -m pytest -q`

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `src/odd_analyzer/model/assemble.py` | Modify | `windowed_rate`: corrigir ordenação (recente) + opção per-90 por minutos |
| `src/odd_analyzer/providers/stats.py` | Modify | `entity_taxa`: ordenar histórico + passar `minutes_field` |
| `scripts/measure_concede_baseline.py` | Create | League-sweep: mede concessão média real por mercado no BSD |
| `src/odd_analyzer/model/markets.py` | Modify | Substituir `concede_baseline` estático pelos valores medidos |
| `src/odd_analyzer/backtest/collect_bsd.py` | Create | Coletor: finished events → records `(fid,pid,tid,min,stat)` + meta/conceded/factors |
| `src/odd_analyzer/backtest/run_bsd_backtest.py` | Create | Roda `collect_bsd` → `score_records` → `calibration` por mercado; imprime veredito |
| `src/odd_analyzer/model/match_model.py` | Create | **(Fase C, condicional)** Poisson bivariado + Dixon-Coles → 1X2 + totais de gols |
| `src/odd_analyzer/pipeline.py` | Modify | **(Fase C)** dispatch `kind="partida_*"` → match_model |
| `src/odd_analyzer/store/repo.py` | Modify | **(Fase D)** persistência crosswalk + snapshot de fechamento (CLV forward) |
| `src/odd_analyzer/store/schema.sql` | Modify | **(Fase D)** refletir mudanças de crosswalk |
| `docs/ROADMAP.md` | Modify | Gravar métricas + veredito de calibração (Fase B) |
| `tests/test_assemble.py` | Modify | Testes de ordenação + per-90 |
| `tests/test_collect_bsd.py` | Create | Testes do coletor com `_get` fake |
| `tests/test_match_model.py` | Create | **(Fase C)** testes do match_model |
| `tests/test_repo.py` | Modify | **(Fase D)** testes de crosswalk + fechamento |

---

# FASE A — Consertar o número

### Task 1: `windowed_rate` — ordenação recente + per-90 por minutos

**Files:**
- Modify: `src/odd_analyzer/model/assemble.py:8-37`
- Test: `tests/test_assemble.py`

Contexto: o BSD entrega `/players/{id}/stats/` **mais-recente-primeiro**; `windowed_rate` faz `source[-n:]` assumindo ordem crescente → hoje pega os jogos mais ANTIGOS. E faz média por-jogo, ignorando `minutes_played`. Esta task adiciona um parâmetro `minutes_field` (None = média por-jogo, como hoje, para nível-time; preenchido = per-90 ponderado) e **não** muda a semântica de ordem da função (continua "crescente = `[-n:]` é o mais recente"); a ordenação correta dos dados do BSD é responsabilidade do chamador (Task 2).

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_assemble.py — adicionar
from odd_analyzer.model.assemble import windowed_rate

def test_windowed_rate_per90_pondera_por_minutos():
    # 2 jogos: 90min/2 chutes e 30min/0 chutes. Per-jogo ingênuo = 1.0/jogo.
    # Per-90 correto = (2+0)/(90+30)*90 = 1.5/90.
    games = [
        {"shots_on_target": 2, "minutes_played": 90},
        {"shots_on_target": 0, "minutes_played": 30},
    ]
    r = windowed_rate(games, "shots_on_target", windows=(3,), minutes_field="minutes_played")
    assert abs(r["w3"] - 1.5) < 1e-9

def test_windowed_rate_per90_minutos_zero_retorna_none():
    games = [{"shots_on_target": 0, "minutes_played": 0}]
    r = windowed_rate(games, "shots_on_target", windows=(3,), minutes_field="minutes_played")
    assert r["w3"] is None

def test_windowed_rate_sem_minutes_field_mantem_media_por_jogo():
    # nível-time (escanteios): sem minutos, média por-jogo preservada.
    games = [{"corners": 4}, {"corners": 6}]
    r = windowed_rate(games, "corners", windows=(3,))
    assert abs(r["w3"] - 5.0) < 1e-9
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_assemble.py -k per90 -v`
Expected: FAIL (`windowed_rate() got an unexpected keyword argument 'minutes_field'`)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/model/assemble.py — substituir windowed_rate inteira
def windowed_rate(
    games: list[dict],
    stat_field: str,
    windows: tuple = (3, 5, 10),
    mando: str | None = None,
    minutes_field: str | None = None,
) -> dict:
    """Taxa do stat_field nas últimas N partidas (janelas 3/5/10).

    `games` deve estar em ordem CRONOLÓGICA CRESCENTE (mais antigo primeiro);
    a janela `[-n:]` pega as N mais RECENTES. O chamador é responsável por ordenar.

    minutes_field:
      None  → média por-jogo (nível-time: um time sempre joga ~90).
      str   → per-90 ponderado por minutos: Σstat / Σmin × 90 (nível-jogador).
              Σmin == 0 na janela → None.
    """
    source = games
    if mando is not None:
        source = [g for g in games if g.get("mando") == mando]

    result: dict = {}
    for n in windows:
        window = source[-n:] if len(source) >= 1 else []
        if not window:
            result[f"w{n}"] = None
        elif minutes_field is None:
            vals = [g[stat_field] for g in window]
            result[f"w{n}"] = sum(vals) / len(vals)
        else:
            tot_stat = sum(g[stat_field] for g in window)
            tot_min = sum((g.get(minutes_field) or 0) for g in window)
            result[f"w{n}"] = (tot_stat / tot_min * 90.0) if tot_min > 0 else None
    return result
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_assemble.py -v`
Expected: PASS (todos, incluindo os antigos que não passam `minutes_field`)

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/assemble.py tests/test_assemble.py
git commit -m "feat: windowed_rate per-90 ponderado por minutos (opt-in via minutes_field)"
```

---

### Task 2: `entity_taxa` — ordenar histórico recente + usar per-90

**Files:**
- Modify: `src/odd_analyzer/providers/stats.py:109-119`
- Test: `tests/test_stats_provider.py` (criar se não existir)

Contexto: `entity_taxa` passa `raw.get("results", [])` direto pro `windowed_rate`. Como o BSD vem decrescente, precisa **reverter** para crescente (mais antigo→recente) antes da janela, e passar `minutes_field="minutes_played"` para ativar o per-90 da Task 1.

> **Verificação de execução (fazer ANTES de codar):** rodar `.venv\Scripts\python.exe -c "from odd_analyzer.bsd.client import BSDClient; from odd_analyzer.config import get_required; c=BSDClient(get_required('BZZOIRO_API_KEY')); r=c.player_stats(1867)['results']; print([(g['event_id']) for g in r[:5]])"` e cruzar com as datas via `c.get_event(id)['event_date']` dos 2 primeiros. Confirmar que `results[0]` é o mais recente (decrescente). Se for crescente, NÃO reverter (ajustar o teste). O teste abaixo trava a expectativa "BSD decrescente → reverter".

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_stats_provider.py
from odd_analyzer.providers.stats import BSDStatsProvider
from odd_analyzer.model.markets import MARKETS

class _FakeClient:
    def __init__(self, hist): self._hist = hist
    def player_stats(self, pid): return {"results": self._hist}
    def events(self, **kw): return {"results": []}      # sem matchup (neutro)
    def event_stats(self, eid): return {"stats": {}}

def test_entity_taxa_usa_jogos_recentes_e_per90():
    # 10 jogos: os 5 MAIS RECENTES (event_id alto) com 1 tackle/90; os 5 antigos com 5/90.
    # BSD ordem decrescente (recente primeiro). w5 deve refletir os RECENTES (~1/90), não os antigos.
    recentes = [{"event_id": 100+i, "total_tackle": 1, "minutes_played": 90} for i in range(5)]
    antigos  = [{"event_id": i, "total_tackle": 5, "minutes_played": 90} for i in range(5)]
    hist = recentes + antigos        # decrescente: recentes primeiro
    prov = BSDStatsProvider(_FakeClient(hist))
    ctx = {"event": {"home_team": {"id": "1"}, "away_team": {"id": "2"}},
           "is_home": True, "entity_team_id": "1", "league_avg_conceded": 16.0}
    taxa = prov.entity_taxa("p1", MARKETS["desarmes"], ctx)
    # mu base ~ rate recente (1/90) com shrinkage; tem que ser claramente < o que daria a média antiga (5).
    assert taxa is not None
    assert taxa["mu"] < 3.0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py -v`
Expected: FAIL (mu alto, pois hoje pega os 5 jogos com 5 tackles)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/providers/stats.py — dentro de entity_taxa, substituir o bloco:
        games: list[dict] = raw.get("results", [])
        if not games:
            return None

        rates = windowed_rate(games, market.stat_field)
# POR:
        results: list[dict] = raw.get("results", [])
        if not results:
            return None
        # BSD entrega mais-recente-primeiro; windowed_rate espera crescente (recente no fim).
        games = list(reversed(results))

        rates = windowed_rate(games, market.stat_field, minutes_field="minutes_played")
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py tests/ -q`
Expected: PASS (suíte inteira verde)

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/stats.py tests/test_stats_provider.py
git commit -m "fix: entity_taxa usa forma recente (reverte BSD) + per-90 por minutos"
```

---

### Task 3: League-sweep do `concede_baseline`

**Files:**
- Create: `scripts/measure_concede_baseline.py`
- Modify: `src/odd_analyzer/model/markets.py:37,50,63,76` (campos `concede_baseline`)

Contexto: `concede_baseline` é prior chutado (denominador do `opponent_multiplier`). Esta task mede a concessão média REAL por mercado no BSD e substitui. O valor é produzido pela execução; o Step 4 instrui exatamente como aplicar.

- [ ] **Step 1: Escrever o script de medição**

```python
# scripts/measure_concede_baseline.py
"""Mede a concessão média real por mercado no BSD (league-sweep) para substituir
os concede_baseline estáticos de markets.py. Lê N jogos finalizados de uma liga,
soma o que cada time CONCEDE no eixo (stat do adversário) e tira a média.

Uso: .venv\\Scripts\\python.exe scripts\\measure_concede_baseline.py [league_id] [n]
"""
import sys
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required

# (label, campo de TIME no /events/{id}/stats/)
EIXOS = [
    ("sot (shots_on_target)", "shots_on_target"),
    ("finalizacoes (total_shots)", "total_shots"),
    ("desarmes (total_tackles)", "total_tackles"),
    ("escanteios (corner_kicks)", "corner_kicks"),
]

def main():
    league = int(sys.argv[1]) if len(sys.argv) > 1 else 9
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 80
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    evs = c.events(league_id=league, status="finished", limit=n).get("results", [])[:n]
    soma = {campo: 0.0 for _, campo in EIXOS}
    cont = {campo: 0 for _, campo in EIXOS}
    for ev in evs:
        try:
            stats = c.event_stats(ev["id"]).get("stats", {})
        except Exception:
            continue
        home, away = stats.get("home", {}), stats.get("away", {})
        for _, campo in EIXOS:
            # o que o time da CASA concede = o que o visitante PRODUZ (e vice-versa)
            for produtor in (home, away):
                v = produtor.get(campo)
                if v is not None:
                    soma[campo] += float(v); cont[campo] += 1
    print(f"liga={league} jogos={len(evs)}")
    print("Substituir em markets.py concede_baseline:")
    for label, campo in EIXOS:
        media = soma[campo] / cont[campo] if cont[campo] else 0.0
        print(f"  {label:<28} concede_baseline = {media:.2f}  (n={cont[campo]})")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Rodar a medição**

Run: `.venv\Scripts\python.exe scripts\measure_concede_baseline.py 9 80`
Expected: imprime, por mercado, `concede_baseline = <valor>` (ex.: `sot ... = 3.9`). **Anotar os 4 valores.**

- [ ] **Step 3: Aplicar os valores medidos em `markets.py`**

Substituir os 4 literais `concede_baseline=` em `src/odd_analyzer/model/markets.py` pelos valores impressos no Step 2 (sot→linha 37, finalizacoes→50, desarmes→63, escanteios→76). Adicionar comentário ` # league-sweep BSD liga 9, N jogos (2026-06-03)` em cada um. Manter `gols`/`vitoria` como estão (tratados na Fase C).

Exemplo (valores ilustrativos — usar os reais):
```python
        concede_baseline=3.90,  # league-sweep BSD liga 9, 80 jogos (2026-06-03)
```

- [ ] **Step 4: Rodar a suíte (não pode quebrar)**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: PASS (mudança de constante; se algum teste fixava o baseline antigo, atualizar para o novo valor)

- [ ] **Step 5: Commit**

```bash
git add scripts/measure_concede_baseline.py src/odd_analyzer/model/markets.py
git commit -m "feat: concede_baseline medido por league-sweep no BSD (substitui prior chutado)"
```

---

# FASE B — Medir honesto (o gate)

### Task 4: Coletor BSD para calibração (mercados de jogador)

**Files:**
- Create: `src/odd_analyzer/backtest/collect_bsd.py`
- Test: `tests/test_collect_bsd.py`

Contexto: `score_records` (puro) já faz leave-one-out per-90 + ajustes e espera `meta {fid:(home,away)}`, `records [(fid,pid,tid,min,stat)]`, `conceded_pg`, `league_avg`, `home_factor`, `away_factor`. O coletor produz exatamente isso a partir de `/events/?status=finished` + `/events/{id}/player-stats/`, para um `stat_field` qualquer (sot/finalizacoes/desarmes). A reconstrução da história é dentro-da-amostra coletada (igual ao backtest atual de API-Football).

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_collect_bsd.py
from odd_analyzer.backtest.collect_bsd import collect_bsd

class _FakeBSD:
    """2 jogos finalizados, 2 jogadores por time."""
    def events(self, **kw):
        return {"results": [
            {"id": 1, "home_team_id": 10, "away_team_id": 20},
            {"id": 2, "home_team_id": 10, "away_team_id": 20},
        ]}
    def event_player_stats(self, eid):
        # time 10 faz 3 SOT, time 20 faz 1 SOT, em cada jogo
        return {"player_stats": [
            {"player_id": 100, "team_id": 10, "minutes_played": 90, "shots_on_target": 2},
            {"player_id": 101, "team_id": 10, "minutes_played": 90, "shots_on_target": 1},
            {"player_id": 200, "team_id": 20, "minutes_played": 90, "shots_on_target": 1},
            {"player_id": 201, "team_id": 20, "minutes_played": 0,  "shots_on_target": 0},  # não jogou
        ]}

def test_collect_bsd_monta_records_e_conceded():
    meta, records, conceded_pg, league_avg, hf, af = collect_bsd(
        _FakeBSD(), league_id=9, n_events=2, stat_field="shots_on_target")
    assert meta == {1: (10, 20), 2: (10, 20)}
    # jogador 201 com 0 minutos é descartado; os outros 3 entram em 2 jogos = 6 records
    assert len(records) == 6
    # time 20 concede o que o time 10 produz (3 SOT/jogo)
    assert abs(conceded_pg[20] - 3.0) < 1e-9
    assert abs(conceded_pg[10] - 1.0) < 1e-9
    assert hf > 0 and af > 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_bsd.py -v`
Expected: FAIL (`No module named ...collect_bsd`)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/backtest/collect_bsd.py
"""Coletor de dados de calibração no BSD (substitui o coletor API-Football).
Produz a MESMA forma que score_records consome, para um stat_field de jogador.

Forma real (ver docs/apis/bsd-bzzoiro/examples/):
  /events/?league_id=&status=finished&limit=N -> {results:[{id, home_team_id, away_team_id, ...}]}
  /events/{id}/player-stats/ -> {player_stats:[{player_id, team_id, minutes_played, <stat_field>}]}
"""

def collect_bsd(client, league_id, n_events, stat_field):
    """Retorna (meta, records, conceded_pg, league_avg, home_factor, away_factor).
    meta {event_id:(home_id,away_id)}; records [(eid,pid,tid,min,stat)] de quem jogou."""
    evs = client.events(league_id=league_id, status="finished", limit=n_events)
    results = evs.get("results", []) if isinstance(evs, dict) else []
    meta = {}
    records = []
    t_against, t_games = {}, {}
    home_for = away_for = home_games = away_games = 0
    for ev in results[:n_events]:
        eid = ev["id"]
        home_id, away_id = ev.get("home_team_id"), ev.get("away_team_id")
        if home_id is None or away_id is None:
            continue
        meta[eid] = (home_id, away_id)
        try:
            ps = client.event_player_stats(eid).get("player_stats", [])
        except Exception:
            del meta[eid]
            continue
        stat_by_team = {}
        for row in ps:
            minutes = row.get("minutes_played") or 0
            if minutes <= 0:
                continue  # não entrou em campo
            tid = row.get("team_id")
            val = row.get(stat_field) or 0
            records.append((eid, row.get("player_id"), tid, minutes, val))
            stat_by_team[tid] = stat_by_team.get(tid, 0) + val
        if home_id in stat_by_team and away_id in stat_by_team:
            t_against[home_id] = t_against.get(home_id, 0) + stat_by_team[away_id]
            t_against[away_id] = t_against.get(away_id, 0) + stat_by_team[home_id]
            t_games[home_id] = t_games.get(home_id, 0) + 1
            t_games[away_id] = t_games.get(away_id, 0) + 1
            home_for += stat_by_team[home_id]; away_for += stat_by_team[away_id]
            home_games += 1; away_games += 1
    conceded_pg = {t: t_against[t] / t_games[t] for t in t_against}
    league_avg = (sum(conceded_pg.values()) / len(conceded_pg)) if conceded_pg else 0.0
    if home_games and away_games:
        ah, aa = home_for / home_games, away_for / away_games
        mid = (ah + aa) / 2 or 1.0
        home_factor, away_factor = ah / mid, aa / mid
    else:
        home_factor = away_factor = 1.0
    return meta, records, conceded_pg, league_avg, home_factor, away_factor
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_bsd.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/collect_bsd.py tests/test_collect_bsd.py
git commit -m "feat: coletor BSD de calibracao (records per-90 por stat_field)"
```

---

### Task 5: Runner de calibração no BSD + veredito

**Files:**
- Create: `src/odd_analyzer/backtest/run_bsd_backtest.py`
- Modify: `docs/ROADMAP.md` (gravar resultado)

Contexto: liga `collect_bsd` → `score_records` (reusado) → `calibration` por mercado de jogador, com os parâmetros do `MarketSpec` (não os de SOT hard-coded). Imprime Brier/LogLoss/ECE/BrierSkill/reliability por linha. É o gate da meta.

- [ ] **Step 1: Escrever o runner**

```python
# src/odd_analyzer/backtest/run_bsd_backtest.py
"""Calibração no dado vivo do BSD, por mercado de contagem de JOGADOR.
Reusa score_records (puro) — só troca a fonte (BSD em vez de API-Football).

Uso: .venv\\Scripts\\python.exe -m odd_analyzer.backtest.run_bsd_backtest <market_key> [league_id] [n_events]
  ex.: ... run_bsd_backtest desarmes 9 120
"""
import sys
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.config import get_required
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.backtest.collect_bsd import collect_bsd
from odd_analyzer.backtest.run_backtest import score_records
from odd_analyzer.backtest.calibration import (
    brier_score, log_loss, expected_calibration_error, brier_skill_score, reliability_bins,
)

def run(market_key, league_id=9, n_events=120):
    market = MARKETS[market_key]
    if market.nivel != "jogador":
        raise SystemExit(f"{market_key} não é mercado de jogador (use o caminho de partida).")
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    meta, records, conceded_pg, league_avg, hf, af = collect_bsd(
        c, league_id, n_events, market.stat_field)
    print(f"mercado={market_key} ({market.stat_field}) | jogos={len(meta)} | "
          f"records={len(records)} | concedido/jogo médio={league_avg:.2f} | mando {hf:.2f}/{af:.2f}")
    preds, actuals = score_records(
        meta, records, conceded_pg, league_avg, hf, af,
        lines=market.lines, prior_rate=market.prior_rate,
        prior_strength=market.prior_strength, nb_dispersion=market.nb_dispersion)
    for l in market.lines:
        if not preds[l]:
            print(f"\nover {l}: sem amostra"); continue
        base = sum(actuals[l]) / len(actuals[l])
        print(f"\n=== {market_key} over {l} | n={len(preds[l])} | freq real={base:.3f} ===")
        print(f"Brier {brier_score(preds[l], actuals[l]):.4f} | "
              f"LogLoss {log_loss(preds[l], actuals[l]):.4f} | "
              f"ECE {expected_calibration_error(preds[l], actuals[l]):.4f} | "
              f"BrierSkill {brier_skill_score(preds[l], actuals[l]):.3f}")
        for b in reliability_bins(preds[l], actuals[l]):
            print(f"  {b['bin']/10:.1f}-{(b['bin']+1)/10:.1f}: "
                  f"{b['mean_pred']:.3f}->{b['mean_actual']:.3f} (n={b['count']})")

def main():
    if len(sys.argv) < 2:
        raise SystemExit("uso: run_bsd_backtest <market_key> [league_id] [n_events]")
    run(sys.argv[1],
        int(sys.argv[2]) if len(sys.argv) > 2 else 9,
        int(sys.argv[3]) if len(sys.argv) > 3 else 120)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Rodar a calibração nos 3 mercados de jogador**

Run (um de cada vez; cache acelera reuso):
```
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_bsd_backtest desarmes 9 120
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_bsd_backtest sot 9 120
.venv\Scripts\python.exe -m odd_analyzer.backtest.run_bsd_backtest finalizacoes 9 120
```
Expected: para cada mercado/linha, Brier/LogLoss/ECE/BrierSkill + reliability. **Copiar a saída.**

- [ ] **Step 3: Gravar métricas + veredito honesto no ROADMAP**

Adicionar uma seção `## Calibração (Fase B, BSD, <data>)` em `docs/ROADMAP.md` com uma tabela `mercado | linha | n | Brier | ECE | BrierSkill | freq_real` preenchida com os números reais, e um **veredito escrito por mercado**: `presta` (BrierSkill>0 e ECE baixo), `não presta` (BrierSkill≤0), ou `amostra insuficiente` (n pequeno / bins vazios). Não maquiar.

- [ ] **Step 4: Commit**

```bash
git add src/odd_analyzer/backtest/run_bsd_backtest.py docs/ROADMAP.md
git commit -m "feat: calibracao no BSD por mercado de jogador + veredito no ROADMAP"
```

---

### Task 6: Calibração de escanteios (nível-time)

**Files:**
- Modify: `src/odd_analyzer/backtest/collect_bsd.py` (adicionar `collect_bsd_team`)
- Modify: `src/odd_analyzer/backtest/run_bsd_backtest.py` (ramo `nivel=="partida"`)
- Test: `tests/test_collect_bsd.py`

Contexto: escanteios é total-da-partida via `/events/{id}/stats/` (nível-time). O alvo de calibração é `P(total_corners > linha)` com `mu = corners(home) + corners(away)` estimado leave-one-out por time. Forma mais simples que o caso de jogador (sem minutos).

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_collect_bsd.py — adicionar
from odd_analyzer.backtest.collect_bsd import collect_bsd_team

class _FakeBSDTeam:
    def events(self, **kw):
        return {"results": [
            {"id": 1, "home_team_id": 10, "away_team_id": 20},
            {"id": 2, "home_team_id": 10, "away_team_id": 30},
        ]}
    def event_stats(self, eid):
        return {"stats": {"home": {"corner_kicks": 6}, "away": {"corner_kicks": 4}}}

def test_collect_bsd_team_totais_por_jogo():
    totais, by_team = collect_bsd_team(_FakeBSDTeam(), 9, 2, "corner_kicks")
    assert totais == [10, 10]                  # 6+4 em cada jogo
    assert by_team[10] == [6, 6]               # corners-for do time 10 nos 2 jogos
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_bsd.py -k team -v`
Expected: FAIL (`cannot import name 'collect_bsd_team'`)

- [ ] **Step 3: Implementar coletor de time + ramo no runner**

```python
# src/odd_analyzer/backtest/collect_bsd.py — adicionar
def collect_bsd_team(client, league_id, n_events, team_field):
    """Para mercado de partida (escanteios): retorna (totais_por_jogo, corners_for_por_time).
    totais = [home+away por jogo]; by_team {team_id: [valor-for em cada jogo]}."""
    evs = client.events(league_id=league_id, status="finished", limit=n_events)
    results = evs.get("results", []) if isinstance(evs, dict) else []
    totais, by_team = [], {}
    for ev in results[:n_events]:
        try:
            stats = client.event_stats(ev["id"]).get("stats", {})
        except Exception:
            continue
        h = stats.get("home", {}).get(team_field)
        a = stats.get("away", {}).get(team_field)
        if h is None or a is None:
            continue
        totais.append(float(h) + float(a))
        by_team.setdefault(ev["home_team_id"], []).append(float(h))
        by_team.setdefault(ev["away_team_id"], []).append(float(a))
    return totais, by_team
```

```python
# src/odd_analyzer/backtest/run_bsd_backtest.py — no run(), antes do ramo de jogador:
    if market.nivel == "partida":
        from odd_analyzer.backtest.collect_bsd import collect_bsd_team
        from odd_analyzer.model.sot_model import prob_over_line
        totais, _ = collect_bsd_team(c, league_id, n_events, market.stat_field
                                     if market.stat_field != "corners" else "corner_kicks")
        if not totais:
            raise SystemExit("sem amostra de totais")
        mu = sum(totais) / len(totais)   # baseline simples: média da liga (sem matchup no backtest)
        print(f"mercado={market_key} | jogos={len(totais)} | média total/jogo={mu:.2f}")
        for l in market.lines:
            preds = [prob_over_line(mu, l, r=market.nb_dispersion)] * len(totais)
            actuals = [1 if t > l else 0 for t in totais]
            base = sum(actuals) / len(actuals)
            print(f"\n=== {market_key} over {l} | n={len(totais)} | freq real={base:.3f} ===")
            print(f"Brier {brier_score(preds, actuals):.4f} | ECE {expected_calibration_error(preds, actuals):.4f} | "
                  f"BrierSkill {brier_skill_score(preds, actuals):.3f}")
        return
```

- [ ] **Step 4: Rodar e ver passar + calibrar escanteios**

Run: `.venv\Scripts\python.exe -m pytest tests/test_collect_bsd.py -q`
Expected: PASS
Run: `.venv\Scripts\python.exe -m odd_analyzer.backtest.run_bsd_backtest escanteios 9 120`
Expected: imprime calibração de escanteios. Acrescentar a linha no ROADMAP (Task 5 Step 3).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/ tests/test_collect_bsd.py docs/ROADMAP.md
git commit -m "feat: calibracao de escanteios (nivel-time) no BSD"
```

---

# FASE C — Modelo de partida (CONDICIONAL ao veredito de B)

> **Gate:** só executar a Fase C se a Fase B disser que pelo menos os mercados de contagem de jogador **prestam** (BrierSkill>0, ECE razoável). Se não prestarem, PARAR, reportar, e ajustar o modelo de contagem antes de qualquer coisa. Decisão documentada no ROADMAP.

### Task 7: `match_model.py` — Poisson bivariado + Dixon-Coles

**Files:**
- Create: `src/odd_analyzer/model/match_model.py`
- Test: `tests/test_match_model.py`

Contexto: a partir de `lambda_home` e `lambda_away` (gols esperados de cada time), derivar a matriz de placar (Poisson independente com correção Dixon-Coles para placares baixos) e dela extrair `P(1)`, `P(X)`, `P(2)` e `P(total > linha)`.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_match_model.py
from odd_analyzer.model.match_model import score_matrix, probs_1x2, prob_total_over

def test_probs_1x2_somam_um():
    m = score_matrix(1.5, 1.1)
    p = probs_1x2(m)
    assert abs(p["home"] + p["draw"] + p["away"] - 1.0) < 1e-6

def test_time_mais_forte_tem_maior_prob():
    m = score_matrix(2.2, 0.7)
    p = probs_1x2(m)
    assert p["home"] > p["away"]

def test_prob_total_over_monotona():
    m = score_matrix(1.6, 1.4)
    assert prob_total_over(m, 1.5) > prob_total_over(m, 2.5)

def test_total_over_entre_0_e_1():
    m = score_matrix(1.3, 1.2)
    assert 0.0 <= prob_total_over(m, 2.5) <= 1.0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_match_model.py -v`
Expected: FAIL (`No module named ...match_model`)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/model/match_model.py
"""Modelo de partida: Poisson bivariado com correção de Dixon-Coles para placares
baixos. score_matrix(lh, la) -> matriz P(i,j); probs_1x2 e prob_total_over derivam dela."""
import math

_MAX_GOLS = 10          # trunca a matriz (P de >10 gols é desprezível)
_RHO = -0.05            # correção Dixon-Coles (dependência em placares baixos; calibrar na Fase 4)

def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * lam ** k / math.factorial(k)

def _dc_tau(i: int, j: int, lh: float, la: float, rho: float) -> float:
    """Fator de correção Dixon-Coles para os 4 placares baixos (0-0,0-1,1-0,1-1)."""
    if i == 0 and j == 0:
        return 1.0 - lh * la * rho
    if i == 0 and j == 1:
        return 1.0 + lh * rho
    if i == 1 and j == 0:
        return 1.0 + la * rho
    if i == 1 and j == 1:
        return 1.0 - rho
    return 1.0

def score_matrix(lambda_home: float, lambda_away: float, rho: float = _RHO) -> list[list[float]]:
    """Matriz (MAX+1)x(MAX+1) de P(home=i, away=j), normalizada."""
    m = [[0.0] * (_MAX_GOLS + 1) for _ in range(_MAX_GOLS + 1)]
    total = 0.0
    for i in range(_MAX_GOLS + 1):
        for j in range(_MAX_GOLS + 1):
            p = (_poisson_pmf(i, lambda_home) * _poisson_pmf(j, lambda_away)
                 * _dc_tau(i, j, lambda_home, lambda_away, rho))
            p = max(p, 0.0)
            m[i][j] = p
            total += p
    if total > 0:
        for i in range(_MAX_GOLS + 1):
            for j in range(_MAX_GOLS + 1):
                m[i][j] /= total
    return m

def probs_1x2(matrix: list[list[float]]) -> dict:
    home = draw = away = 0.0
    for i, row in enumerate(matrix):
        for j, p in enumerate(row):
            if i > j: home += p
            elif i == j: draw += p
            else: away += p
    return {"home": home, "draw": draw, "away": away}

def prob_total_over(matrix: list[list[float]], linha: float) -> float:
    return sum(p for i, row in enumerate(matrix) for j, p in enumerate(row) if i + j > linha)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_match_model.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/match_model.py tests/test_match_model.py
git commit -m "feat: match_model (Poisson bivariado + Dixon-Coles) 1X2 + totais de gols"
```

---

### Task 8: `team_rates` no BSDStatsProvider (gols esperados por time)

**Files:**
- Modify: `src/odd_analyzer/providers/stats.py:201-202` (`team_rates`)
- Test: `tests/test_stats_provider.py`

Contexto: `match_model` precisa de `lambda_home`/`lambda_away`. `team_rates(team_id, ctx)` deve estimar gols-for esperados do time = (ataque do time) × (defesa do adversário) / média da liga, usando histórico finalizado (`/events/{id}/stats/` → `goals` por time, ou placar do `/events/`). Retorna `{lambda_for: float}`.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_stats_provider.py — adicionar
def test_team_rates_retorna_lambda_for():
    class _C:
        def events(self, **kw):
            return {"results": [
                {"id": 1, "home_team_id": 10, "away_team_id": 20, "home_score": 2, "away_score": 1},
                {"id": 2, "home_team_id": 30, "away_team_id": 10, "home_score": 0, "away_score": 3},
            ]}
    prov = BSDStatsProvider(_C())
    r = prov.team_rates(10, {"league_avg_goals": 1.3})
    assert r is not None and r["lambda_for"] > 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py -k team_rates -v`
Expected: FAIL (`team_rates` retorna None)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/providers/stats.py — substituir team_rates
    def team_rates(self, team_id, contexto: dict, janela: int = 10) -> dict | None:
        """Gols-for esperados do time = média de gols marcados no histórico finalizado.
        (Ataque puro; o ajuste pela defesa do adversário entra no match_model via o
        lambda do outro time.) None se sem dado."""
        team_id = str(team_id)
        try:
            evs = self._client.events(team_id=team_id, status="finished", limit=janela)
        except Exception:
            return None
        results = evs.get("results", []) if isinstance(evs, dict) else []
        gols = []
        for ev in results[:janela]:
            if str(ev.get("home_team_id")) == team_id:
                g = ev.get("home_score")
            else:
                g = ev.get("away_score")
            if g is not None:
                gols.append(float(g))
        if not gols:
            return None
        return {"lambda_for": sum(gols) / len(gols)}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_stats_provider.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/stats.py tests/test_stats_provider.py
git commit -m "feat: team_rates (gols-for esperados) no BSDStatsProvider p/ match_model"
```

---

### Task 9: Dispatch de `partida_*` no pipeline

**Files:**
- Modify: `src/odd_analyzer/pipeline.py:26-29` + nova função `_run_partida`
- Test: `tests/test_pipeline_partida.py`

Contexto: ligar `match_model` ao pipeline. `kind="partida_1x2"` → candidatos 1X2; `kind="partida_totais"` → candidatos de total de gols. Usa `team_rates` dos dois times + odds do `odds_provider`.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_pipeline_partida.py
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.store.repo import InMemoryRepo

class _Stats:
    def elenco(self, e): return []
    def entity_taxa(self, *a): return None
    def team_taxa(self, *a, **k): return None
    def team_rates(self, team_id, ctx, **k):
        return {"lambda_for": 1.8 if str(team_id) == "10" else 0.9}

class _Odds:
    def linhas(self, event, market):
        return [{"linha": 2.5, "odd_over": 1.95, "odd_under": 1.95}]

def _fake_ia(c, ctx): return {"melhor_aposta": None, "outras": [], "alertas": []}

def test_pipeline_partida_totais_gera_candidato():
    event = {"id": "1", "jogo": "A x B",
             "home_team": {"id": "10", "name": "A"}, "away_team": {"id": "20", "name": "B"}}
    out = analisar_jogo(event, MARKETS["gols"], _Stats(), _Odds(), InMemoryRepo(),
                        analista_fn=_fake_ia)
    assert out["candidatos"]  # pelo menos 1 candidato com prob_modelo de total>2.5
    assert 0.0 <= out["candidatos"][0]["prob_modelo"] <= 1.0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_pipeline_partida.py -v`
Expected: FAIL (candidatos vazio — kind não-contagem cai em `[]`)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/pipeline.py — topo, adicionar import:
from odd_analyzer.model.match_model import score_matrix, probs_1x2, prob_total_over

# substituir o dispatch em analisar_jogo:
    if market.kind == "contagem":
        candidatos = _run_contagem(event, market, stats_provider, odds_provider)
    elif market.kind in ("partida_totais", "partida_1x2"):
        candidatos = _run_partida(event, market, stats_provider, odds_provider)
    else:
        candidatos = []

# adicionar a função:
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_pipeline_partida.py tests/ -q`
Expected: PASS (suíte inteira)

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/pipeline.py tests/test_pipeline_partida.py
git commit -m "feat: pipeline dispatch partida_1x2/partida_totais via match_model"
```

---

### Task 10: Calibrar o match_model (gols)

**Files:**
- Modify: `src/odd_analyzer/backtest/run_bsd_backtest.py` (ramo de gols via match_model)
- Modify: `docs/ROADMAP.md`

Contexto: validar o `prob_total_over` contra resultados reais de gols. Para cada jogo finalizado, estimar `lambda_home/away` dos OUTROS jogos (leave-one-out simples por time) e prever `P(total>linha)` vs gols reais do jogo.

- [ ] **Step 1: Adicionar o ramo de calibração de gols**

```python
# src/odd_analyzer/backtest/run_bsd_backtest.py — adicionar função e chamada no main
def run_gols(league_id=9, n_events=120):
    from odd_analyzer.model.match_model import score_matrix, prob_total_over
    c = BSDClient(get_required("BZZOIRO_API_KEY"))
    evs = c.events(league_id=league_id, status="finished", limit=n_events).get("results", [])[:n_events]
    # média de gols-for por time (todos os jogos coletados)
    gf, gp = {}, {}
    jogos = []
    for ev in evs:
        h, a = ev.get("home_team_id"), ev.get("away_team_id")
        hs, as_ = ev.get("home_score"), ev.get("away_score")
        if None in (h, a, hs, as_):
            continue
        jogos.append((h, a, hs, as_))
        gf[h] = gf.get(h, 0) + hs; gp[h] = gp.get(h, 0) + 1
        gf[a] = gf.get(a, 0) + as_; gp[a] = gp.get(a, 0) + 1
    lines = MARKETS["gols"].lines
    for l in lines:
        preds, actuals = [], []
        for h, a, hs, as_ in jogos:
            lh = (gf[h] - hs) / (gp[h] - 1) if gp[h] > 1 else gf[h] / gp[h]
            la = (gf[a] - as_) / (gp[a] - 1) if gp[a] > 1 else gf[a] / gp[a]
            preds.append(prob_total_over(score_matrix(lh, la), l))
            actuals.append(1 if (hs + as_) > l else 0)
        base = sum(actuals) / len(actuals)
        print(f"\n=== gols over {l} | n={len(preds)} | freq real={base:.3f} ===")
        print(f"Brier {brier_score(preds, actuals):.4f} | ECE {expected_calibration_error(preds, actuals):.4f} | "
              f"BrierSkill {brier_skill_score(preds, actuals):.3f}")

# no main(): se sys.argv[1] == "gols": run_gols(...); return
```

- [ ] **Step 2: Rodar a calibração de gols**

Run: `.venv\Scripts\python.exe -m odd_analyzer.backtest.run_bsd_backtest gols 9 120`
Expected: Brier/ECE/BrierSkill por linha de gols. **Gravar no ROADMAP** (com veredito).

- [ ] **Step 3: Commit**

```bash
git add src/odd_analyzer/backtest/run_bsd_backtest.py docs/ROADMAP.md
git commit -m "feat: calibracao do match_model (gols) no BSD + veredito"
```

---

# FASE D — Pronto-pro-front (dívida de operação)

### Task 11: Popular `xi_confirmado` a partir do lineup confirmado

**Files:**
- Modify: `src/odd_analyzer/pipeline.py:110-123` (`_contagem_jogador` monta `xi_team_ids`)
- Test: `tests/test_pipeline_xi.py`

Contexto: hoje `xi_team_ids` nunca é populado → `entity_taxa` faz `xi_confirmado=True` sempre (gate inerte). O BSD dá `/events/{id}/lineups/` com `lineup_status:"confirmed"`. O pipeline deve, quando o lineup estiver confirmado, montar o set de ids titulares e passá-lo no contexto.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_pipeline_xi.py
from odd_analyzer.pipeline import _contagem_jogador
from odd_analyzer.model.markets import MARKETS

class _Stats:
    def elenco(self, e):
        return [{"id": "1", "name": "Titular", "team_id": "10"},
                {"id": "2", "name": "Reserva", "team_id": "10"}]
    def xi_ids(self, event):
        return {"1"}  # só o titular
    def entity_taxa(self, entity_id, market, contexto):
        return {"mu": 1.0, "minutos_esperados": 90.0,
                "xi_confirmado": contexto.get("xi_confirmado_flag", None),
                "amostra_jogos": 12, "concedido_adversario": "n/d", "incerteza": "baixa"}

def test_contagem_jogador_passa_xi_team_ids():
    event = {"id": "1", "home_team": {"id": "10"}, "away_team": {"id": "20"}}
    linhas = [{"linha": 1.5, "odd_over": 1.9, "odd_under": 1.9}]
    cands = _contagem_jogador(event, MARKETS["desarmes"], _Stats(), linhas)
    # com xi_ids={'1'}, o reserva (id 2) deve receber xi_confirmado=False
    by_player = {c["jogador"]: c for c in cands}
    assert by_player["Titular"]["xi_confirmado"] is True
    assert by_player["Reserva"]["xi_confirmado"] is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_pipeline_xi.py -v`
Expected: FAIL (xi não diferencia titular de reserva)

- [ ] **Step 3: Implementar** (provider opcional `xi_ids` + uso no pipeline)

```python
# src/odd_analyzer/providers/stats.py — adicionar método em BSDStatsProvider:
    def xi_ids(self, event: dict) -> set:
        """Set de player_ids titulares se o lineup estiver confirmado; senão set vazio
        (gate fica inerte = não barra, comportamento atual em jogo finalizado)."""
        try:
            data = self._client.lineups(event["id"])
        except Exception:
            return set()
        lineups = data.get("lineups", {})
        if data.get("lineup_status") != "confirmed" and \
           not any(v.get("confirmed") for v in lineups.values() if isinstance(v, dict)):
            # sem confirmação explícita: não barrar (set vazio → xi_confirmado=True)
            return set()
        ids = set()
        for side in ("home", "away"):
            for p in lineups.get(side, {}).get("players", []):
                ids.add(str(p["id"]))
        return ids
```

```python
# src/odd_analyzer/pipeline.py — em _contagem_jogador, antes do loop:
    xi_team_ids = stats_provider.xi_ids(event) if hasattr(stats_provider, "xi_ids") else set()
# e dentro do contexto de cada entidade, acrescentar:
            "xi_team_ids": xi_team_ids,
```

E em `BSDStatsProvider.entity_taxa`, a linha de `xi_confirmado` já usa `xi_team_ids` do contexto e compara com `entity_team_id`. **Corrigir** para comparar com o id do jogador (não do time):
```python
# stats.py entity_taxa — trocar:
        xi_confirmado = (entity_team_id in xi_team_ids) if xi_team_ids else True
# POR:
        xi_confirmado = (str(entity_id) in xi_team_ids) if xi_team_ids else True
```

> Nota: o teste usa um `_Stats` fake com `xi_ids`; ajustar a montagem de `xi_confirmado` no fake do teste para refletir `str(entity_id) in xi_ids`. Garantir consistência: o candidato do reserva sai com `xi_confirmado=False`.

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_pipeline_xi.py tests/ -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/pipeline.py src/odd_analyzer/providers/stats.py tests/test_pipeline_xi.py
git commit -m "feat: xi_confirmado vivo via lineup confirmado do BSD (gate deixa de ser inerte)"
```

---

### Task 12: Persistência do `jogadores_crosswalk`

**Files:**
- Modify: `src/odd_analyzer/store/repo.py` (métodos `save_crosswalk`/`get_crosswalk` no Repo + 2 impls)
- Modify: `src/odd_analyzer/store/schema.sql` (refletir colunas usadas)
- Test: `tests/test_repo.py`

Contexto: a tabela `jogadores_crosswalk` existe no schema mas nenhum código a lê/escreve. Adicionar persistência ligada ao `crosswalk/match.py` (que produz `{id, name, confianca}`).

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_repo.py — adicionar
from odd_analyzer.store.repo import InMemoryRepo

def test_crosswalk_save_get_roundtrip():
    repo = InMemoryRepo()
    repo.save_crosswalk(id_canonico=1994, nome_normalizado="adrien rabiot",
                        fontes_ids={"bsd": "1994", "odds": "rabiot"}, confianca=0.97)
    row = repo.get_crosswalk(1994)
    assert row["nome_normalizado"] == "adrien rabiot"
    assert row["fontes_ids"]["bsd"] == "1994"
    assert abs(row["confianca"] - 0.97) < 1e-9
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_repo.py -k crosswalk -v`
Expected: FAIL (`'InMemoryRepo' object has no attribute 'save_crosswalk'`)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/store/repo.py — no Repo(ABC), adicionar:
    @abstractmethod
    def save_crosswalk(self, id_canonico: int, nome_normalizado: str,
                       fontes_ids: dict, confianca: float,
                       verificado_manual: bool = False) -> None: ...
    @abstractmethod
    def get_crosswalk(self, id_canonico: int) -> dict | None: ...

# InMemoryRepo.__init__ — adicionar:
        self.crosswalk: dict[int, dict] = {}

# InMemoryRepo — adicionar métodos:
    def save_crosswalk(self, id_canonico, nome_normalizado, fontes_ids, confianca,
                       verificado_manual=False):
        self.crosswalk[id_canonico] = {
            "id_canonico": id_canonico, "nome_normalizado": nome_normalizado,
            "fontes_ids": fontes_ids, "confianca": confianca,
            "verificado_manual": verificado_manual,
        }
    def get_crosswalk(self, id_canonico):
        return self.crosswalk.get(id_canonico)

# SupabaseRepo — adicionar métodos:
    def save_crosswalk(self, id_canonico, nome_normalizado, fontes_ids, confianca,
                       verificado_manual=False):
        self._client.table("jogadores_crosswalk").upsert({
            "id_canonico": id_canonico, "nome_normalizado": nome_normalizado,
            "fontes_ids": fontes_ids, "confianca": confianca,
            "verificado_manual": verificado_manual,
        }).execute()
    def get_crosswalk(self, id_canonico):
        r = (self._client.table("jogadores_crosswalk").select("*")
             .eq("id_canonico", id_canonico).execute())
        return r.data[0] if r.data else None
```

O `schema.sql` já tem a tabela com essas colunas — adicionar um comentário ` -- lido/escrito por SupabaseRepo.save_crosswalk/get_crosswalk` sobre a tabela.

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_repo.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/store/repo.py src/odd_analyzer/store/schema.sql tests/test_repo.py
git commit -m "feat: persistencia do jogadores_crosswalk (save/get no Repo)"
```

---

### Task 13: Logger de fechamento (CLV forward)

**Files:**
- Modify: `src/odd_analyzer/store/repo.py` (método `snapshot_fechamento`)
- Test: `tests/test_repo.py`

Contexto: CLV histórico é impossível (odds só populam perto do kickoff). A captura tem que ser forward: tirar um snapshot da odd de fechamento pré-kickoff e gravá-la na linha do `paper_ledger` correspondente, calculando o CLV. O `update_fechamento` já existe mas exige também `resultado`; aqui queremos gravar só o fechamento (resultado vem depois). Adicionar um método dedicado.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_repo.py — adicionar
def test_snapshot_fechamento_calcula_clv_sem_resultado():
    repo = InMemoryRepo()
    repo.save_ledger([{
        "event_id": "1", "jogador": "Kaiki", "linha": 1.5, "market_type": "desarmes",
        "odd_flag": 1.90, "prob_modelo": 0.73, "prob_devig": 0.55, "edge": 0.18, "ev": 0.24,
    }])
    repo.snapshot_fechamento("1", "Kaiki", 1.5, "desarmes", odd_fechamento=1.75)
    row = repo.ledger[0]
    assert abs(row["odd_fechamento"] - 1.75) < 1e-9
    # CLV = 1.90/1.75 - 1 > 0 (peguei preço melhor que o fechamento)
    assert row["clv"] > 0
    assert "resultado" not in row or row["resultado"] is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_repo.py -k snapshot -v`
Expected: FAIL (`no attribute 'snapshot_fechamento'`)

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/store/repo.py — Repo(ABC) adicionar:
    @abstractmethod
    def snapshot_fechamento(self, event_id: str, jogador: str, linha: float,
                            market_type: str | None, odd_fechamento: float) -> None: ...

# InMemoryRepo — adicionar:
    def snapshot_fechamento(self, event_id, jogador, linha, market_type, odd_fechamento):
        for row in self.ledger:
            if (row["event_id"], row["jogador"], row["linha"]) != (event_id, jogador, linha):
                continue
            if market_type is not None and row.get("market_type") != market_type:
                continue
            row["odd_fechamento"] = odd_fechamento
            row["clv"] = clv(row["odd_flag"], odd_fechamento)
            break

# SupabaseRepo — adicionar:
    def snapshot_fechamento(self, event_id, jogador, linha, market_type, odd_fechamento):
        sel = (self._client.table("paper_ledger").select("odd_flag")
               .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha))
        if market_type is not None:
            sel = sel.eq("market_type", market_type)
        data = sel.execute().data
        if not data:
            return
        c = clv(data[0]["odd_flag"], odd_fechamento)
        upd = (self._client.table("paper_ledger")
               .update({"odd_fechamento": odd_fechamento, "clv": c})
               .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha))
        if market_type is not None:
            upd = upd.eq("market_type", market_type)
        upd.execute()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_repo.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/store/repo.py tests/test_repo.py
git commit -m "feat: snapshot_fechamento p/ captura de CLV forward (sem exigir resultado)"
```

---

### Task 14: Documentar o slot odds-corners (sem implementar)

**Files:**
- Modify: `docs/ROADMAP.md` (follow-up `odds-corners`)

Contexto: odds automáticas de escanteios precisam de endpoint testado num jogo FUTURO (corners só existem pré-kickoff). Não implementar agora; só registrar o caminho exato.

- [ ] **Step 1: Atualizar o follow-up no ROADMAP**

No follow-up `odds-corners` de `docs/ROADMAP.md`, registrar: o endpoint `/events/{id}/odds/` de jogo finalizado retorna **flat consensus só de mercado de partida** (confirmado 2026-06-03, ver `docs/apis/bsd-bzzoiro/examples/event_odds.json`); para odds automáticas de corners, testar `/odds/?event_id=&market=total_corners` num jogo **futuro** com odds populadas, e então reconciliar `BSDMatchOdds.linhas` com a forma real retornada. Marcar como pré-requisito do **modo pré-jogo do front**, não desta meta.

- [ ] **Step 2: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: registrar caminho do slot odds-corners (forward, pre-jogo)"
```

---

## Fechamento da meta

- [ ] **Verificação final:** `.venv\Scripts\python.exe -m pytest -q` → suíte inteira verde.
- [ ] **ROADMAP atualizado** com: métricas + veredito de calibração (B, e C se executada), decisão sobre Fase 3 (construída ou adiada com diagnóstico), e os follow-ups fechados (per-90, baseline, xi, crosswalk, CLV-forward).
- [ ] **Branch:** `feat/motor-calibracao-pre-front`. Integrar via `superpowers:finishing-a-development-branch` quando a meta fechar.

---

## Self-Review (preenchido)

**Spec coverage:** A1/A2 (per-90 + ordenação) ✓ Tasks 1-2. A2-baseline ✓ Task 3. B-coletor ✓ Task 4. B-reuso score_records + veredito ✓ Task 5. B-escanteios ✓ Task 6. Dois-tipos-de-validação (só confiabilidade p/ jogador) ✓ refletido em Tasks 5-6 (sem CLV no backtest). C-match_model ✓ Tasks 7-10 (gated). D-xi ✓ Task 11. D-crosswalk ✓ Task 12. D-CLV-forward ✓ Task 13. D-odds-corners-doc ✓ Task 14.

**Placeholder scan:** o único valor "produzido em runtime" é o `concede_baseline` (Task 3) e as métricas de calibração (Tasks 5,6,10) — por natureza são medições; o plano dá o comando exato e como aplicar. Sem TODO/TBD soltos.

**Type consistency:** `windowed_rate(..., minutes_field=)` (Task 1) usado por `entity_taxa` (Task 2) com `minutes_field="minutes_played"`. `collect_bsd(...)` retorna a 6-tupla que `score_records` (existente) consome (Tasks 4-5). `score_matrix/probs_1x2/prob_total_over` (Task 7) usados em `_run_partida` (Task 9) e na calibração de gols (Task 10). `save_crosswalk/get_crosswalk/snapshot_fechamento` (Tasks 12-13) coerentes entre ABC e impls.
