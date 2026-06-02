# Validação Offline (Portão 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar o motor de valor offline ($0): (a) round-trip de odd sintética garante que de-vig/EV não têm bug de sinal/normalização; (b) calibração determinística + métricas mais ricas (log-loss, ECE, Brier skill score) deixam a honestidade do modelo visível sem chamar API — o que o Portão 1 precisa antes de gastar os $19.

**Architecture:** Quatro mudanças isoladas, todas em Python stdlib, todas testáveis offline. (1) Centraliza os parâmetros do modelo num módulo só (mata o `NB_DISPERSION=3.0` duplicado entre `pipeline.py` e `run_backtest.py`). (2) Novo módulo `value/synthetic.py` que injeta vig numa prob conhecida; testes provam que `devig.py`/`ev.py` invertem a injeção. (3) Estende `backtest/calibration.py` com log-loss/ECE/skill. (4) Extrai a função pura `score_records` de `run_backtest.run()` para a calibração rodar em CI a partir de dados fixos (sem rede).

**Tech Stack:** Python 3.14, pytest, stdlib só (`math`). Sem libs novas. Rodar testes: `.venv\Scripts\python.exe -m pytest`.

**Pré-requisito de execução:** criar branch de feature antes da Task 1:
```bash
git checkout main && git checkout -b feat/validacao-offline-portao1
```

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/odd_analyzer/model/params.py` | Fonte única dos parâmetros do modelo de contagem | **Criar** |
| `src/odd_analyzer/pipeline.py` | Importar `NB_DISPERSION` de `params` (remover literal) | Modificar |
| `src/odd_analyzer/backtest/run_backtest.py` | Importar params; extrair `score_records` pura | Modificar |
| `src/odd_analyzer/value/synthetic.py` | Gerar odds sintéticas (vig injetado) p/ testes | **Criar** |
| `src/odd_analyzer/backtest/calibration.py` | + `log_loss`, `expected_calibration_error`, `brier_skill_score` | Modificar |
| `tests/test_params.py` | Garante que os módulos compartilham o mesmo `NB_DISPERSION` | **Criar** |
| `tests/test_devig_roundtrip.py` | Round-trip vig→de-vig + sinais de edge/EV | **Criar** |
| `tests/test_calibration.py` | + testes das 3 métricas novas | Modificar |
| `tests/test_run_backtest.py` | `score_records` determinística sobre dataset fixo | **Criar** |

---

## Task 1: Centralizar parâmetros do modelo

Remove a duplicação do `NB_DISPERSION=3.0` (hoje em `pipeline.py:11` e `run_backtest.py:28`) e dos priors. Uma fonte só evita drift na recalibração.

**Files:**
- Create: `src/odd_analyzer/model/params.py`
- Modify: `src/odd_analyzer/pipeline.py:11`
- Modify: `src/odd_analyzer/backtest/run_backtest.py:24-29`
- Test: `tests/test_params.py`

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/test_params.py`:
```python
from odd_analyzer.model import params
from odd_analyzer import pipeline
from odd_analyzer.backtest import run_backtest

def test_params_valores():
    assert params.NB_DISPERSION == 3.0
    assert params.PRIOR_RATE == 0.4
    assert params.PRIOR_STRENGTH == 12
    assert params.MIN_OTHER_MINUTES == 60
    assert params.LINHAS == [0.5, 1.5]

def test_dispersion_e_a_mesma_fonte():
    # pipeline e backtest devem ler o MESMO valor de params (sem literal solto)
    assert pipeline.NB_DISPERSION == params.NB_DISPERSION
    assert run_backtest.NB_DISPERSION == params.NB_DISPERSION
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_params.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'odd_analyzer.model.params'`.

- [ ] **Step 3: Criar o módulo de params**

Create `src/odd_analyzer/model/params.py`:
```python
"""Parâmetros do modelo de contagem, em UM lugar (evita drift entre o backtest e o
pipeline). Calibrados no backtest EPL 2023 (over-prediction corrigida)."""

NB_DISPERSION = 3.0      # r da Binomial Negativa (overdispersion)
PRIOR_RATE = 0.4         # SoT/90 do prior (baixo: maioria chuta pouco)
PRIOR_STRENGTH = 12      # peso do prior em "jogos equivalentes" (encolhe amostra pequena)
MIN_OTHER_MINUTES = 60   # mínimo de minutos leave-one-out p/ estimar a taxa
LINHAS = [0.5, 1.5]      # linhas over/under avaliadas no backtest
```

- [ ] **Step 4: Apontar `pipeline.py` para o params**

In `src/odd_analyzer/pipeline.py`, replace line 11:
```python
NB_DISPERSION = 3.0  # mesmo r usado no backtest da Fase 1a
```
with:
```python
from odd_analyzer.model.params import NB_DISPERSION  # fonte única (mesmo r do backtest)
```
(Deixe o resto do arquivo igual; `prob_over_line(..., r=NB_DISPERSION)` continua válido.)

- [ ] **Step 5: Apontar `run_backtest.py` para o params**

In `src/odd_analyzer/backtest/run_backtest.py`, replace lines 24-29:
```python
LINHAS = [0.5, 1.5]
# Parâmetros calibrados no backtest EPL 2023 (over-prediction corrigida):
PRIOR_RATE = 0.4         # SoT/90 do prior (baixo: maioria dos jogadores chuta pouco)
PRIOR_STRENGTH = 12      # peso do prior (em "jogos equivalentes") — encolhe amostras pequenas
NB_DISPERSION = 3.0      # r da Binomial Negativa (overdispersion)
MIN_OTHER_MINUTES = 60   # mínimo de minutos "fora" do jogo p/ estimar a taxa (leave-one-out)
```
with:
```python
from odd_analyzer.model.params import (
    LINHAS, PRIOR_RATE, PRIOR_STRENGTH, NB_DISPERSION, MIN_OTHER_MINUTES,
)
```
(Mantenha `_MIN_INTERVAL = 6.5` e `_last_call = [0.0]` logo abaixo — não fazem parte dos params do modelo.)

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_params.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: Rodar a suíte inteira (nada quebrou no import)**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: todos passam (97 + 2 novos).

- [ ] **Step 8: Commit**

```bash
git add src/odd_analyzer/model/params.py src/odd_analyzer/pipeline.py src/odd_analyzer/backtest/run_backtest.py tests/test_params.py
git commit -m "refactor: centraliza params do modelo (NB_DISPERSION/priors) em model/params.py"
```

---

## Task 2: Odds sintéticas + round-trip de-vig/EV

Prova que `devig.py` inverte exatamente a injeção de vig e que `ev.py` dá o sinal certo. É a checagem mais barata e de maior alavanca: pega bug de sinal/normalização antes de qualquer dado real.

**Files:**
- Create: `src/odd_analyzer/value/synthetic.py`
- Test: `tests/test_devig_roundtrip.py`
- Referência (não modificar): `src/odd_analyzer/value/devig.py`, `src/odd_analyzer/value/ev.py`

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/test_devig_roundtrip.py`:
```python
import pytest
from odd_analyzer.value.synthetic import fair_odds, inject_vig_multiplicative, inject_vig_power
from odd_analyzer.value.devig import devig_multiplicative, devig_power
from odd_analyzer.value.ev import edge_ev

PROBS = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]
OVERROUNDS = [0.0, 0.02, 0.05, 0.10]

def test_fair_odds_sao_inversa_da_prob():
    oo, ou = fair_odds(0.4)
    assert oo == pytest.approx(1 / 0.4)
    assert ou == pytest.approx(1 / 0.6)

@pytest.mark.parametrize("p", PROBS)
@pytest.mark.parametrize("m", OVERROUNDS)
def test_multiplicativo_roundtrip_recupera_p(p, m):
    # injeta vig multiplicativo e confirma que devig_multiplicative recupera p
    oo, ou = inject_vig_multiplicative(p, m)
    po, pu = devig_multiplicative(oo, ou)
    assert po == pytest.approx(p, abs=1e-9)
    assert po + pu == pytest.approx(1.0, abs=1e-9)

@pytest.mark.parametrize("p", PROBS)
@pytest.mark.parametrize("k", [1.02, 1.05, 1.1, 1.3])
def test_power_roundtrip_recupera_p(p, k):
    # injeta vig via power e confirma que devig_power recupera p (k>1 => vig>0)
    oo, ou = inject_vig_power(p, k)
    po, pu = devig_power(oo, ou)
    assert po == pytest.approx(p, abs=1e-6)
    assert po + pu == pytest.approx(1.0, abs=1e-6)

@pytest.mark.parametrize("p", PROBS)
@pytest.mark.parametrize("m", [0.02, 0.05, 0.10])
def test_aposta_justa_tem_ev_negativo_igual_ao_vig(p, m):
    # modelo == prob justa: apostar o over na odd VIGADA dá EV = -m/(1+m)
    oo, ou = inject_vig_multiplicative(p, m)
    po, _ = devig_multiplicative(oo, ou)   # == p
    r = edge_ev(prob_modelo=po, prob_devig=po, odd_decimal=oo)
    assert r["edge"] == pytest.approx(0.0, abs=1e-9)
    assert r["ev"] == pytest.approx(-m / (1 + m), abs=1e-9)

def test_mispricing_injetado_tem_sinal_certo():
    # mercado justo em p_true=0.5 sem vig; modelo acha 0.58 -> edge>0, EV>0
    p_true = 0.5
    oo, ou = fair_odds(p_true)
    po, _ = devig_multiplicative(oo, ou)   # == 0.5
    bom = edge_ev(prob_modelo=0.58, prob_devig=po, odd_decimal=oo)
    assert bom["edge"] == pytest.approx(0.08, abs=1e-9)
    assert bom["ev"] > 0
    # modelo abaixo do justo -> edge<0, EV<0
    ruim = edge_ev(prob_modelo=0.42, prob_devig=po, odd_decimal=oo)
    assert ruim["edge"] == pytest.approx(-0.08, abs=1e-9)
    assert ruim["ev"] < 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_devig_roundtrip.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'odd_analyzer.value.synthetic'`.

- [ ] **Step 3: Implementar `value/synthetic.py`**

Create `src/odd_analyzer/value/synthetic.py`:
```python
"""Gera odds decimais sintéticas a partir de uma probabilidade 'verdadeira' + vig
injetado. Uso EXCLUSIVO em testes: prova que o de-vig inverte a injeção de margem,
sem rede/API. Cada injeção é o inverso exato de um método de de-vig em devig.py."""

def fair_odds(p_over: float) -> tuple[float, float]:
    """Odds decimais JUSTAS (sem vig) de um mercado 2-way com prob over = p_over."""
    if not 0.0 < p_over < 1.0:
        raise ValueError(f"p_over deve estar em (0,1), recebido {p_over}")
    return 1.0 / p_over, 1.0 / (1.0 - p_over)

def inject_vig_multiplicative(p_over: float, overround: float) -> tuple[float, float]:
    """Inverso de devig_multiplicative: escala as implícitas justas p/ somarem
    (1+overround) mantendo a razão. devig_multiplicative das odds devolvidas recupera
    p_over exatamente."""
    if not 0.0 < p_over < 1.0:
        raise ValueError(f"p_over deve estar em (0,1), recebido {p_over}")
    if overround < 0:
        raise ValueError("overround deve ser >= 0")
    qo = p_over * (1.0 + overround)         # implícita quotada do over
    qu = (1.0 - p_over) * (1.0 + overround) # implícita quotada do under
    return 1.0 / qo, 1.0 / qu

def inject_vig_power(p_over: float, k: float) -> tuple[float, float]:
    """Inverso de devig_power: implícita quotada q_i = p_i**(1/k). Como q_o**k + q_u**k
    = p_over + (1-p_over) = 1, devig_power recupera p_over. k>1 => overround>0."""
    if not 0.0 < p_over < 1.0:
        raise ValueError(f"p_over deve estar em (0,1), recebido {p_over}")
    if k <= 0:
        raise ValueError("k deve ser > 0")
    qo = p_over ** (1.0 / k)
    qu = (1.0 - p_over) ** (1.0 / k)
    return 1.0 / qo, 1.0 / qu
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_devig_roundtrip.py -q`
Expected: PASS (todos os parametrizados verdes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/value/synthetic.py tests/test_devig_roundtrip.py
git commit -m "test: round-trip de odd sintetica prova de-vig/EV (sinal e normalizacao)"
```

---

## Task 3: Métricas de calibração extra (log-loss, ECE, Brier skill)

`calibration.py` só tem Brier + reliability bins. Adiciona as métricas que o Portão 1 usa de barra (ECE < ~0.05, skill > 0) sem quebrar as existentes.

**Files:**
- Modify: `src/odd_analyzer/backtest/calibration.py`
- Test: `tests/test_calibration.py` (adicionar)

- [ ] **Step 1: Escrever os testes que falham**

Append to `tests/test_calibration.py`:
```python
import math
from odd_analyzer.backtest.calibration import (
    log_loss, expected_calibration_error, brier_skill_score,
)

def test_log_loss_perfeito_e_quase_zero():
    assert log_loss([1.0, 0.0], [1, 0]) == pytest.approx(0.0, abs=1e-10)

def test_log_loss_meio_a_meio():
    # preds 0.5 -> log loss = -ln(0.5) = ln(2)
    assert log_loss([0.5, 0.5], [1, 0]) == pytest.approx(math.log(2))

def test_log_loss_clipa_e_nao_estoura():
    # pred 0.0 mas actual 1 -> sem clip seria inf; com clip vira número grande finito
    val = log_loss([0.0], [1])
    assert math.isfinite(val) and val > 30

def test_ece_calibracao_perfeita_e_zero():
    assert expected_calibration_error([0.0, 1.0], [0, 1]) == pytest.approx(0.0)

def test_ece_descalibrado_e_positivo():
    # prevê 0.9 mas nunca acontece -> erro 0.9 no bin
    assert expected_calibration_error([0.9, 0.9], [0, 0]) == pytest.approx(0.9)

def test_brier_skill_perfeito_e_um():
    # preds perfeitos, base 0.5 -> brier_base 0.25, brier 0 -> skill 1
    assert brier_skill_score([1.0, 0.0], [1, 0]) == pytest.approx(1.0)

def test_brier_skill_chute_base_e_zero():
    base = 0.5
    assert brier_skill_score([base, base], [1, 0]) == pytest.approx(0.0)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_calibration.py -q`
Expected: FAIL com `ImportError: cannot import name 'log_loss'`.

- [ ] **Step 3: Implementar as métricas**

Append to `src/odd_analyzer/backtest/calibration.py`:
```python
import math

def log_loss(preds: list[float], actuals: list[int], eps: float = 1e-15) -> float:
    """Entropia cruzada média. Menor = melhor. Clipa p em [eps, 1-eps] p/ evitar log(0)
    (pune erro confiante mais que o Brier)."""
    if not preds:
        raise ValueError("preds vazio")
    total = 0.0
    for p, a in zip(preds, actuals):
        p = min(max(p, eps), 1 - eps)
        total += -(a * math.log(p) + (1 - a) * math.log(1 - p))
    return total / len(preds)

def expected_calibration_error(preds: list[float], actuals: list[int], n_bins: int = 10) -> float:
    """ECE = soma ponderada por bin de |mean_pred - mean_actual|. <~0.05 = bom.
    Reusa reliability_bins (mesma binagem)."""
    if not preds:
        raise ValueError("preds vazio")
    n = len(preds)
    return sum(b["count"] / n * abs(b["mean_pred"] - b["mean_actual"])
               for b in reliability_bins(preds, actuals, n_bins))

def brier_skill_score(preds: list[float], actuals: list[int]) -> float:
    """1 - Brier/Brier_base, onde base = prever sempre a freq média (climatologia).
    >0 = bate o chute-base (tem skill); <=0 = não agrega."""
    if not preds:
        raise ValueError("preds vazio")
    base = sum(actuals) / len(actuals)
    brier_base = sum((base - a) ** 2 for a in actuals) / len(actuals)
    if brier_base == 0:
        return 0.0
    return 1.0 - brier_score(preds, actuals) / brier_base
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_calibration.py -q`
Expected: PASS (3 antigos + 7 novos).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/calibration.py tests/test_calibration.py
git commit -m "feat(calibration): log-loss, ECE e Brier skill score"
```

---

## Task 4: Replay determinístico (`score_records` pura, sem rede)

Extrai o miolo de scoring de `run_backtest.run()` (hoje misturado com `print`/rede) para uma função pura testável. Permite rodar calibração em CI a partir de dados fixos, sem chamar a API-Football — o pré-requisito do replay $0.

**Files:**
- Modify: `src/odd_analyzer/backtest/run_backtest.py` (extrair `score_records`, usar no `run()`)
- Test: `tests/test_run_backtest.py`

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/test_run_backtest.py`:
```python
import pytest
from odd_analyzer.backtest.run_backtest import score_records

# dataset fixo: 2 jogadores, 3 jogos. records = (fid, pid, team_id, minutes, sot)
META = {1: (10, 20), 2: (10, 20), 3: (10, 20)}
RECORDS = [
    (1, 100, 10, 90, 2), (1, 200, 20, 90, 0),
    (2, 100, 10, 90, 1), (2, 200, 20, 90, 1),
    (3, 100, 10, 90, 3), (3, 200, 20, 90, 0),
]
CONCEDED = {10: 1.0, 20: 1.0}   # multiplicador de adversário neutro (= league_avg)
LEAGUE_AVG = 1.0

def _run():
    return score_records(META, RECORDS, CONCEDED, LEAGUE_AVG, 1.0, 1.0,
                         lines=[0.5, 1.5], min_other_minutes=60)

def test_score_records_conta_e_resultados():
    preds, actuals = _run()
    # cada jogador tem 2 outros jogos * 90 = 180 min fora >= 60 -> todos os 6 usados
    assert len(preds[0.5]) == 6
    assert len(preds[1.5]) == 6
    # actual = 1 se sot > linha. sot = [2,0,1,1,3,0]
    assert actuals[0.5] == [1, 0, 1, 1, 1, 0]   # sot >= 1
    assert actuals[1.5] == [1, 0, 0, 0, 1, 0]   # sot >= 2

def test_score_records_probabilidades_validas():
    preds, _ = _run()
    assert all(0.0 < p < 1.0 for p in preds[0.5])
    assert all(0.0 < p < 1.0 for p in preds[1.5])
    # P(over 0.5) >= P(over 1.5) para o mesmo registro (monotonicidade)
    assert all(a >= b - 1e-12 for a, b in zip(preds[0.5], preds[1.5]))

def test_score_records_determinista():
    assert _run() == _run()

def test_score_records_descarta_amostra_curta():
    # jogador com só 1 jogo: other_min=0 < 60 -> descartado
    meta = {1: (10, 20)}
    records = [(1, 100, 10, 90, 2), (1, 200, 20, 90, 0)]
    preds, actuals = score_records(meta, records, {10: 1.0, 20: 1.0}, 1.0, 1.0, 1.0,
                                   lines=[0.5], min_other_minutes=60)
    assert preds[0.5] == [] and actuals[0.5] == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_run_backtest.py -q`
Expected: FAIL com `ImportError: cannot import name 'score_records'`.

- [ ] **Step 3: Extrair `score_records` e usá-la no `run()`**

In `src/odd_analyzer/backtest/run_backtest.py`, add this function ABOVE `def run(...)` (after `collect_data`):
```python
def score_records(meta, records, conceded_pg, league_avg, home_factor, away_factor,
                  lines=LINHAS, prior_rate=PRIOR_RATE, prior_strength=PRIOR_STRENGTH,
                  nb_dispersion=NB_DISPERSION, min_other_minutes=MIN_OTHER_MINUTES):
    """PURA (sem rede): dos dados coletados -> ({linha: [preds]}, {linha: [actuals]}).
    Leave-one-out por jogador + shrinkage + ajustes; prevê P(SOT >= linha) via NegBin.
    Determinística — base do replay offline em CI."""
    tot_min, tot_sot, apps = {}, {}, {}
    for _, pid, _, m, s in records:
        tot_min[pid] = tot_min.get(pid, 0) + m
        tot_sot[pid] = tot_sot.get(pid, 0) + s
        apps[pid] = apps.get(pid, 0) + 1
    preds = {l: [] for l in lines}
    actuals = {l: [] for l in lines}
    for fid, pid, tid, m, s in records:
        other_min = tot_min[pid] - m            # taxa SEM o jogo previsto (leave-one-out)
        other_sot = tot_sot[pid] - s
        if other_min < min_other_minutes:
            continue
        rate = shrink_rate(other_sot / other_min * 90.0, apps[pid] - 1, prior_rate, prior_strength)
        mu = expected_lambda(rate, m)           # minutos REAIS (isola o modelo de taxa)
        home_id, away_id = meta[fid]
        opp = away_id if tid == home_id else home_id
        mu *= opponent_multiplier(conceded_pg.get(opp, league_avg), league_avg)
        mu *= home_away_multiplier(tid == home_id, home_factor, away_factor)
        for l in lines:
            preds[l].append(prob_over_line(mu, l, r=nb_dispersion))
            actuals[l].append(1 if s > l else 0)
    return preds, actuals
```

Then, in `run()`, replace the inline scoring block (currently lines ~114-135, from `tot_min, tot_sot, apps = {}, {}, {}` through `print(f"registros usados ...")`) with a call to the new function:
```python
        preds_a, actuals_a = score_records(
            meta, records, conceded_pg, league_avg, home_factor, away_factor)
        for l in LINHAS:
            preds[l] = preds_a[l]
            actuals[l] = actuals_a[l]
        print(f"registros usados (>= {MIN_OTHER_MINUTES}min fora): {len(preds[LINHAS[0]])}")
```
(The `preds`/`actuals` dicts initialized at the top of `run()` and the `try/except LimiteAtingido` wrapper stay as they are; only the scoring loop body is replaced.)

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_run_backtest.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Enriquecer o relatório do `run()` com as métricas novas (I/O, sem teste)**

In `run_backtest.py`, change the import on line 21:
```python
from odd_analyzer.backtest.calibration import brier_score, reliability_bins
```
to:
```python
from odd_analyzer.backtest.calibration import (
    brier_score, reliability_bins, log_loss, expected_calibration_error, brier_skill_score,
)
```
Then in the per-line report loop of `run()`, after the `Brier:` print line, add:
```python
        print(f"LogLoss: {log_loss(preds[l], actuals[l]):.4f}  | "
              f"ECE: {expected_calibration_error(preds[l], actuals[l]):.4f}  | "
              f"BrierSkill: {brier_skill_score(preds[l], actuals[l]):.3f}  (>0 bate o chute-base)")
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: tudo verde (97 originais + os novos das Tasks 1-4).

- [ ] **Step 7: Commit**

```bash
git add src/odd_analyzer/backtest/run_backtest.py tests/test_run_backtest.py
git commit -m "refactor(backtest): score_records pura p/ replay deterministico offline + metricas no relatorio"
```

---

## Task 5: Verificação final

- [ ] **Step 1: Suíte completa verde**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: **0 failed**. O total sobe bem acima dos 97 originais (os testes de round-trip da Task 2 são parametrizados — dezenas de casos); o número exato não importa, só importa que nada falhe.

- [ ] **Step 2: Resumo do Portão 1**

Escrever 3-5 linhas: o que o round-trip provou (de-vig/EV sem bug de sinal) e que a calibração agora roda offline e expõe ECE/skill. Isto alimenta a decisão do **Portão 1** (comprar ou não o API-Football Pro $19). Não commitar dinheiro nem chamar API até este resumo existir.

---

## Notas de escopo (o que NÃO está aqui, de propósito)

- **CLV / self-logging de props** (spec §5.1 passo 3) e **Kelly Monte-Carlo** (passo 4) ficam para um plano seguinte — só são necessários antes de **dinheiro real (Portão 3)**, não para liberar os $19 (Portão 1).
- **Section "Jogos Passados" no front** (Sub-projeto #2) é plano próprio; consome `score_records` + as métricas desta entrega.
- **Calibração por-slice (bucket de minutos, mando)** (spec §5.1 passo 2) fica diferida: esta entrega fatia por linha (0.5/1.5) e expõe ECE/skill globais — suficiente p/ a barra do Portão 1. Slice por minutos/mando entra junto com a section "Jogos Passados" (#2), que precisa desses cortes pra visualização.
- **Recalibração internacional / multi-mercado** depende de stats da Copa (pós-$19), fora deste plano.
