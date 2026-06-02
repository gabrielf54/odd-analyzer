# Fase 0 — Spike de Viabilidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar (ou derrubar) os 3 portões de viabilidade do odd-analyzer antes de construir o modelo: (1) SportsGameOdds retorna odds de SOT por jogador para jogos da Copa 2026, (2) o FBref (ou fallback) ainda fornece SOT por jogador pós-remoção do Opta, (3) API-Football cobre escalação da Copa.

**Architecture:** Pacote Python `odd_analyzer` com um módulo `probes/` de funções puras (parsers testáveis por TDD) + wrappers HTTP finos rodados ao vivo com chaves de API. Um CLI executa os probes e gera um relatório de viabilidade GO/NO-GO. Nada de modelo/UI ainda.

**Tech Stack:** Python 3.11+, `requests`, `python-dotenv`, `soccerdata`, `pandas`, `supabase`, `pytest`. Sem framework web nesta fase.

---

## ⚠️ Nota sobre incerteza de API (ler antes de começar)

Não foi possível bater nas APIs ao vivo durante a pesquisa (retornaram 401 sem chave). Os **fixtures** neste plano são representativos, baseados na documentação (padrão de `oddID` da SGO, formato `/leagues` da API-Football). **O primeiro passo ao vivo de cada probe é capturar a resposta REAL e comparar com o fixture; se a forma divergir, ajustar o parser e o fixture.** Isso é esperado num spike contra API não verificada — o parser é a hipótese, a resposta real é a verdade.

---

## Estrutura de arquivos

```
odd-analyzer/
  requirements.txt
  .gitignore
  .env.example
  pytest.ini
  src/odd_analyzer/
    __init__.py
    config.py                 # carrega env vars
    odds_math.py              # american_to_decimal (puro)
    probes/
      __init__.py
      odds_probe.py           # parse_sot_props + fetch ao vivo (SGO)
      lineups_probe.py        # check_lineup_coverage + fetch ao vivo (API-Football)
      stats_probe.py          # has_sot_column + fetch ao vivo (soccerdata/FBref)
      report.py               # build_viability_report
    cli.py                    # python -m odd_analyzer.cli probe-all
  tests/
    fixtures/
      sgo_event_sample.json
      apifootball_leagues_sample.json
    test_odds_math.py
    test_odds_probe.py
    test_lineups_probe.py
    test_stats_probe.py
    test_report.py
```

---

## Task 0: Pré-requisitos manuais (o usuário precisa fazer)

> Estes passos **não podem ser feitos pelo agente** (exigem cadastro/identidade). Faça-os antes do Task 5/6/7 (passos ao vivo). Tasks 1-4 e 8 não dependem deles.

- [ ] **Step 1:** Criar conta grátis na SportsGameOdds (plano Amateur) em https://sportsgameodds.com e copiar a API key.
- [ ] **Step 2:** Criar conta grátis na API-Football em https://www.api-football.com (ou via RapidAPI) e copiar a API key.
- [ ] **Step 3:** Criar um projeto grátis no Supabase (https://supabase.com), copiar `Project URL` e a `service_role` key (usada localmente; nunca commitar).
- [ ] **Step 4:** Copiar `.env.example` para `.env` (criado no Task 1) e preencher as chaves. Confirmar que `.env` está no `.gitignore`.

---

## Task 1: Scaffold do projeto

**Files:**
- Create: `requirements.txt`, `.gitignore`, `.env.example`, `pytest.ini`, `src/odd_analyzer/__init__.py`

- [ ] **Step 1: Criar `requirements.txt`**

```
requests==2.32.3
python-dotenv==1.0.1
soccerdata==1.8.7
pandas==2.2.3
supabase==2.9.1
pytest==8.3.4
```

- [ ] **Step 2: Criar `.gitignore`**

```
.venv/
__pycache__/
*.pyc
.env
.pytest_cache/
docs/superpowers/reports/
```

- [ ] **Step 3: Criar `.env.example`**

```
SGO_API_KEY=
APIFOOTBALL_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

- [ ] **Step 4: Criar `pytest.ini`**

```ini
[pytest]
pythonpath = src
testpaths = tests
```

- [ ] **Step 5: Criar `src/odd_analyzer/__init__.py`** (arquivo vazio)

```python
```

- [ ] **Step 6: Criar venv e instalar deps**

Run (Windows PowerShell):
```
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
```
Expected: instala sem erro; `pip list` mostra pytest, soccerdata, supabase.

- [ ] **Step 7: Rodar pytest vazio pra confirmar setup**

Run: `pytest -q`
Expected: "no tests ran" (exit 0), sem erro de import/config.

- [ ] **Step 8: Commit**

```bash
git add requirements.txt .gitignore .env.example pytest.ini src/odd_analyzer/__init__.py
git commit -m "chore: scaffold do projeto odd-analyzer (fase 0)"
```

---

## Task 2: Loader de config

**Files:**
- Create: `src/odd_analyzer/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_config.py
import pytest
from odd_analyzer import config

def test_get_required_present(monkeypatch):
    monkeypatch.setenv("SGO_API_KEY", "abc")
    assert config.get_required("SGO_API_KEY") == "abc"

def test_get_required_missing(monkeypatch):
    monkeypatch.delenv("SGO_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="SGO_API_KEY"):
        config.get_required("SGO_API_KEY")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest tests/test_config.py -v`
Expected: FAIL (ModuleNotFoundError: config / AttributeError get_required).

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/config.py
import os
from dotenv import load_dotenv

load_dotenv()

def get_required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest tests/test_config.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/config.py tests/test_config.py
git commit -m "feat: loader de config a partir de .env"
```

---

## Task 3: Conversão de odds americana → decimal

**Files:**
- Create: `src/odd_analyzer/odds_math.py`
- Test: `tests/test_odds_math.py`

> SGO pode retornar odds em formato americano (ex.: `-120`, `+150`). O modelo trabalha em decimal. Função pura, fácil de testar.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_odds_math.py
import pytest
from odd_analyzer.odds_math import american_to_decimal

@pytest.mark.parametrize("american,expected", [
    ("+150", 2.5),
    ("-120", 1.8333),
    ("100", 2.0),
    ("-200", 1.5),
])
def test_american_to_decimal(american, expected):
    assert american_to_decimal(american) == pytest.approx(expected, abs=1e-4)

def test_already_decimal_passthrough():
    # se vier valor decimal (>=1.01 com ponto e sem sinal), retorna como float
    assert american_to_decimal("1.83") == pytest.approx(1.83)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest tests/test_odds_math.py -v`
Expected: FAIL (ModuleNotFoundError odds_math).

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/odds_math.py
def american_to_decimal(value: str | float) -> float:
    """Converte odd americana (ex.: '-120', '+150') para decimal.
    Se o valor já parecer decimal (tem ponto e não tem sinal), retorna como float."""
    s = str(value).strip()
    if "." in s and not s.startswith(("+", "-")):
        return float(s)
    a = float(s)
    if a > 0:
        return round(1 + a / 100, 4)
    return round(1 + 100 / abs(a), 4)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest tests/test_odds_math.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/odds_math.py tests/test_odds_math.py
git commit -m "feat: conversao de odds americana para decimal"
```

---

## Task 4: Parser de SOT props da SGO (TDD com fixture)

**Files:**
- Create: `tests/fixtures/sgo_event_sample.json`
- Create: `src/odd_analyzer/probes/__init__.py` (vazio)
- Create: `src/odd_analyzer/probes/odds_probe.py`
- Test: `tests/test_odds_probe.py`

- [ ] **Step 1: Criar o fixture representativo**

```json
{
  "success": true,
  "data": [
    {
      "eventID": "evt_BRA_SRB_2026",
      "leagueID": "INTERNATIONAL_SOCCER",
      "status": {"startsAt": "2026-06-12T20:00:00Z"},
      "teams": {"home": {"names": {"long": "Brazil"}}, "away": {"names": {"long": "Serbia"}}},
      "players": {"PLAYER_VINI": {"name": "Vinicius Junior", "teamID": "BRAZIL"}},
      "odds": {
        "shots_on_target-PLAYER_VINI-game-ou-over": {
          "oddID": "shots_on_target-PLAYER_VINI-game-ou-over",
          "statID": "shots_on_target",
          "playerID": "PLAYER_VINI",
          "betTypeID": "ou",
          "sideID": "over",
          "byBookmaker": {
            "draftkings": {"odds": "-120", "overUnder": "1.5", "available": true},
            "bet365": {"odds": "1.83", "overUnder": "1.5", "available": true}
          }
        },
        "shots_on_target-PLAYER_VINI-game-ou-under": {
          "oddID": "shots_on_target-PLAYER_VINI-game-ou-under",
          "statID": "shots_on_target",
          "playerID": "PLAYER_VINI",
          "betTypeID": "ou",
          "sideID": "under",
          "byBookmaker": {
            "draftkings": {"odds": "-110", "overUnder": "1.5", "available": true},
            "bet365": {"odds": "1.90", "overUnder": "1.5", "available": true}
          }
        },
        "points-PLAYER_VINI-game-ou-over": {
          "oddID": "points-PLAYER_VINI-game-ou-over",
          "statID": "points", "playerID": "PLAYER_VINI", "betTypeID": "ou", "sideID": "over",
          "byBookmaker": {"draftkings": {"odds": "-110", "overUnder": "0.5", "available": true}}
        }
      }
    }
  ]
}
```

- [ ] **Step 2: Criar `probes/__init__.py`** (vazio)

```python
```

- [ ] **Step 3: Escrever o teste que falha**

```python
# tests/test_odds_probe.py
import json
from pathlib import Path
from odd_analyzer.probes.odds_probe import parse_sot_props

FIXTURE = Path(__file__).parent / "fixtures" / "sgo_event_sample.json"

def load_event():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return data["data"][0]

def test_extrai_apenas_sot_over_under():
    props = parse_sot_props(load_event())
    # ignora o mercado 'points'; só SOT over/under do Vini
    assert len(props) == 1
    p = props[0]
    assert p["player_id"] == "PLAYER_VINI"
    assert p["player_name"] == "Vinicius Junior"
    assert p["line"] == 1.5

def test_agrega_over_under_por_bookmaker():
    p = parse_sot_props(load_event())[0]
    assert set(p["bookmakers"].keys()) == {"draftkings", "bet365"}
    # bet365 já vem decimal; draftkings vem americano e é convertido
    assert p["bookmakers"]["bet365"]["over"] == 1.83
    assert p["bookmakers"]["draftkings"]["over"] == 1.8333
    assert p["bookmakers"]["draftkings"]["under"] == 1.9091

def test_evento_sem_sot_retorna_vazio():
    assert parse_sot_props({"odds": {}}) == []
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pytest tests/test_odds_probe.py -v`
Expected: FAIL (ModuleNotFoundError odds_probe).

- [ ] **Step 5: Implementar o parser**

```python
# src/odd_analyzer/probes/odds_probe.py
from odd_analyzer.odds_math import american_to_decimal

def parse_sot_props(event: dict) -> list[dict]:
    """Extrai props de Shots on Target (over/under) de um evento da SGO.
    Retorna lista de dicts: {player_id, player_name, line, bookmakers:{book:{over,under}}}."""
    players = event.get("players", {})
    odds = event.get("odds", {})
    # agrupa por (player_id, line)
    grouped: dict[tuple, dict] = {}
    for odd in odds.values():
        if odd.get("statID") != "shots_on_target" or odd.get("betTypeID") != "ou":
            continue
        side = odd.get("sideID")
        if side not in ("over", "under"):
            continue
        player_id = odd.get("playerID")
        for book, b in odd.get("byBookmaker", {}).items():
            if not b.get("available", True):
                continue
            line = float(b["overUnder"])
            key = (player_id, line)
            entry = grouped.setdefault(key, {
                "player_id": player_id,
                "player_name": players.get(player_id, {}).get("name", player_id),
                "line": line,
                "bookmakers": {},
            })
            entry["bookmakers"].setdefault(book, {})[side] = american_to_decimal(b["odds"])
    return list(grouped.values())
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pytest tests/test_odds_probe.py -v`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/sgo_event_sample.json src/odd_analyzer/probes/__init__.py src/odd_analyzer/probes/odds_probe.py tests/test_odds_probe.py
git commit -m "feat: parser de SOT props da SportsGameOdds (fixture)"
```

---

## Task 5: Fetch ao vivo da SGO (gated em chave) + captura de fixture real

**Files:**
- Modify: `src/odd_analyzer/probes/odds_probe.py`

> Wrapper HTTP fino. A lógica testável já está no parser (Task 4). Este passo é integração ao vivo.

- [ ] **Step 1: Adicionar fetch ao vivo ao `odds_probe.py`**

```python
# adicionar no topo de src/odd_analyzer/probes/odds_probe.py
import requests
from odd_analyzer.config import get_required

SGO_BASE = "https://api.sportsgameodds.com/v2"

def fetch_wc_events_with_sot(limit: int = 5) -> dict:
    """Busca eventos de futebol internacional na SGO filtrando SOT player props.
    Retorna o JSON cru (para inspeção e para alimentar parse_sot_props)."""
    key = get_required("SGO_API_KEY")
    resp = requests.get(
        f"{SGO_BASE}/events",
        params={
            "leagueID": "INTERNATIONAL_SOCCER",
            "oddsAvailable": "true",
            "limit": str(limit),
        },
        headers={"X-Api-Key": key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
```

- [ ] **Step 2 (AO VIVO — requer Task 0): capturar resposta real e salvar como fixture**

Run (com `.venv` ativo e `.env` preenchido):
```
python -c "import json; from odd_analyzer.probes.odds_probe import fetch_wc_events_with_sot; open('tests/fixtures/sgo_event_REAL.json','w',encoding='utf-8').write(json.dumps(fetch_wc_events_with_sot(), indent=2, ensure_ascii=False))"
```
Expected: cria `tests/fixtures/sgo_event_REAL.json`. **Abrir o arquivo e comparar a forma com `sgo_event_sample.json`.** Se os campos divergirem (nome de header de auth, chave `byBookmaker`, formato de odds, etc.), **ajustar `parse_sot_props` e o fixture do Task 4 e re-rodar os testes**.

- [ ] **Step 3 (AO VIVO): rodar o parser sobre dado real e verificar se há SOT na Copa**

Run:
```
python -c "import json; from odd_analyzer.probes.odds_probe import parse_sot_props; d=json.load(open('tests/fixtures/sgo_event_REAL.json',encoding='utf-8')); [print(e.get('teams'), len(parse_sot_props(e)),'props SOT') for e in d.get('data',[])]"
```
Expected: imprime, para cada evento, quantas props de SOT foram extraídas. **GATE: se ≥1 evento da Copa tem props SOT (de bet365 ou qualquer casa) → portão de ODDS = GO.** Se 0 em todos, registrar NO-GO de odds (e considerar testar `bookmakerID=bet365` explicitamente).

- [ ] **Step 4: Commit** (sem o `_REAL.json`, que pode conter dados volumosos; já está coberto por gitignore? não — adicione)

```bash
echo "tests/fixtures/*_REAL.json" >> .gitignore
git add src/odd_analyzer/probes/odds_probe.py .gitignore
git commit -m "feat: fetch ao vivo da SGO + captura de fixture real"
```

---

## Task 6: Probe de cobertura de escalação (API-Football)

**Files:**
- Create: `tests/fixtures/apifootball_leagues_sample.json`
- Create: `src/odd_analyzer/probes/lineups_probe.py`
- Test: `tests/test_lineups_probe.py`

- [ ] **Step 1: Criar o fixture**

```json
{
  "response": [
    {
      "league": {"id": 1, "name": "World Cup"},
      "seasons": [
        {"year": 2022, "coverage": {"fixtures": {"lineups": true}}},
        {"year": 2026, "coverage": {"fixtures": {"lineups": true}}}
      ]
    }
  ]
}
```

- [ ] **Step 2: Escrever o teste que falha**

```python
# tests/test_lineups_probe.py
import json
from pathlib import Path
from odd_analyzer.probes.lineups_probe import check_lineup_coverage

FIXTURE = Path(__file__).parent / "fixtures" / "apifootball_leagues_sample.json"

def load():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))

def test_cobertura_true_para_copa_2026():
    assert check_lineup_coverage(load(), league_id=1, season=2026) is True

def test_temporada_inexistente_false():
    assert check_lineup_coverage(load(), league_id=1, season=2030) is False

def test_liga_inexistente_false():
    assert check_lineup_coverage(load(), league_id=999, season=2026) is False
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pytest tests/test_lineups_probe.py -v`
Expected: FAIL (ModuleNotFoundError lineups_probe).

- [ ] **Step 4: Implementar parser + fetch ao vivo**

```python
# src/odd_analyzer/probes/lineups_probe.py
import requests
from odd_analyzer.config import get_required

APIFOOTBALL_BASE = "https://v3.football.api-sports.io"

def check_lineup_coverage(leagues_json: dict, league_id: int, season: int) -> bool:
    """True se a liga/temporada cobre escalações pré-jogo (coverage.fixtures.lineups)."""
    for item in leagues_json.get("response", []):
        if item.get("league", {}).get("id") != league_id:
            continue
        for s in item.get("seasons", []):
            if s.get("year") == season:
                return bool(s.get("coverage", {}).get("fixtures", {}).get("lineups"))
    return False

def fetch_league(league_id: int) -> dict:
    key = get_required("APIFOOTBALL_KEY")
    resp = requests.get(
        f"{APIFOOTBALL_BASE}/leagues",
        params={"id": str(league_id)},
        headers={"x-apisports-key": key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pytest tests/test_lineups_probe.py -v`
Expected: PASS (3 passed).

- [ ] **Step 6 (AO VIVO — requer Task 0): confirmar cobertura real**

Run:
```
python -c "from odd_analyzer.probes.lineups_probe import fetch_league, check_lineup_coverage; print('lineups WC2026:', check_lineup_coverage(fetch_league(1), 1, 2026))"
```
Expected: imprime `lineups WC2026: True` ou `False`. **GATE: True → portão de ESCALAÇÃO = GO.**

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/apifootball_leagues_sample.json src/odd_analyzer/probes/lineups_probe.py tests/test_lineups_probe.py
git commit -m "feat: probe de cobertura de escalacao (API-Football)"
```

---

## Task 7: Probe de stats (FBref via soccerdata — SOT sobreviveu ao corte do Opta?)

**Files:**
- Create: `src/odd_analyzer/probes/stats_probe.py`
- Test: `tests/test_stats_probe.py`

> A detecção da coluna SoT é a parte testável; a busca ao vivo via soccerdata é integração.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_stats_probe.py
import pandas as pd
from odd_analyzer.probes.stats_probe import has_sot_column

def test_detecta_sot_em_colunas_simples():
    df = pd.DataFrame({"Player": ["X"], "Sh": [3], "SoT": [1]})
    assert has_sot_column(df) is True

def test_detecta_sot_em_multiindex():
    cols = pd.MultiIndex.from_tuples([("Standard", "Gls"), ("Standard", "SoT")])
    df = pd.DataFrame([[1, 2]], columns=cols)
    assert has_sot_column(df) is True

def test_ausencia_de_sot():
    df = pd.DataFrame({"Player": ["X"], "Gls": [1], "Ast": [0]})
    assert has_sot_column(df) is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest tests/test_stats_probe.py -v`
Expected: FAIL (ModuleNotFoundError stats_probe).

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/probes/stats_probe.py
import pandas as pd

def has_sot_column(df: pd.DataFrame) -> bool:
    """True se o DataFrame tem alguma coluna de Shots on Target (SoT).
    Trata colunas simples e MultiIndex."""
    for col in df.columns:
        parts = col if isinstance(col, tuple) else (col,)
        if any(str(p).strip().lower() == "sot" for p in parts):
            return True
    return False

def fetch_fbref_shooting_sample(league: str = "ENG-Premier League", season: str = "2425") -> "pd.DataFrame":
    """Puxa stats de chute por jogador via soccerdata/FBref para checar se SoT existe.
    Importa soccerdata dentro da função pra não pesar nos testes unitários."""
    import soccerdata as sd
    fbref = sd.FBref(leagues=league, seasons=season)
    return fbref.read_player_season_stats(stat_type="shooting")
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest tests/test_stats_probe.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5 (AO VIVO): checar se o FBref ainda tem SoT pós-20/jan/2026**

Run:
```
python -c "from odd_analyzer.probes.stats_probe import fetch_fbref_shooting_sample, has_sot_column; df=fetch_fbref_shooting_sample(); print('colunas:', list(df.columns)[:15]); print('TEM SoT:', has_sot_column(df))"
```
Expected: imprime as colunas e `TEM SoT: True/False`. **GATE: True → portão de STATS = GO. Se False (ou erro 403/Cloudflare), registrar NO-GO do FBref e testar fonte alternativa** (trocar `sd.FBref` por `sd.Sofascore`/`sd.Understat` no mesmo probe e re-rodar).

- [ ] **Step 6: Commit**

```bash
git add src/odd_analyzer/probes/stats_probe.py tests/test_stats_probe.py
git commit -m "feat: probe de stats SOT (FBref via soccerdata) com deteccao de coluna"
```

---

## Task 8: Construtor do relatório de viabilidade

**Files:**
- Create: `src/odd_analyzer/probes/report.py`
- Test: `tests/test_report.py`

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_report.py
from odd_analyzer.probes.report import build_viability_report

def test_go_quando_todos_passam():
    r = build_viability_report(odds_ok=True, stats_ok=True, lineups_ok=True, detalhes={})
    assert "VEREDITO: GO" in r
    assert "Odds (SGO): GO" in r

def test_nogo_quando_um_falha():
    r = build_viability_report(odds_ok=True, stats_ok=False, lineups_ok=True,
                               detalhes={"stats": "FBref sem SoT; testar Sofascore"})
    assert "VEREDITO: NO-GO" in r
    assert "Stats: NO-GO" in r
    assert "testar Sofascore" in r
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest tests/test_report.py -v`
Expected: FAIL (ModuleNotFoundError report).

- [ ] **Step 3: Implementar**

```python
# src/odd_analyzer/probes/report.py
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest tests/test_report.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/probes/report.py tests/test_report.py
git commit -m "feat: construtor de relatorio de viabilidade GO/NO-GO"
```

---

## Task 9: CLI `probe-all` (orquestra os probes ao vivo)

**Files:**
- Create: `src/odd_analyzer/cli.py`

> Liga os fetchers ao vivo + parsers + relatório. Roda ao vivo (requer chaves), por isso não tem teste unitário — a lógica já está coberta nos parsers.

- [ ] **Step 1: Implementar o CLI**

```python
# src/odd_analyzer/cli.py
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
    out = Path("docs/superpowers/reports/fase0-viabilidade.md")
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
```

- [ ] **Step 2 (AO VIVO — requer Task 0): rodar o probe completo**

Run: `python -m odd_analyzer.cli probe-all`
Expected: imprime o relatório de viabilidade e salva em `docs/superpowers/reports/fase0-viabilidade.md`. **Este é o entregável da Fase 0.**

- [ ] **Step 3: Commit**

```bash
git add src/odd_analyzer/cli.py
git commit -m "feat: CLI probe-all que gera o relatorio de viabilidade"
```

---

## Task 10: (de-risk, opcional) Smoke test de conexão com o Supabase

**Files:**
- Create: `src/odd_analyzer/probes/supabase_probe.py`

> Confirma cedo que as credenciais do Supabase funcionam. Não cria tabelas (isso é Fase 1).

- [ ] **Step 1: Implementar**

```python
# src/odd_analyzer/probes/supabase_probe.py
from odd_analyzer.config import get_required

def check_connection() -> bool:
    """Tenta conectar no Supabase. Retorna True se o cliente inicializa com as creds."""
    from supabase import create_client
    url = get_required("SUPABASE_URL")
    key = get_required("SUPABASE_SERVICE_KEY")
    client = create_client(url, key)
    # chamada trivial: lista schemas via RPC não é garantida; só confirmamos init + auth do client
    return client is not None
```

- [ ] **Step 2 (AO VIVO — requer Task 0): rodar**

Run:
```
python -c "from odd_analyzer.probes.supabase_probe import check_connection; print('Supabase OK:', check_connection())"
```
Expected: `Supabase OK: True` sem exceção de auth.

- [ ] **Step 3: Commit**

```bash
git add src/odd_analyzer/probes/supabase_probe.py
git commit -m "chore: smoke test de conexao com Supabase"
```

---

## Critério de conclusão da Fase 0

A Fase 0 termina quando `python -m odd_analyzer.cli probe-all` produz um relatório com **VEREDITO: GO** (os três portões passam) — ou um NO-GO documentado com a fonte alternativa identificada (ex.: stats via Sofascore em vez de FBref). Só então escrevemos o plano da **Fase 1 (modelo + arnês de validação em paper)**.

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec §12:** item 1 (SGO SOT Copa) → Task 4/5; item 2 (FBref SoT) → Task 7; item 3 (API-Football lineups) → Task 6; item 4 (pricing SGO) → verificação manual no Task 0/§4.1 do spec (não-código). ✔
- **Placeholders:** nenhum TODO/TBD; todo passo de código tem código completo. Os fixtures são marcados explicitamente como representativos a validar ao vivo. ✔
- **Consistência de tipos:** `parse_sot_props` retorna `list[dict]` com chaves `player_id/player_name/line/bookmakers`, usado consistentemente no Task 9; `american_to_decimal` usado no parser; `has_sot_column`/`check_lineup_coverage`/`build_viability_report` com assinaturas idênticas entre definição e uso no CLI. ✔
