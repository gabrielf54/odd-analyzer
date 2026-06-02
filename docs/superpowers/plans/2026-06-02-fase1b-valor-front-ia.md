# Fase 1b — valor (de-vig + EV) + IA analista + front — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir, em modo paper, o pipeline completo que mede VALOR (edge/EV sobre odds de-vig) em SOT de jogador, com IA analista via OpenRouter e front Streamlit mínimo, ligado a dados reais (The Odds API + crosswalk).

**Architecture:** Pipeline magro em Python, bottom-up: funções puras de de-vig/EV → filtro → IA (analista que só lê números) → odds/crosswalk/join → persistência Supabase → orquestrador → front. Cada unidade é isolada e testável; dependências externas (HTTP, Supabase) são injetadas para testar offline.

**Tech Stack:** Python 3.14 (stdlib `math`/`difflib`/`unicodedata`/`json`), `requests`, `supabase`, `streamlit`, `pytest`. Sem `scipy`/`pandas` no núcleo, sem `rapidfuzz`.

**Spec:** `docs/superpowers/specs/2026-06-02-fase1b-valor-front-ia-design.md`

**Convenções do repo:**
- `pytest.ini` já tem `pythonpath = src` e `testpaths = tests` → rodar testes com `python -m pytest` (sem PYTHONPATH manual).
- No Windows, o interpretador do venv é `.\.venv\Scripts\python.exe`. Onde o plano diz `python`, use o do venv.
- Imports sempre `from odd_analyzer....`.
- Reaproveitar: `odd_analyzer.model.sot_model.prob_over_line(mu, line, r)`, `odd_analyzer.odds_math.american_to_decimal`, `odd_analyzer.cache.cached_get`, `odd_analyzer.config.get_required`.
- Branch atual: `feat/fase0-spike-viabilidade` (continuar nela).

---

## Estrutura de arquivos (o que cada um faz)

| Arquivo | Responsabilidade |
|---|---|
| `src/odd_analyzer/value/devig.py` | De-vig 2-way: multiplicativo + power method; prob justa conservadora. |
| `src/odd_analyzer/value/ev.py` | `edge` e `EV` a partir de prob_modelo, prob_devig, odd. |
| `src/odd_analyzer/candidates/builder.py` | Monta o dossiê de 1 candidato (formato §7 do design v1). |
| `src/odd_analyzer/candidates/filtro.py` | Corta por edge/EV/XI/amostra; ordena por EV. |
| `src/odd_analyzer/ai/schema.py` | Valida a saída JSON da IA (estrutura + sem jogador inventado). |
| `src/odd_analyzer/ai/openrouter.py` | Transporte HTTP p/ OpenRouter (POST injetável p/ teste). |
| `src/odd_analyzer/ai/analista.py` | Prompt §7 + chamada + validação + retry + fail-closed. |
| `src/odd_analyzer/odds/the_odds_api.py` | Fetch de eventos + props SOT; parser para props. |
| `src/odd_analyzer/crosswalk/match.py` | Liga nome da odd ao ID do elenco (difflib, fail-closed). |
| `src/odd_analyzer/store/repo.py` | Interface `Repo` + `InMemoryRepo` + `SupabaseRepo`; CLV. |
| `src/odd_analyzer/store/schema.sql` | DDL das tabelas `analises`, `paper_ledger`, `jogadores_crosswalk`. |
| `src/odd_analyzer/pipeline.py` | Orquestra 1 jogo: odds→crosswalk→modelo→candidatos→filtro→IA→ledger. |
| `app/streamlit_app.py` | Front mínimo (página única). |

Pastas novas precisam de `__init__.py`: `value/`, `candidates/`, `ai/`, `odds/`, `crosswalk/`, `store/`.

---

## Task 1: Dependências + de-risk do Streamlit no Python 3.14

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Adicionar streamlit ao requirements**

`requirements.txt` (acrescentar linha):
```
streamlit
```
(sem pin — deixar o resolvedor achar versão compatível com Python 3.14)

- [ ] **Step 2: Instalar e confirmar import**

Run: `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`
Run: `.\.venv\Scripts\python.exe -c "import streamlit; print(streamlit.__version__)"`
Expected: imprime uma versão sem erro.

> **Se a instalação falhar no Python 3.14** (sem wheel p/ pyarrow/numpy etc., como aconteceu com pandas na Fase 0): **PARAR e reportar**. Fallback combinado: front via `http.server` da stdlib renderizando HTML simples (vira um mini-plano separado). O núcleo (Tasks 2-12) não depende de streamlit e segue normalmente.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "chore: adiciona streamlit (front da Fase 1b)"
```

---

## Task 2: De-vig 2-way (`value/devig.py`)

**Files:**
- Create: `src/odd_analyzer/value/__init__.py` (vazio)
- Create: `src/odd_analyzer/value/devig.py`
- Test: `tests/test_devig.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_devig.py`:
```python
import pytest
from odd_analyzer.value.devig import (
    implied_prob, devig_multiplicative, devig_power, fair_prob_over,
)

def test_implied_prob():
    assert implied_prob(2.0) == pytest.approx(0.5)

def test_multiplicative_even_market():
    # mercado simétrico com vig: 1.91/1.91 -> 0.5/0.5 após de-vig
    po, pu = devig_multiplicative(1.91, 1.91)
    assert po == pytest.approx(0.5)
    assert pu == pytest.approx(0.5)
    assert po + pu == pytest.approx(1.0)

def test_multiplicative_soma_um():
    po, pu = devig_multiplicative(1.5, 3.0)
    assert po + pu == pytest.approx(1.0)
    assert po > pu

def test_power_even_market():
    po, pu = devig_power(1.91, 1.91)
    assert po == pytest.approx(0.5, abs=1e-3)
    assert po + pu == pytest.approx(1.0, abs=1e-6)

def test_fair_prob_over_e_conservador():
    # conservador = MAIOR prob justa do over entre os dois métodos
    po_m, _ = devig_multiplicative(1.8, 2.1)
    po_p, _ = devig_power(1.8, 2.1)
    assert fair_prob_over(1.8, 2.1) == pytest.approx(max(po_m, po_p))

def test_odd_invalida():
    with pytest.raises(ValueError):
        implied_prob(1.0)
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_devig.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'odd_analyzer.value'`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/value/devig.py`:
```python
"""De-vig de mercado over/under 2-way: remove a margem da casa e devolve
probabilidades 'justas' (somam 1). Dois métodos: multiplicativo (base) e
power method (Clarke & Kovalchik 2017, checagem). Tudo em stdlib."""

def implied_prob(odd: float) -> float:
    """Probabilidade implícita de uma odd decimal. Odd deve ser > 1."""
    if odd <= 1.0:
        raise ValueError(f"odd decimal deve ser > 1.0, recebido {odd}")
    return 1.0 / odd

def devig_multiplicative(odd_over: float, odd_under: float) -> tuple[float, float]:
    """Normalização proporcional: p_i = implícita_i / soma_implícitas."""
    io, iu = implied_prob(odd_over), implied_prob(odd_under)
    s = io + iu
    return io / s, iu / s

def devig_power(odd_over: float, odd_under: float) -> tuple[float, float]:
    """Acha k tal que io**k + iu**k = 1 (bisseção); p_i = i_i**k."""
    io, iu = implied_prob(odd_over), implied_prob(odd_under)
    lo, hi = 0.1, 20.0
    for _ in range(100):  # bisseção; 100 iterações = precisão folgada
        k = (lo + hi) / 2
        f = io**k + iu**k - 1.0
        if abs(f) < 1e-12:
            break
        # f decresce com k (io,iu < 1) -> se f>0, k precisa subir
        if f > 0:
            lo = k
        else:
            hi = k
    return io**k, iu**k

def fair_prob_over(odd_over: float, odd_under: float) -> float:
    """Prob justa do lado OVER, conservadora: a MAIOR entre os dois métodos
    (não superestima o edge)."""
    po_m, _ = devig_multiplicative(odd_over, odd_under)
    po_p, _ = devig_power(odd_over, odd_under)
    return max(po_m, po_p)
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_devig.py -v`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/value/__init__.py src/odd_analyzer/value/devig.py tests/test_devig.py
git commit -m "feat: de-vig 2-way (multiplicativo + power method)"
```

---

## Task 3: Edge e EV (`value/ev.py`)

**Files:**
- Create: `src/odd_analyzer/value/ev.py`
- Test: `tests/test_ev.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_ev.py`:
```python
import pytest
from odd_analyzer.value.ev import edge_ev

def test_edge_ev_positivo():
    r = edge_ev(prob_modelo=0.55, prob_devig=0.46, odd_decimal=2.10)
    assert r["edge"] == pytest.approx(0.09)
    assert r["ev"] == pytest.approx(0.155)

def test_ev_zero_quando_odd_e_o_inverso_da_prob():
    r = edge_ev(prob_modelo=0.5, prob_devig=0.5, odd_decimal=2.0)
    assert r["ev"] == pytest.approx(0.0)
    assert r["edge"] == pytest.approx(0.0)

def test_edge_negativo():
    r = edge_ev(prob_modelo=0.40, prob_devig=0.50, odd_decimal=2.0)
    assert r["edge"] == pytest.approx(-0.10)
    assert r["ev"] == pytest.approx(-0.20)
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_ev.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/value/ev.py`:
```python
"""Edge e EV. edge = prob_modelo - prob_devig (vantagem sobre o mercado justo);
EV = prob_modelo * odd - 1 (retorno esperado por unidade apostada)."""

def edge_ev(prob_modelo: float, prob_devig: float, odd_decimal: float) -> dict:
    return {
        "edge": prob_modelo - prob_devig,
        "ev": prob_modelo * odd_decimal - 1.0,
    }
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_ev.py -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/value/ev.py tests/test_ev.py
git commit -m "feat: calculo de edge e EV"
```

---

## Task 4: Builder de candidato (`candidates/builder.py`)

**Files:**
- Create: `src/odd_analyzer/candidates/__init__.py` (vazio)
- Create: `src/odd_analyzer/candidates/builder.py`
- Test: `tests/test_builder.py`

- [ ] **Step 1: Escrever o teste que falha**

`tests/test_builder.py`:
```python
import pytest
from odd_analyzer.candidates.builder import build_candidate

def test_build_candidate_monta_dossie():
    c = build_candidate(
        jogador="Vinicius Jr", linha=0.5, odd_over=1.72, odd_under=2.10,
        prob_modelo=0.68, mu=1.9, minutos_esperados=88, xi_confirmado=True,
        amostra_jogos=24, sot_concedido_adversario="alto", incerteza="media",
    )
    assert c["jogador"] == "Vinicius Jr"
    assert c["linha"] == 0.5
    assert c["odd"] == 1.72
    assert c["prob_modelo"] == 0.68
    assert 0.0 < c["prob_devig"] < 1.0
    assert c["edge"] == pytest.approx(c["prob_modelo"] - c["prob_devig"])
    assert c["ev"] == pytest.approx(c["prob_modelo"] * c["odd"] - 1.0)
    assert c["lambda"] == 1.9
    assert c["minutos_esperados"] == 88
    assert c["xi_confirmado"] is True
    assert c["amostra_jogos"] == 24
    assert c["sot_concedido_adversario"] == "alto"
    assert c["incerteza"] == "media"
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_builder.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/candidates/builder.py`:
```python
"""Monta o dossiê de UM candidato no formato que a IA lê (design v1 §7).
Toda a matemática (de-vig, edge, EV) vem do código aqui — a IA nunca calcula."""
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev

def build_candidate(jogador, linha, odd_over, odd_under, prob_modelo, mu,
                    minutos_esperados, xi_confirmado, amostra_jogos,
                    sot_concedido_adversario, incerteza) -> dict:
    prob_devig = fair_prob_over(odd_over, odd_under)
    m = edge_ev(prob_modelo, prob_devig, odd_over)
    return {
        "jogador": jogador,
        "linha": linha,
        "odd": odd_over,
        "prob_modelo": prob_modelo,
        "prob_devig": prob_devig,
        "edge": m["edge"],
        "ev": m["ev"],
        "lambda": mu,
        "minutos_esperados": minutos_esperados,
        "xi_confirmado": xi_confirmado,
        "amostra_jogos": amostra_jogos,
        "sot_concedido_adversario": sot_concedido_adversario,
        "incerteza": incerteza,
    }
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_builder.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/candidates/__init__.py src/odd_analyzer/candidates/builder.py tests/test_builder.py
git commit -m "feat: builder do dossie de candidato (de-vig+edge+EV)"
```

---

## Task 5: Filtro de candidatos (`candidates/filtro.py`)

**Files:**
- Create: `src/odd_analyzer/candidates/filtro.py`
- Test: `tests/test_filtro.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_filtro.py`:
```python
from odd_analyzer.candidates.filtro import Cortes, filter_candidates

def _cand(**kw):
    base = dict(jogador="X", linha=0.5, odd=2.0, prob_modelo=0.6, prob_devig=0.5,
                edge=0.10, ev=0.20, xi_confirmado=True, amostra_jogos=20)
    base.update(kw)
    return base

def test_mantem_acima_dos_cortes():
    assert len(filter_candidates([_cand()])) == 1

def test_corta_edge_baixo():
    assert filter_candidates([_cand(edge=0.01)]) == []

def test_corta_ev_baixo():
    assert filter_candidates([_cand(ev=0.0)]) == []

def test_corta_sem_xi():
    assert filter_candidates([_cand(xi_confirmado=False)]) == []

def test_corta_amostra_pequena():
    assert filter_candidates([_cand(amostra_jogos=5)]) == []

def test_ordena_por_ev_desc():
    out = filter_candidates([_cand(jogador="A", ev=0.10), _cand(jogador="B", ev=0.30)])
    assert [c["jogador"] for c in out] == ["B", "A"]

def test_lista_vazia_e_valida():
    assert filter_candidates([]) == []

def test_cortes_customizados():
    cuts = Cortes(edge_min=0.0, ev_min=0.0, amostra_min=0)
    assert len(filter_candidates([_cand(edge=0.001, ev=0.001, amostra_jogos=1)], cuts)) == 1
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_filtro.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/candidates/filtro.py`:
```python
"""Mantém só candidatos com valor real: edge e EV acima do corte, titular
confirmado e amostra suficiente. Ordena por EV desc. Lista vazia é resultado
válido ('nenhuma oportunidade clara')."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Cortes:
    edge_min: float = 0.04
    ev_min: float = 0.05
    amostra_min: int = 10

def filter_candidates(candidatos: list[dict], cuts: Cortes = Cortes()) -> list[dict]:
    keep = [
        c for c in candidatos
        if c["edge"] >= cuts.edge_min
        and c["ev"] >= cuts.ev_min
        and c.get("xi_confirmado", False)
        and c.get("amostra_jogos", 0) >= cuts.amostra_min
    ]
    return sorted(keep, key=lambda c: c["ev"], reverse=True)
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_filtro.py -v`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/candidates/filtro.py tests/test_filtro.py
git commit -m "feat: filtro de candidatos por edge/EV/XI/amostra"
```

---

## Task 6: Validação da saída da IA (`ai/schema.py`)

**Files:**
- Create: `src/odd_analyzer/ai/__init__.py` (vazio)
- Create: `src/odd_analyzer/ai/schema.py`
- Test: `tests/test_ai_schema.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_ai_schema.py`:
```python
from odd_analyzer.ai.schema import validate_ia_output

CANDS = [{"jogador": "Vinicius Jr", "linha": 0.5}, {"jogador": "Raphinha", "linha": 1.5}]

def _ok():
    return {
        "melhor_aposta": {"jogador": "Vinicius Jr", "linha": 0.5,
                          "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge alto"},
        "outras": [], "alertas": [],
    }

def test_saida_valida():
    assert validate_ia_output(_ok(), CANDS) is True

def test_melhor_aposta_nula_e_valida():
    assert validate_ia_output({"melhor_aposta": None, "outras": [], "alertas": ["nada"]}, CANDS) is True

def test_rejeita_jogador_inventado():
    bad = _ok()
    bad["melhor_aposta"]["jogador"] = "Neymar"  # não está nos candidatos
    assert validate_ia_output(bad, CANDS) is False

def test_rejeita_veredito_invalido():
    bad = _ok()
    bad["melhor_aposta"]["veredito"] = "TALVEZ"
    assert validate_ia_output(bad, CANDS) is False

def test_rejeita_falta_de_chave():
    assert validate_ia_output({"melhor_aposta": None}, CANDS) is False

def test_rejeita_nao_dict():
    assert validate_ia_output(["x"], CANDS) is False
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_ai_schema.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/ai/schema.py`:
```python
"""Valida a saída da IA SEM biblioteca externa. Garante estrutura E que a IA
não inventou jogador/linha fora dos candidatos recebidos (anti-alucinação)."""

_VEREDITOS = {"APOSTAR", "NAO_APOSTAR", "PASSAR"}
_CONFIANCAS = {"alta", "media", "baixa"}

def _aposta_valida(ap: dict, chaves_validas: set) -> bool:
    obrig = {"jogador", "linha", "veredito", "confianca", "motivo"}
    if not isinstance(ap, dict) or not obrig.issubset(ap):
        return False
    if ap["veredito"] not in _VEREDITOS or ap["confianca"] not in _CONFIANCAS:
        return False
    return (ap["jogador"], ap["linha"]) in chaves_validas

def validate_ia_output(obj, candidatos: list[dict]) -> bool:
    if not isinstance(obj, dict):
        return False
    if not {"melhor_aposta", "outras", "alertas"}.issubset(obj):
        return False
    if not isinstance(obj["outras"], list) or not isinstance(obj["alertas"], list):
        return False
    chaves = {(c["jogador"], c["linha"]) for c in candidatos}
    if obj["melhor_aposta"] is not None and not _aposta_valida(obj["melhor_aposta"], chaves):
        return False
    return all(_aposta_valida(o, chaves) for o in obj["outras"])
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_ai_schema.py -v`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/ai/__init__.py src/odd_analyzer/ai/schema.py tests/test_ai_schema.py
git commit -m "feat: validacao da saida da IA (anti-alucinacao, sem dep)"
```

---

## Task 7: Transporte OpenRouter (`ai/openrouter.py`)

**Files:**
- Create: `src/odd_analyzer/ai/openrouter.py`
- Test: `tests/test_openrouter.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_openrouter.py`:
```python
from odd_analyzer.ai import openrouter

class _Resp:
    def __init__(self, data): self._data = data; self.status_code = 200
    def raise_for_status(self): pass
    def json(self): return self._data

def test_chat_extrai_conteudo(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    captured = {}
    def fake_post(url, **kw):
        captured["url"] = url; captured["json"] = kw["json"]; captured["headers"] = kw["headers"]
        return _Resp({"choices": [{"message": {"content": "ola"}}]})
    out = openrouter.chat([{"role": "user", "content": "oi"}], model="x/y", _post=fake_post)
    assert out == "ola"
    assert captured["url"].endswith("/chat/completions")
    assert captured["json"]["model"] == "x/y"
    assert captured["json"]["temperature"] == 0.0
    assert captured["headers"]["Authorization"] == "Bearer k"

def test_chat_usa_modelo_default_da_env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setenv("OPENROUTER_MODEL", "env/model")
    captured = {}
    def fake_post(url, **kw):
        captured["json"] = kw["json"]
        return _Resp({"choices": [{"message": {"content": "x"}}]})
    openrouter.chat([{"role": "user", "content": "oi"}], _post=fake_post)
    assert captured["json"]["model"] == "env/model"
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_openrouter.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/ai/openrouter.py`:
```python
"""Transporte HTTP para a API de chat do OpenRouter. `_post` é injetável para
testar offline. Lê OPENROUTER_API_KEY (obrigatória) e OPENROUTER_MODEL (default)."""
import os
import requests
from odd_analyzer.config import get_required

_URL = "https://openrouter.ai/api/v1/chat/completions"
_DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"

def chat(messages: list[dict], model: str | None = None,
         temperature: float = 0.0, _post=requests.post) -> str:
    key = get_required("OPENROUTER_API_KEY")
    mdl = model or os.environ.get("OPENROUTER_MODEL", _DEFAULT_MODEL)
    r = _post(_URL,
              headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
              json={"model": mdl, "messages": messages, "temperature": temperature},
              timeout=60)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_openrouter.py -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/ai/openrouter.py tests/test_openrouter.py
git commit -m "feat: transporte OpenRouter (POST injetavel)"
```

---

## Task 8: Analista IA (`ai/analista.py`)

**Files:**
- Create: `src/odd_analyzer/ai/analista.py`
- Test: `tests/test_analista.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_analista.py`:
```python
import json
from odd_analyzer.ai.analista import analisar

CANDS = [{"jogador": "Vinicius Jr", "linha": 0.5, "odd": 1.72, "prob_modelo": 0.68,
          "prob_devig": 0.62, "edge": 0.06, "ev": 0.17, "lambda": 1.9,
          "minutos_esperados": 88, "xi_confirmado": True, "amostra_jogos": 24,
          "sot_concedido_adversario": "alto", "incerteza": "media"}]

def _saida_ok():
    return json.dumps({
        "melhor_aposta": {"jogador": "Vinicius Jr", "linha": 0.5, "veredito": "APOSTAR",
                          "confianca": "alta", "motivo": "edge +6pp, EV +17%"},
        "outras": [], "alertas": []})

def test_analisar_saida_valida():
    out = analisar(CANDS, {"jogo": "BRA x CRO"}, _chat=lambda msgs, **kw: _saida_ok())
    assert out["melhor_aposta"]["jogador"] == "Vinicius Jr"

def test_retry_em_json_quebrado_depois_ok():
    chamadas = [" not json ", _saida_ok()]
    def fake_chat(msgs, **kw): return chamadas.pop(0)
    out = analisar(CANDS, {"jogo": "x"}, _chat=fake_chat)
    assert out["melhor_aposta"]["jogador"] == "Vinicius Jr"

def test_fail_closed_se_invalido_duas_vezes():
    def fake_chat(msgs, **kw): return "{ ainda quebrado"
    out = analisar(CANDS, {"jogo": "x"}, _chat=fake_chat)
    assert out["melhor_aposta"] is None
    assert out["alertas"]  # tem alerta de falha

def test_fail_closed_se_jogador_inventado():
    saida = json.dumps({"melhor_aposta": {"jogador": "Neymar", "linha": 0.5,
        "veredito": "APOSTAR", "confianca": "alta", "motivo": "x"}, "outras": [], "alertas": []})
    out = analisar(CANDS, {"jogo": "x"}, _chat=lambda m, **kw: saida)
    assert out["melhor_aposta"] is None

def test_passa_candidatos_no_prompt():
    capt = {}
    def fake_chat(msgs, **kw):
        capt["msgs"] = msgs; return _saida_ok()
    analisar(CANDS, {"jogo": "BRA x CRO"}, _chat=fake_chat)
    user_msg = capt["msgs"][-1]["content"]
    assert "Vinicius Jr" in user_msg and "BRA x CRO" in user_msg
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_analista.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/ai/analista.py`:
```python
"""IA analista: lê o dossiê pronto e recomenda a melhor aposta. NUNCA calcula
número nem inventa fato. Saída validada por schema; inválida -> 1 retry ->
fail-closed (sem recomendação)."""
import json
from odd_analyzer.ai.openrouter import chat as _default_chat
from odd_analyzer.ai.schema import validate_ia_output

PROMPT_SISTEMA = (
    "Você é um analista de apostas conservador. Recebe um JSON com candidatos já "
    "calculados em código (prob_modelo, prob_devig, edge, ev, etc.). REGRAS: "
    "use SOMENTE os números fornecidos; NUNCA invente número, estatística ou lesão; "
    "só marque veredito 'APOSTAR' quando edge>0 E ev for claramente positivo E "
    "xi_confirmado=true E amostra_jogos suficiente; compare e escolha a MELHOR aposta; "
    "na dúvida, não recomende (melhor_aposta=null); explique em 1-2 frases ancoradas "
    "SÓ nos campos recebidos. Responda APENAS JSON no formato: "
    '{"melhor_aposta": {"jogador","linha","veredito","confianca","motivo"} ou null, '
    '"outras": [], "alertas": []}. veredito ∈ {APOSTAR,NAO_APOSTAR,PASSAR}; '
    "confianca ∈ {alta,media,baixa}."
)

def _parse(texto: str):
    try:
        return json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        return None

def analisar(candidatos: list[dict], contexto: dict, _chat=_default_chat) -> dict:
    user = json.dumps({"contexto": contexto, "candidatos": candidatos}, ensure_ascii=False)
    messages = [{"role": "system", "content": PROMPT_SISTEMA},
                {"role": "user", "content": user}]
    for _ in range(2):  # 1 tentativa + 1 retry
        obj = _parse(_chat(messages, temperature=0.0))
        if obj is not None and validate_ia_output(obj, candidatos):
            return obj
    return {"melhor_aposta": None, "outras": [],
            "alertas": ["IA não produziu saída válida (fail-closed)."]}
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_analista.py -v`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/ai/analista.py tests/test_analista.py
git commit -m "feat: IA analista (prompt §7 + validacao + retry + fail-closed)"
```

---

## Task 9: Odds — The Odds API (`odds/the_odds_api.py`)

**Files:**
- Create: `src/odd_analyzer/odds/__init__.py` (vazio)
- Create: `src/odd_analyzer/odds/the_odds_api.py`
- Test: `tests/test_the_odds_api.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_the_odds_api.py`:
```python
from odd_analyzer.odds.the_odds_api import parse_sot_props

# formato real do The Odds API: event -> bookmakers[] -> markets[] (key) -> outcomes[]
EVENT = {
    "id": "evt1",
    "bookmakers": [{
        "key": "draftkings",
        "markets": [{
            "key": "player_shots_on_target",
            "outcomes": [
                {"description": "Vinicius Jr", "name": "Over", "point": 0.5, "price": 1.72},
                {"description": "Vinicius Jr", "name": "Under", "point": 0.5, "price": 2.10},
                {"description": "Raphinha", "name": "Over", "point": 1.5, "price": 2.40},
                {"description": "Raphinha", "name": "Under", "point": 1.5, "price": 1.55},
            ],
        }],
    }],
}

def test_parse_agrupa_over_under_por_jogador_linha():
    props = parse_sot_props(EVENT)
    vini = [p for p in props if p["player_name"] == "Vinicius Jr"][0]
    assert vini["line"] == 0.5
    assert vini["book"] == "draftkings"
    assert vini["odd_over"] == 1.72
    assert vini["odd_under"] == 2.10

def test_parse_ignora_prop_sem_os_dois_lados():
    ev = {"id": "e", "bookmakers": [{"key": "dk", "markets": [{"key": "player_shots_on_target",
          "outcomes": [{"description": "X", "name": "Over", "point": 0.5, "price": 1.9}]}]}]}
    assert parse_sot_props(ev) == []

def test_parse_vazio_quando_sem_mercado():
    assert parse_sot_props({"id": "e", "bookmakers": []}) == []
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_the_odds_api.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/odds/the_odds_api.py`:
```python
"""The Odds API v4: lista de eventos (0 créditos) e props de SOT por jogador.
parse_sot_props agrupa Over/Under por (jogador, linha) num só registro."""
import requests
from odd_analyzer.config import get_required
from odd_analyzer.cache import cached_get

BASE = "https://api.the-odds-api.com/v4"
SOT_MARKET = "player_shots_on_target"

def _get(path: str, params: dict) -> object:
    key = get_required("THE_ODDS_API_KEY")
    p = dict(params, apiKey=key)
    keystr = f"{path}?{sorted((k, v) for k, v in p.items() if k != 'apiKey')}"
    def fetch():
        r = requests.get(f"{BASE}/{path}", params=p, timeout=30)
        r.raise_for_status()
        return r.json()
    return cached_get(keystr, fetch, should_cache=lambda d: bool(d))

def fetch_events(sport_key: str) -> list[dict]:
    """Eventos do esporte (0 créditos). Ex.: sport_key='soccer_fifa_world_cup'."""
    return _get(f"sports/{sport_key}/events", {})

def fetch_event_odds(sport_key: str, event_id: str,
                     markets: str = SOT_MARKET, regions: str = "us") -> dict:
    return _get(f"sports/{sport_key}/events/{event_id}/odds",
                {"markets": markets, "regions": regions, "oddsFormat": "decimal"})

def parse_sot_props(event: dict) -> list[dict]:
    """Agrupa outcomes Over/Under em props {player_name, line, book, odd_over, odd_under}.
    Descarta jogador/linha sem os dois lados (não dá p/ de-vig)."""
    grouped: dict[tuple, dict] = {}
    for bm in event.get("bookmakers", []):
        book = bm.get("key")
        for mk in bm.get("markets", []):
            if mk.get("key") != SOT_MARKET:
                continue
            for o in mk.get("outcomes", []):
                player, line, name, price = (o.get("description"), o.get("point"),
                                             (o.get("name") or "").lower(), o.get("price"))
                if player is None or line is None or price is None:
                    continue
                e = grouped.setdefault((book, player, line),
                                       {"player_name": player, "line": line, "book": book,
                                        "odd_over": None, "odd_under": None})
                if name == "over":
                    e["odd_over"] = price
                elif name == "under":
                    e["odd_under"] = price
    return [p for p in grouped.values() if p["odd_over"] and p["odd_under"]]
```

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_the_odds_api.py -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/odds/__init__.py src/odd_analyzer/odds/the_odds_api.py tests/test_the_odds_api.py
git commit -m "feat: The Odds API (eventos + parser de props SOT)"
```

---

## Task 10: Crosswalk de jogador (`crosswalk/match.py`)

**Files:**
- Create: `src/odd_analyzer/crosswalk/__init__.py` (vazio)
- Create: `src/odd_analyzer/crosswalk/match.py`
- Test: `tests/test_crosswalk.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_crosswalk.py`:
```python
from odd_analyzer.crosswalk.match import normalize, match_player

ELENCO = [{"id": 1, "name": "Vinícius Júnior"}, {"id": 2, "name": "Raphael Dias Belloli"}]

def test_normalize_remove_acento_e_caixa():
    assert normalize("Vinícius Júnior") == "vinicius junior"

def test_match_exato_com_acento_diferente():
    m = match_player("Vinicius Junior", ELENCO)
    assert m["id"] == 1
    assert m["confianca"] >= 0.9

def test_fail_closed_sem_match():
    assert match_player("Cristiano Ronaldo", ELENCO) is None

def test_override_manual_tem_prioridade():
    m = match_player("Raphinha", ELENCO, overrides={"raphinha": 2})
    assert m["id"] == 2
    assert m["confianca"] == 1.0
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_crosswalk.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/crosswalk/match.py`:
```python
"""Liga o nome do jogador na odd (The Odds API) ao ID do elenco (API-Football).
NFKD->ASCII + difflib (stdlib, sem rapidfuzz). FAIL-CLOSED: sem match confiável
acima do threshold, retorna None (nunca chuta jogador)."""
import unicodedata
from difflib import SequenceMatcher

def normalize(nome: str) -> str:
    s = unicodedata.normalize("NFKD", nome)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().split())

def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()

def match_player(odd_name: str, elenco: list[dict],
                 overrides: dict | None = None, threshold: float = 0.90) -> dict | None:
    n = normalize(odd_name)
    if overrides and n in overrides:
        oid = overrides[n]
        nome = next((p["name"] for p in elenco if p["id"] == oid), odd_name)
        return {"id": oid, "name": nome, "confianca": 1.0}
    melhor, score = None, 0.0
    for p in elenco:
        s = _sim(n, normalize(p["name"]))
        if s > score:
            melhor, score = p, s
    if melhor is None or score < threshold:
        return None  # fail-closed
    return {"id": melhor["id"], "name": melhor["name"], "confianca": round(score, 3)}
```

> Nota: `SequenceMatcher` em nomes longos como "Raphael Dias Belloli" vs "Raphinha" fica abaixo de 0.90 (correto — exige override manual). Por isso o teste de "Raphinha" usa override.

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_crosswalk.py -v`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/crosswalk/__init__.py src/odd_analyzer/crosswalk/match.py tests/test_crosswalk.py
git commit -m "feat: crosswalk de jogador (difflib, fail-closed)"
```

---

## Task 11: Persistência — Repo + CLV (`store/repo.py` + `store/schema.sql`)

**Files:**
- Create: `src/odd_analyzer/store/__init__.py` (vazio)
- Create: `src/odd_analyzer/store/repo.py`
- Create: `src/odd_analyzer/store/schema.sql`
- Test: `tests/test_repo.py`

- [ ] **Step 1: Escrever os testes que falham**

`tests/test_repo.py`:
```python
import pytest
from odd_analyzer.store.repo import InMemoryRepo, clv

def test_clv_positivo_quando_flag_melhor_que_fechamento():
    # peguei 2.10, fechou 1.90 -> CLV positivo (preço melhor)
    assert clv(2.10, 1.90) == pytest.approx(2.10 / 1.90 - 1.0)

def test_clv_negativo():
    assert clv(1.80, 2.00) < 0

def test_repo_salva_e_le_analise():
    r = InMemoryRepo()
    r.save_analise("evt1", {"jogo": "BRA x CRO", "candidatos": []})
    assert r.get_analise("evt1")["jogo"] == "BRA x CRO"
    assert r.get_analise("inexistente") is None

def test_repo_salva_ledger_e_atualiza_fechamento():
    r = InMemoryRepo()
    r.save_ledger([{"event_id": "evt1", "jogador": "Vinicius Jr", "linha": 0.5,
                    "odd_flag": 2.10, "prob_modelo": 0.6, "prob_devig": 0.5,
                    "edge": 0.1, "ev": 0.26}])
    r.update_fechamento("evt1", "Vinicius Jr", 0.5, odd_fechamento=1.90, resultado=1)
    row = r.ledger[0]
    assert row["odd_fechamento"] == 1.90
    assert row["resultado"] == 1
    assert row["clv"] == pytest.approx(2.10 / 1.90 - 1.0)
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_repo.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar (repo)**

`src/odd_analyzer/store/repo.py`:
```python
"""Camada de persistência. Interface Repo com duas implementações: InMemoryRepo
(testes offline) e SupabaseRepo (Postgres hospedado). CLV = odd_flag/odd_fech - 1."""
from abc import ABC, abstractmethod

def clv(odd_flag: float, odd_fechamento: float) -> float:
    """Closing Line Value: positivo = peguei preço melhor que o fechamento."""
    return odd_flag / odd_fechamento - 1.0

class Repo(ABC):
    @abstractmethod
    def save_analise(self, event_id: str, payload: dict) -> None: ...
    @abstractmethod
    def get_analise(self, event_id: str) -> dict | None: ...
    @abstractmethod
    def save_ledger(self, rows: list[dict]) -> None: ...
    @abstractmethod
    def update_fechamento(self, event_id: str, jogador: str, linha: float,
                          odd_fechamento: float, resultado: int) -> None: ...

class InMemoryRepo(Repo):
    def __init__(self):
        self.analises: dict[str, dict] = {}
        self.ledger: list[dict] = []
    def save_analise(self, event_id, payload):
        self.analises[event_id] = payload
    def get_analise(self, event_id):
        return self.analises.get(event_id)
    def save_ledger(self, rows):
        self.ledger.extend(rows)
    def update_fechamento(self, event_id, jogador, linha, odd_fechamento, resultado):
        for row in self.ledger:
            if (row["event_id"], row["jogador"], row["linha"]) == (event_id, jogador, linha):
                row["odd_fechamento"] = odd_fechamento
                row["resultado"] = resultado
                row["clv"] = clv(row["odd_flag"], odd_fechamento)

class SupabaseRepo(Repo):
    """Persiste no Supabase. Tabelas em store/schema.sql (rodar uma vez no SQL editor)."""
    def __init__(self, client=None):
        if client is None:
            from supabase import create_client
            from odd_analyzer.config import get_required
            client = create_client(get_required("SUPABASE_URL"),
                                   get_required("SUPABASE_SERVICE_KEY"))
        self.c = client
    def save_analise(self, event_id, payload):
        self.c.table("analises").upsert({"event_id": event_id, **payload}).execute()
    def get_analise(self, event_id):
        r = self.c.table("analises").select("*").eq("event_id", event_id).execute()
        return r.data[0] if r.data else None
    def save_ledger(self, rows):
        if rows:
            self.c.table("paper_ledger").insert(rows).execute()
    def update_fechamento(self, event_id, jogador, linha, odd_fechamento, resultado):
        sel = (self.c.table("paper_ledger").select("odd_flag")
               .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha).execute())
        if not sel.data:
            return
        c = clv(sel.data[0]["odd_flag"], odd_fechamento)
        (self.c.table("paper_ledger")
         .update({"odd_fechamento": odd_fechamento, "resultado": resultado, "clv": c})
         .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha).execute())
```

- [ ] **Step 4: Implementar (schema.sql)**

`src/odd_analyzer/store/schema.sql`:
```sql
-- Rodar uma vez no SQL editor do Supabase. Tabelas da Fase 1b (design v1 §8).
create table if not exists analises (
  event_id text primary key,
  jogo text,
  data timestamptz default now(),
  ttl int,
  candidatos jsonb,
  llm_resultado jsonb
);

create table if not exists paper_ledger (
  id bigint generated always as identity primary key,
  event_id text not null,
  jogador text not null,
  linha numeric not null,
  odd_flag numeric not null,
  prob_modelo numeric,
  prob_devig numeric,
  edge numeric,
  ev numeric,
  odd_fechamento numeric,
  prob_devig_fechamento numeric,
  resultado int,
  clv numeric,
  criado_em timestamptz default now()
);

create table if not exists jogadores_crosswalk (
  id_canonico bigint primary key,
  nome_normalizado text,
  fontes_ids jsonb,
  confianca numeric,
  verificado_manual boolean default false
);
```

- [ ] **Step 5: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_repo.py -v`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/odd_analyzer/store/__init__.py src/odd_analyzer/store/repo.py src/odd_analyzer/store/schema.sql tests/test_repo.py
git commit -m "feat: camada de persistencia (Repo + InMemory + Supabase) + CLV + schema.sql"
```

---

## Task 12: Orquestrador de 1 jogo (`pipeline.py`)

**Files:**
- Create: `src/odd_analyzer/pipeline.py`
- Test: `tests/test_pipeline.py`

Interface: `analisar_jogo` recebe o evento (com props), o elenco (p/ crosswalk), uma função `taxa_fn(player_id) -> dict` que devolve os números do modelo já calculados (μ, prob por linha, minutos, xi, amostra, contexto) e o `repo`. Mantém a matemática fora da IA. A IA é injetada via `analista_fn` p/ testar offline.

- [ ] **Step 1: Escrever o teste que falha**

`tests/test_pipeline.py`:
```python
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.store.repo import InMemoryRepo

EVENT = {
    "id": "evt1", "jogo": "BRA x CRO",
    "bookmakers": [{"key": "dk", "markets": [{"key": "player_shots_on_target", "outcomes": [
        {"description": "Vinicius Jr", "name": "Over", "point": 0.5, "price": 1.72},
        {"description": "Vinicius Jr", "name": "Under", "point": 0.5, "price": 2.10},
    ]}]}],
}
ELENCO = [{"id": 1, "name": "Vinicius Jr"}]

def taxa_fn(player_id, linha):
    # números do modelo já calculados em código (μ alto -> prob alta no over 0.5)
    return {"prob_modelo": 0.75, "mu": 1.9, "minutos_esperados": 88,
            "xi_confirmado": True, "amostra_jogos": 24,
            "sot_concedido_adversario": "alto", "incerteza": "media"}

def fake_analista(candidatos, contexto):
    melhor = candidatos[0] if candidatos else None
    return {"melhor_aposta": ({"jogador": melhor["jogador"], "linha": melhor["linha"],
            "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge alto"} if melhor else None),
            "outras": [], "alertas": []}

def test_pipeline_ponta_a_ponta_gera_candidato_e_grava_ledger():
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, ELENCO, taxa_fn, repo, analista_fn=fake_analista)
    assert len(out["candidatos"]) == 1
    assert out["candidatos"][0]["jogador"] == "Vinicius Jr"
    assert out["ia"]["melhor_aposta"]["jogador"] == "Vinicius Jr"
    assert repo.get_analise("evt1") is not None
    assert len(repo.ledger) == 1  # gravou a aposta sinalizada

def test_pipeline_descarta_jogador_sem_match():
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, [{"id": 9, "name": "Outro Nome Totalmente Diferente"}],
                        taxa_fn, repo, analista_fn=fake_analista)
    assert out["candidatos"] == []  # fail-closed do crosswalk
```

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_pipeline.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`src/odd_analyzer/pipeline.py`:
```python
"""Orquestra a análise de UM jogo: props -> crosswalk -> modelo -> candidatos
-> filtro -> IA -> grava paper_ledger e cache. A matemática vem do código
(builder); a IA só lê. taxa_fn e analista_fn são injetados p/ testar offline."""
from odd_analyzer.odds.the_odds_api import parse_sot_props
from odd_analyzer.crosswalk.match import match_player
from odd_analyzer.candidates.builder import build_candidate
from odd_analyzer.candidates.filtro import filter_candidates
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.ai.analista import analisar as _default_analista

NB_DISPERSION = 3.0  # mesmo r usado no backtest da Fase 1a

def analisar_jogo(event: dict, elenco: list[dict], taxa_fn, repo,
                  overrides: dict | None = None, analista_fn=_default_analista) -> dict:
    candidatos = []
    for prop in parse_sot_props(event):
        m = match_player(prop["player_name"], elenco, overrides=overrides)
        if m is None:
            continue  # fail-closed: sem jogador confiável, descarta
        t = taxa_fn(m["id"], prop["line"])
        prob_modelo = prob_over_line(t["mu"], prop["line"], r=NB_DISPERSION)
        candidatos.append(build_candidate(
            jogador=m["name"], linha=prop["line"],
            odd_over=prop["odd_over"], odd_under=prop["odd_under"],
            prob_modelo=prob_modelo, mu=t["mu"],
            minutos_esperados=t["minutos_esperados"], xi_confirmado=t["xi_confirmado"],
            amostra_jogos=t["amostra_jogos"],
            sot_concedido_adversario=t["sot_concedido_adversario"], incerteza=t["incerteza"],
        ))
    selecionados = filter_candidates(candidatos)
    ia = analista_fn(selecionados, {"jogo": event.get("jogo", event["id"])})
    repo.save_analise(event["id"], {"jogo": event.get("jogo"), "candidatos": selecionados,
                                    "llm_resultado": ia})
    aposta = ia.get("melhor_aposta")
    if aposta and aposta.get("veredito") == "APOSTAR":
        c = next((c for c in selecionados
                  if c["jogador"] == aposta["jogador"] and c["linha"] == aposta["linha"]), None)
        if c:
            repo.save_ledger([{"event_id": event["id"], "jogador": c["jogador"], "linha": c["linha"],
                               "odd_flag": c["odd"], "prob_modelo": c["prob_modelo"],
                               "prob_devig": c["prob_devig"], "edge": c["edge"], "ev": c["ev"]}])
    return {"candidatos": selecionados, "ia": ia}
```

> Nota: `prob_modelo` no teste 1 = `prob_over_line(1.9, 0.5, r=3.0)` (P(X≥1)) ≈ 0.79, bem acima da prob de-vig (~0.55 de 1.72/2.10) → edge e EV passam o filtro. Se o cálculo exato divergir do corte, ajustar o μ do `taxa_fn` no teste, não o corte.

- [ ] **Step 4: Rodar p/ confirmar que passa**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_pipeline.py -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/pipeline.py tests/test_pipeline.py
git commit -m "feat: orquestrador de analise de 1 jogo (ponta-a-ponta)"
```

---

## Task 13: Front Streamlit (`app/streamlit_app.py`)

**Files:**
- Create: `app/streamlit_app.py`
- Test: `tests/test_front_smoke.py` (smoke de import; UI não é testada por unidade)

> Pré-requisito: Task 1 confirmou que `streamlit` importa no 3.14. Se não importou, este task vira o fallback `http.server` (mini-plano separado).

- [ ] **Step 1: Teste de smoke (import não quebra)**

`tests/test_front_smoke.py`:
```python
import importlib
import pytest

def test_app_importa():
    pytest.importorskip("streamlit")
    # import não deve executar a UI nem exigir env vars
    mod = importlib.import_module("app.streamlit_app")
    assert hasattr(mod, "render")
```

> Para o teste achar `app/`, adicionar `.` ao pythonpath do pytest: editar `pytest.ini` para `pythonpath = src .`.

- [ ] **Step 2: Rodar p/ confirmar que falha**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_front_smoke.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.streamlit_app'`.

- [ ] **Step 3: Ajustar pytest.ini**

`pytest.ini`:
```ini
[pytest]
pythonpath = src .
testpaths = tests
```

- [ ] **Step 4: Implementar**

`app/streamlit_app.py`:
```python
"""Front mínimo (página única): lista jogos da Copa, analisa um jogo, mostra
candidatos de valor e a recomendação da IA, e o resumo do paper_ledger.
A lógica toda vem do pipeline; este arquivo só renderiza. Sem capricho visual.
Rodar: streamlit run app/streamlit_app.py"""
import streamlit as st
from odd_analyzer.odds.the_odds_api import fetch_events, fetch_event_odds
from odd_analyzer.store.repo import SupabaseRepo
from odd_analyzer.pipeline import analisar_jogo

SPORT = "soccer_fifa_world_cup"

def _taxa_fn(player_id, linha):
    # PLACEHOLDER de wiring: substituir pela leitura real do modelo (Fase 1a)
    # quando houver stats da temporada (API-Football Pro). Por ora sinaliza
    # "sem projeção" devolvendo amostra 0 -> filtro descarta.
    return {"prob_modelo": 0.0, "mu": 0.0, "minutos_esperados": 0,
            "xi_confirmado": False, "amostra_jogos": 0,
            "sot_concedido_adversario": "n/d", "incerteza": "alta"}

def render():
    st.title("odd-analyzer — Copa 2026")
    repo = SupabaseRepo()
    if st.button("↻ atualizar jogos"):
        st.session_state["eventos"] = fetch_events(SPORT)
    eventos = st.session_state.get("eventos", [])
    if not eventos:
        st.info("Clique em '↻ atualizar jogos' para carregar a lista.")
        return
    rotulos = {f'{e.get("home_team")} x {e.get("away_team")}': e for e in eventos}
    escolha = st.selectbox("Jogo", list(rotulos))
    evt = rotulos[escolha]
    if st.button("Analisar jogo"):
        odds = fetch_event_odds(SPORT, evt["id"])
        props = odds.get("bookmakers", [])
        if not props:
            st.warning("Odds de SOT ainda não postadas para este jogo (casas postam perto do kickoff).")
            return
        evt_full = dict(evt, jogo=escolha, bookmakers=props)
        out = analisar_jogo(evt_full, elenco=[], taxa_fn=_taxa_fn, repo=repo)
        if not out["candidatos"]:
            st.warning("Nenhuma oportunidade clara (sem projeção do modelo ou abaixo dos cortes).")
        else:
            st.table(out["candidatos"])
            ap = out["ia"].get("melhor_aposta")
            if ap:
                st.success(f'MELHOR: {ap["jogador"]} {ap["linha"]} — {ap["veredito"]} '
                           f'({ap["confianca"]}) · {ap["motivo"]}')

if __name__ == "__main__" or st.runtime.exists():
    render()
```

> Nota de escopo honesto: o `elenco=[]` e o `_taxa_fn` placeholder fazem o front rodar de ponta a ponta SEM stats reais (mostra a lista de jogos e o estado "sem projeção"). O wiring real do modelo + elenco (API-Football) é o passo de "ir ao vivo" (depende de stats da temporada atual = API-Football Pro $19). Está isolado nessas duas funções de propósito.

- [ ] **Step 5: Rodar smoke + lançar manualmente**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_front_smoke.py -v`
Expected: PASS.
Run (manual, opcional): `.\.venv\Scripts\python.exe -m streamlit run app/streamlit_app.py`
Expected: abre no navegador; "↻ atualizar jogos" lista jogos da Copa (créditos 0).

- [ ] **Step 6: Commit**

```bash
git add app/streamlit_app.py tests/test_front_smoke.py pytest.ini
git commit -m "feat: front Streamlit minimo (lista jogos + analise + IA)"
```

---

## Task 14: Suíte completa + atualizar .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Acrescentar as novas envs**

`.env.example` (acrescentar):
```
THE_ODDS_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

- [ ] **Step 2: Rodar a suíte inteira**

Run: `.\.venv\Scripts\python.exe -m pytest -q`
Expected: todos passam (40 da Fase 1a + ~38 novos desta fase).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: env vars da Fase 1b (THE_ODDS_API_KEY, OPENROUTER_*)"
```

---

## Self-Review (do autor do plano)

**Cobertura do spec:**
- §2 de-vig+EV → Tasks 2-3 ✓
- §3 candidatos/filtro → Tasks 4-5 ✓
- §4 IA OpenRouter (schema+transporte+analista) → Tasks 6-8 ✓
- §5 odds + crosswalk + join → Tasks 9, 10, 12 ✓
- §6 persistência Supabase + CLV → Task 11 ✓
- §7 front Streamlit → Task 13 ✓
- §8 testes/deps/ir-ao-vivo → Tasks 1, 13 (nota de wiring), 14 ✓
- §9 riscos (fail-closed, anti-alucinação) → cobertos em Tasks 6, 8, 10, 12 ✓

**Consistência de tipos/assinaturas:**
- `fair_prob_over` (Task 2) usada em `build_candidate` (Task 4) ✓
- `edge_ev` retorna `{"edge","ev"}` (Task 3) consumido em Task 4 ✓
- `build_candidate` produz chaves usadas pelo `filtro` (Task 5) e pelo `pipeline` (Task 12) ✓
- `parse_sot_props` devolve `{player_name,line,book,odd_over,odd_under}` (Task 9) consumido no `pipeline` (Task 12) ✓
- `match_player` devolve `{id,name,confianca}|None` (Task 10) usado no `pipeline` (Task 12) ✓
- `InMemoryRepo`/`SupabaseRepo` mesma interface `Repo` (Task 11) usada por `pipeline` (Task 12) e front (Task 13) ✓
- `analisar` (Task 8) assinatura `(candidatos, contexto, _chat)` — no `pipeline` é injetada como `analista_fn(candidatos, contexto)` (Task 12) ✓

**Decisão registrada:** correção do spec §2 (conservador = MAIOR prob justa do over) aplicada antes de planejar.
