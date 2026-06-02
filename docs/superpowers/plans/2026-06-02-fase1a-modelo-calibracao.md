# Fase 1a — Modelo SOT + Backtest de Calibração — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o motor estatístico de Shots on Target (taxa-base por jogador via API-Football → modelo Binomial-Negativa → P(SOT ≥ linha)) e provar que ele é **bem calibrado** via backtest em jogos de clube de 2022-2024, **sem depender de odds**.

**Architecture:** Funções puras de estatística em Python puro (módulo `math`, SEM scipy/pandas — a máquina é Python 3.14 e pacotes pesados não têm wheel). Cliente fino da API-Football para taxa-base e resultados por jogo. Cache local em JSON (gitignored) para respeitar o limite de 100 req/dia. Backtest produz curva de calibração + Brier.

**Tech Stack:** Python 3.14, `requests`, `python-dotenv`, `pytest`. Estatística em stdlib (`math`). Sem scipy, sem pandas no caminho novo.

---

## Contexto (ler antes de começar)

- Continua o projeto `odd-analyzer`, branch `feat/fase0-spike-viabilidade` (Fase 0 já mergeada nessa branch: `config`, `odds_math`, `probes/`). Trabalhe nessa branch.
- Windows. Rodar testes: `.\.venv\Scripts\python.exe -m pytest -q`. venv tem requests/python-dotenv/supabase/pytest/pandas(3.0.3).
- `.env` já populado com `APIFOOTBALL_KEY` (entre outras).
- **Forma REAL da API-Football** (confirmada ao vivo) para `/players?search=&league=&season=`:
  ```json
  {"response":[{"player":{"id":1100,"name":"E. Haaland"},
    "statistics":[{"team":{"name":"Manchester City"},"league":{"id":39,"name":"Premier League"},
      "games":{"appearences":32,"minutes":2556},"shots":{"total":98,"on":59},"goals":{"total":27}}]}]}
  ```
  E para `/fixtures/players?fixture=ID` (resultados por jogo): `response[].players[].{player:{id,name}, statistics:[{games:{minutes}, shots:{total,on}}]}`.
- Free tier: seasons **2022-2024** apenas; **100 req/dia**. Por isso o cache local é obrigatório.

## Estrutura de arquivos (nova)
```
src/odd_analyzer/
  cache.py                 # cache JSON local (gitignored)
  stats/
    __init__.py
    apifootball.py         # cliente + parser de SoT por jogador/jogo
  model/
    __init__.py
    sot_model.py           # Poisson/NegBin puros: lambda, P(>=linha)
    shrinkage.py           # encolhimento empírico-bayesiano da taxa
  backtest/
    __init__.py
    calibration.py         # Brier + reliability bins (puro)
    run_backtest.py        # integração ao vivo (gated em chave)
tests/
  fixtures/apifootball_players_sample.json
  fixtures/apifootball_fixture_players_sample.json
  test_apifootball.py
  test_sot_model.py
  test_shrinkage.py
  test_calibration.py
  test_cache.py
```

---

## Task 1: Ajuste de dependências + gitignore

**Files:** Modify `requirements.txt`, `.gitignore`

> Pivotamos do FBref/soccerdata para API-Football. `soccerdata` nunca instalou (sem wheel p/ 3.14) e não é mais usado. `pandas` fica só pelo probe legado de Fase 0; despinar para instalar no 3.14.

- [ ] **Step 1:** Editar `requirements.txt` para:
```
requests==2.32.3
python-dotenv==1.0.1
supabase==2.9.1
pandas
pytest==8.3.4
```
(removido `soccerdata==1.8.7`; `pandas` despinado.)

- [ ] **Step 2:** Acrescentar ao `.gitignore`:
```
.cache_api/
```

- [ ] **Step 3:** Rodar `.\.venv\Scripts\python.exe -m pytest -q` (a suíte da Fase 0 deve continuar verde, 18 testes).

- [ ] **Step 4:** Commit:
```bash
git add requirements.txt .gitignore
git commit -m "chore: pivota deps p/ API-Football (remove soccerdata, despina pandas)"
```

---

## Task 2: Modelo SOT em Python puro (Poisson/NegBin)

**Files:** Create `src/odd_analyzer/model/__init__.py` (vazio), `src/odd_analyzer/model/sot_model.py`; Test `tests/test_sot_model.py`

- [ ] **Step 1:** Criar `src/odd_analyzer/model/__init__.py` (vazio).

- [ ] **Step 2:** Teste que falha `tests/test_sot_model.py`:
```python
import math
import pytest
from odd_analyzer.model.sot_model import expected_lambda, prob_at_least, prob_over_line

def test_expected_lambda():
    # 2.0 SoT/90 em 45 min -> 1.0 esperado
    assert expected_lambda(2.0, 45) == pytest.approx(1.0)

def test_poisson_prob_at_least():
    # Poisson mu=2: P(X>=2) = 1 - 3*e^-2
    esperado = 1 - 3*math.exp(-2)
    assert prob_at_least(2.0, 2) == pytest.approx(esperado, abs=1e-9)

def test_prob_at_least_zero_e_um():
    assert prob_at_least(1.5, 0) == 1.0
    assert prob_at_least(1.5, 1) == pytest.approx(1 - math.exp(-1.5), abs=1e-9)

def test_prob_over_line_meia():
    # over 1.5 == P(X>=2)
    assert prob_over_line(2.0, 1.5) == pytest.approx(prob_at_least(2.0, 2), abs=1e-12)

def test_negbin_aproxima_poisson_quando_r_grande():
    # r grande -> NegBin ~ Poisson
    assert prob_at_least(2.0, 3, r=100000) == pytest.approx(prob_at_least(2.0, 3), abs=1e-3)

def test_negbin_mais_disperso_engrossa_cauda():
    # com overdispersion (r pequeno), P de valores altos sobe vs Poisson
    assert prob_at_least(2.0, 5, r=2) > prob_at_least(2.0, 5)
```

- [ ] **Step 3:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_sot_model.py -v` → FAIL.

- [ ] **Step 4:** Implementar `src/odd_analyzer/model/sot_model.py`:
```python
import math

def expected_lambda(sot_per90: float, expected_minutes: float) -> float:
    """Taxa esperada de SOT na partida = SoT/90 * minutos/90."""
    return sot_per90 * expected_minutes / 90.0

def _poisson_pmf(k: int, mu: float) -> float:
    return math.exp(-mu) * mu**k / math.factorial(k)

def _nbinom_pmf(k: int, r: float, mu: float) -> float:
    # NB2: media mu, dispersao r (>0). p = r/(r+mu).
    p = r / (r + mu)
    log = (math.lgamma(k + r) - math.lgamma(r) - math.lgamma(k + 1)
           + r * math.log(p) + k * math.log(1 - p))
    return math.exp(log)

def prob_at_least(mu: float, k: int, r: float | None = None) -> float:
    """P(X >= k). r=None -> Poisson; r>0 -> Binomial Negativa (overdispersion)."""
    if k <= 0:
        return 1.0
    pmf = (lambda i: _poisson_pmf(i, mu)) if r is None else (lambda i: _nbinom_pmf(i, r, mu))
    cum = sum(pmf(i) for i in range(0, k))  # P(X <= k-1)
    return max(0.0, 1.0 - cum)

def prob_over_line(mu: float, line: float, r: float | None = None) -> float:
    """P de bater uma linha over/under. Ex.: over 1.5 == P(X >= 2)."""
    k = math.floor(line) + 1
    return prob_at_least(mu, k, r)
```

- [ ] **Step 5:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_sot_model.py -v` → PASS (6 passed).

- [ ] **Step 6:** Commit:
```bash
git add src/odd_analyzer/model/__init__.py src/odd_analyzer/model/sot_model.py tests/test_sot_model.py
git commit -m "feat: modelo SOT Poisson/NegBin em Python puro"
```

---

## Task 3: Shrinkage da taxa-base (empírico-bayesiano)

**Files:** Create `src/odd_analyzer/model/shrinkage.py`; Test `tests/test_shrinkage.py`

> Amostras pequenas (poucos jogos) dão SoT/90 instável. Encolhe-se para um prior (média da posição/liga).

- [ ] **Step 1:** Teste que falha `tests/test_shrinkage.py`:
```python
import pytest
from odd_analyzer.model.shrinkage import shrink_rate

def test_sem_amostra_volta_o_prior():
    assert shrink_rate(rate=5.0, apps=0, prior_rate=1.0, prior_strength=8) == pytest.approx(1.0)

def test_amostra_grande_domina_o_prior():
    # 100 jogos a 2.0, prior fraco -> perto de 2.0
    assert shrink_rate(2.0, 100, 1.0, 8) == pytest.approx((100*2.0 + 8*1.0)/108)

def test_mistura_ponderada():
    assert shrink_rate(3.0, 2, 1.0, 8) == pytest.approx((2*3.0 + 8*1.0)/10)
```

- [ ] **Step 2:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_shrinkage.py -v` → FAIL.

- [ ] **Step 3:** Implementar `src/odd_analyzer/model/shrinkage.py`:
```python
def shrink_rate(rate: float, apps: int, prior_rate: float, prior_strength: float) -> float:
    """Média ponderada entre a taxa do jogador (peso = nº de jogos) e o prior
    (peso = prior_strength). Com apps=0, retorna o prior."""
    return (apps * rate + prior_strength * prior_rate) / (apps + prior_strength)
```

- [ ] **Step 4:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_shrinkage.py -v` → PASS (3 passed).

- [ ] **Step 5:** Commit:
```bash
git add src/odd_analyzer/model/shrinkage.py tests/test_shrinkage.py
git commit -m "feat: shrinkage empirico-bayesiano da taxa de SOT"
```

---

## Task 4: Métricas de calibração (Brier + reliability bins)

**Files:** Create `src/odd_analyzer/backtest/__init__.py` (vazio), `src/odd_analyzer/backtest/calibration.py`; Test `tests/test_calibration.py`

- [ ] **Step 1:** Criar `src/odd_analyzer/backtest/__init__.py` (vazio).

- [ ] **Step 2:** Teste que falha `tests/test_calibration.py`:
```python
import pytest
from odd_analyzer.backtest.calibration import brier_score, reliability_bins

def test_brier_perfeito_e_zero():
    assert brier_score([1.0, 0.0], [1, 0]) == pytest.approx(0.0)

def test_brier_valor_conhecido():
    # preds 0.5/0.5, actuals 1/0 -> ((0.5)^2 + (0.5)^2)/2 = 0.25
    assert brier_score([0.5, 0.5], [1, 0]) == pytest.approx(0.25)

def test_reliability_bins_agrupa_e_mede():
    preds = [0.05, 0.15, 0.16, 0.95]
    actuals = [0, 0, 1, 1]
    bins = reliability_bins(preds, actuals, n_bins=10)
    # bin 0 (0.0-0.1): 1 amostra, actual 0; bin 1 (0.1-0.2): 2 amostras, actual médio 0.5; bin 9: 1 amostra actual 1
    by = {b["bin"]: b for b in bins}
    assert by[1]["count"] == 2
    assert by[1]["mean_actual"] == pytest.approx(0.5)
    assert by[1]["mean_pred"] == pytest.approx((0.15+0.16)/2)
    assert by[9]["mean_actual"] == pytest.approx(1.0)
```

- [ ] **Step 3:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_calibration.py -v` → FAIL.

- [ ] **Step 4:** Implementar `src/odd_analyzer/backtest/calibration.py`:
```python
def brier_score(preds: list[float], actuals: list[int]) -> float:
    """Erro quadrático médio entre probabilidade prevista e resultado (0/1).
    Menor = melhor; 0 = perfeito."""
    if not preds:
        raise ValueError("preds vazio")
    return sum((p - a) ** 2 for p, a in zip(preds, actuals)) / len(preds)

def reliability_bins(preds: list[float], actuals: list[int], n_bins: int = 10) -> list[dict]:
    """Agrupa previsões em n_bins faixas [0,1] e mede prob média prevista vs
    frequência real. Bom modelo: mean_pred ≈ mean_actual em cada bin."""
    buckets = [[] for _ in range(n_bins)]
    for p, a in zip(preds, actuals):
        idx = min(int(p * n_bins), n_bins - 1)
        buckets[idx].append((p, a))
    out = []
    for i, b in enumerate(buckets):
        if not b:
            continue
        out.append({
            "bin": i,
            "mean_pred": sum(p for p, _ in b) / len(b),
            "mean_actual": sum(a for _, a in b) / len(b),
            "count": len(b),
        })
    return out
```

- [ ] **Step 5:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_calibration.py -v` → PASS (3 passed).

- [ ] **Step 6:** Commit:
```bash
git add src/odd_analyzer/backtest/__init__.py src/odd_analyzer/backtest/calibration.py tests/test_calibration.py
git commit -m "feat: metricas de calibracao (Brier + reliability bins)"
```

---

## Task 5: Cache JSON local

**Files:** Create `src/odd_analyzer/cache.py`; Test `tests/test_cache.py`

> Free tier = 100 req/dia. O cache evita re-buscar a mesma chamada (ex.: ao re-rodar o backtest).

- [ ] **Step 1:** Teste que falha `tests/test_cache.py`:
```python
from odd_analyzer.cache import cached_get

def test_cacheia_e_nao_refaz(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"valor": 42}
    a = cached_get("chave-x", fetch, cache_dir=tmp_path)
    b = cached_get("chave-x", fetch, cache_dir=tmp_path)
    assert a == b == {"valor": 42}
    assert chamadas["n"] == 1  # segunda veio do cache

def test_chaves_diferentes_buscam_separado(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return chamadas["n"]
    cached_get("a", fetch, cache_dir=tmp_path)
    cached_get("b", fetch, cache_dir=tmp_path)
    assert chamadas["n"] == 2
```

- [ ] **Step 2:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_cache.py -v` → FAIL.

- [ ] **Step 3:** Implementar `src/odd_analyzer/cache.py`:
```python
import json
import hashlib
from pathlib import Path

_DEFAULT_DIR = Path(__file__).resolve().parents[2] / ".cache_api"

def cached_get(key: str, fetch, cache_dir: Path | None = None):
    """Retorna do cache local se existir; senão chama fetch(), grava e retorna.
    `key` identifica a chamada (ex.: a URL completa com params)."""
    d = Path(cache_dir) if cache_dir is not None else _DEFAULT_DIR
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    path = d / f"{h}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    data = fetch()
    d.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data
```

- [ ] **Step 4:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_cache.py -v` → PASS (2 passed).

- [ ] **Step 5:** Commit:
```bash
git add src/odd_analyzer/cache.py tests/test_cache.py
git commit -m "feat: cache JSON local p/ respeitar 100 req/dia"
```

---

## Task 6: Cliente + parser da API-Football (stats de jogador)

**Files:** Create `tests/fixtures/apifootball_players_sample.json`, `src/odd_analyzer/stats/__init__.py` (vazio), `src/odd_analyzer/stats/apifootball.py`; Test `tests/test_apifootball.py`

- [ ] **Step 1:** Fixture `tests/fixtures/apifootball_players_sample.json` (forma REAL):
```json
{"response":[
  {"player":{"id":1100,"name":"E. Haaland"},
   "statistics":[
     {"team":{"name":"Manchester City"},"league":{"id":39,"name":"Premier League"},
      "games":{"appearences":32,"minutes":2556},"shots":{"total":98,"on":59},"goals":{"total":27}},
     {"team":{"name":"Norway"},"league":{"id":5,"name":"UEFA Nations League"},
      "games":{"appearences":6,"minutes":536},"shots":{"total":28,"on":14},"goals":{"total":5}}
   ]},
  {"player":{"id":999,"name":"J. Reserva"},
   "statistics":[
     {"team":{"name":"Wolves"},"league":{"id":39,"name":"Premier League"},
      "games":{"appearences":0,"minutes":0},"shots":{"total":null,"on":null},"goals":{"total":null}}
   ]}
]}
```

- [ ] **Step 2:** Criar `src/odd_analyzer/stats/__init__.py` (vazio).

- [ ] **Step 3:** Teste que falha `tests/test_apifootball.py`:
```python
import json
from pathlib import Path
import pytest
from odd_analyzer.stats.apifootball import parse_player_sot

FIX = Path(__file__).parent / "fixtures" / "apifootball_players_sample.json"

def players():
    return json.loads(FIX.read_text(encoding="utf-8"))["response"]

def test_extrai_sot_per90_da_liga_certa():
    p = parse_player_sot(players()[0], league_id=39)
    assert p["player_id"] == 1100
    assert p["shots_on"] == 59
    assert p["minutes"] == 2556
    assert p["sot_per90"] == pytest.approx(59/2556*90, abs=1e-6)

def test_liga_inexistente_retorna_none():
    assert parse_player_sot(players()[0], league_id=140) is None

def test_minutos_zero_ou_shots_none_retorna_none():
    assert parse_player_sot(players()[1], league_id=39) is None
```

- [ ] **Step 4:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_apifootball.py -v` → FAIL.

- [ ] **Step 5:** Implementar `src/odd_analyzer/stats/apifootball.py`:
```python
import requests
from odd_analyzer.config import get_required

BASE = "https://v3.football.api-sports.io"

def parse_player_sot(player_entry: dict, league_id: int) -> dict | None:
    """Extrai a taxa de SOT por 90 de um jogador para uma liga específica.
    Retorna None se a liga não estiver presente ou faltar dado (minutos/shots)."""
    pid = player_entry.get("player", {}).get("id")
    name = player_entry.get("player", {}).get("name")
    for s in player_entry.get("statistics", []):
        if (s.get("league") or {}).get("id") != league_id:
            continue
        minutes = (s.get("games") or {}).get("minutes")
        shots_on = (s.get("shots") or {}).get("on")
        if not minutes or shots_on is None:
            return None
        return {
            "player_id": pid,
            "name": name,
            "team": (s.get("team") or {}).get("name"),
            "minutes": minutes,
            "apps": (s.get("games") or {}).get("appearences"),
            "shots_total": (s.get("shots") or {}).get("total"),
            "shots_on": shots_on,
            "sot_per90": shots_on / minutes * 90.0,
        }
    return None

def fetch_players_page(league_id: int, season: int, page: int = 1) -> dict:
    """Busca uma página de /players (estatísticas de jogador da liga/temporada)."""
    key = get_required("APIFOOTBALL_KEY")
    r = requests.get(f"{BASE}/players",
                     params={"league": str(league_id), "season": str(season), "page": str(page)},
                     headers={"x-apisports-key": key}, timeout=30)
    r.raise_for_status()
    return r.json()
```

- [ ] **Step 6:** Rodar `.\.venv\Scripts\python.exe -m pytest tests/test_apifootball.py -v` → PASS (3 passed).

- [ ] **Step 7:** Commit:
```bash
git add tests/fixtures/apifootball_players_sample.json src/odd_analyzer/stats/__init__.py src/odd_analyzer/stats/apifootball.py tests/test_apifootball.py
git commit -m "feat: cliente + parser de SoT/90 da API-Football"
```

---

## Task 7: Runner do backtest de calibração (integração ao vivo)

**Files:** Create `src/odd_analyzer/backtest/run_backtest.py`

> Integração ao vivo (usa a chave + cache). Lógica já coberta pelos testes das Tasks 2-6. Roda incremental para respeitar 100 req/dia. **NÃO tem teste unitário** (orquestração de I/O); valida-se rodando.

- [ ] **Step 1:** Implementar `src/odd_analyzer/backtest/run_backtest.py`:
```python
"""Backtest de calibração do modelo de SOT em jogos de clube (free: seasons 2022-2024).

Estratégia: (1) puxa as taxas-base de SoT/90 dos jogadores da liga/temporada;
(2) para uma amostra de jogos, pega o SOT REAL de cada jogador naquele jogo e os
minutos jogados; (3) prevê P(SOT >= linha) ANTES do jogo usando a taxa-base do
jogador e os minutos REAIS daquele jogo (isola o modelo de taxa do problema de
projeção de minutos); (4) compara previsão vs resultado e mede calibração.

Linhas testadas: over 0.5 e over 1.5 SOT (as mais comuns em props).
Uso: PYTHONPATH=src python -m odd_analyzer.backtest.run_backtest <league_id> <season> <n_fixtures>
"""
import sys
from odd_analyzer.config import get_required
from odd_analyzer.cache import cached_get
from odd_analyzer.stats.apifootball import BASE, parse_player_sot
from odd_analyzer.model.sot_model import expected_lambda, prob_over_line
from odd_analyzer.model.shrinkage import shrink_rate
from odd_analyzer.backtest.calibration import brier_score, reliability_bins
import requests

LINHAS = [0.5, 1.5]
PRIOR_RATE = 1.0      # SoT/90 médio de prior (ajustável)
PRIOR_STRENGTH = 6    # peso do prior (em "jogos equivalentes")
NB_DISPERSION = 4.0   # r da Binomial Negativa (overdispersion moderada)

def _get(path, params):
    key = get_required("APIFOOTBALL_KEY")
    keystr = f"{path}?{sorted(params.items())}"
    def fetch():
        r = requests.get(f"{BASE}/{path}", params=params,
                         headers={"x-apisports-key": key}, timeout=30)
        r.raise_for_status()
        return r.json()
    return cached_get(keystr, fetch)

def base_rates(league_id, season):
    """Mapa player_id -> sot_per90 (com shrinkage), varrendo todas as páginas em cache."""
    rates = {}
    page = 1
    while True:
        j = _get("players", {"league": league_id, "season": season, "page": page})
        for entry in j.get("response", []):
            p = parse_player_sot(entry, league_id)
            if p:
                rates[p["player_id"]] = shrink_rate(p["sot_per90"], p["apps"], PRIOR_RATE, PRIOR_STRENGTH)
        paging = j.get("paging", {})
        if page >= paging.get("total", 1):
            break
        page += 1
    return rates

def run(league_id, season, n_fixtures):
    rates = base_rates(league_id, season)
    print(f"taxas-base carregadas: {len(rates)} jogadores")
    fj = _get("fixtures", {"league": league_id, "season": season})
    fixtures = [f["fixture"]["id"] for f in fj.get("response", [])][:n_fixtures]
    print(f"jogos no backtest: {len(fixtures)}")
    preds = {l: [] for l in LINHAS}
    actuals = {l: [] for l in LINHAS}
    for fid in fixtures:
        pj = _get("fixtures/players", {"fixture": fid})
        for team in pj.get("response", []):
            for pl in team.get("players", []):
                pid = pl["player"]["id"]
                st = (pl.get("statistics") or [{}])[0]
                minutes = (st.get("games") or {}).get("minutes")
                sot = (st.get("shots") or {}).get("on")
                if pid not in rates or not minutes or sot is None:
                    continue
                mu = expected_lambda(rates[pid], minutes)
                for l in LINHAS:
                    preds[l].append(prob_over_line(mu, l, r=NB_DISPERSION))
                    actuals[l].append(1 if sot > l else 0)
    for l in LINHAS:
        if not preds[l]:
            print(f"\nlinha over {l}: sem amostra"); continue
        print(f"\n=== linha over {l} SOT | n={len(preds[l])} ===")
        print(f"Brier: {brier_score(preds[l], actuals[l]):.4f}  (menor = melhor; chute 'sempre a base' ~0.25)")
        print("reliability (bin: prev_média -> real_média, n):")
        for b in reliability_bins(preds[l], actuals[l]):
            print(f"  {b['bin']/10:.1f}-{(b['bin']+1)/10:.1f}: {b['mean_pred']:.3f} -> {b['mean_actual']:.3f}  (n={b['count']})")

def main():
    league = int(sys.argv[1]) if len(sys.argv) > 1 else 39      # 39 = Premier League
    season = int(sys.argv[2]) if len(sys.argv) > 2 else 2023
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    run(league, season, n)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2 (AO VIVO):** rodar incremental respeitando 100 req/dia. Começar pequeno:
```
$env:PYTHONPATH='src'; .\.venv\Scripts\python.exe -m odd_analyzer.backtest.run_backtest 39 2023 10
```
Expected: imprime taxas-base carregadas, Brier e a curva de calibração para over 0.5 e over 1.5. **Cada jogo = 1 req** (cacheada); as páginas de /players também. Se bater no limite diário (HTTP 499/ "limit"), parar e continuar no dia seguinte (o cache preserva o progresso). Ampliar `n` conforme o limite permitir.

- [ ] **Step 3:** Interpretar: se `mean_pred ≈ mean_actual` em cada bin (curva perto da diagonal) e Brier < 0.25, **o modelo é bem calibrado** → seguir p/ Fase 1b (de-vig/EV/CLV quando odds entrarem). Se mal calibrado → ajustar `NB_DISPERSION`, `PRIOR_*`, e considerar ajuste por adversário/mando antes de prosseguir.

- [ ] **Step 4:** Commit:
```bash
git add src/odd_analyzer/backtest/run_backtest.py
git commit -m "feat: runner do backtest de calibracao (API-Football, incremental)"
```

---

## Critério de conclusão da Fase 1a

`run_backtest` roda end-to-end e produz uma curva de calibração + Brier para over 0.5 e over 1.5 SOT, em ≥ alguns jogos de clube de 2023. O resultado diz se o modelo de taxa (NegBin + shrinkage) é bem calibrado **antes** de qualquer dependência de odds. Isso decide se a tese de valor tem chão — e só então (com as odds da Copa ~10/jun) montamos a Fase 1b (de-vig/EV/CLV).

---

## Self-Review (autor do plano)

- **Cobertura:** modelo (Task 2), shrinkage (3), calibração (4), cache (5), stats client/parser (6), runner (7). Cada deliverable do objetivo tem task. ✔
- **Placeholders:** nenhum TODO; todo passo de código tem código completo. Fixtures baseados na forma REAL observada ao vivo. ✔
- **Consistência de tipos:** `parse_player_sot`→dict com `sot_per90`/`apps`; `expected_lambda(sot_per90,minutes)`; `prob_over_line(mu,line,r)`; `shrink_rate(rate,apps,prior_rate,prior_strength)`; `brier_score`/`reliability_bins(preds,actuals)`. Usados de forma consistente no `run_backtest`. ✔
- **Dep nova?** Nenhuma — estatística em stdlib (`math`); evita scipy/pandas (sem wheel p/ Python 3.14). ✔
- **Limite 100 req/dia:** mitigado por `cached_get`; runner é incremental. ✔
