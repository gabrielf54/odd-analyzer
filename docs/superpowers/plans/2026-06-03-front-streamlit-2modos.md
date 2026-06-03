# Front Streamlit (2 modos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 🚫 **GIT SAFETY (lição de incidente anterior):** subagentes compartilham o working tree. Em TODO subagente, só comandos git read-only + `git add`/`git commit` no branch atual. **NUNCA** `git checkout`/`switch`/`reset`/`branch`/`stash`/`cherry-pick`/`restore`. O controller verifica o branch após cada commit.

**Goal:** Primeira UI navegável — escolher um jogo, varrer o elenco nos mercados de jogador, ver candidatos (edge/EV) + veredito da IA, em 2 modos (pós-jogo valida / pré-jogo opera), com a lógica atrás de uma camada de serviço reutilizável.

**Architecture:** UI Streamlit fina (`app/streamlit_app.py`) → camada de serviço estável (`src/odd_analyzer/service.py`, dados puros) → motor validado intacto (`runner`/`pipeline`/`BSDClient`/`repo`). O serviço é o contrato que um futuro FastAPI/Next.js envolverá sem reescrever lógica.

**Tech Stack:** Python 3 (`.venv`), Streamlit, pytest. BSD/Bzzoiro API. Sem libs novas além de Streamlit (já no repo).

**Spec:** [../specs/2026-06-03-front-streamlit-2modos-design.md](../specs/2026-06-03-front-streamlit-2modos-design.md)

**Rodar testes:** `.venv\Scripts\python.exe -m pytest -q` · **Rodar app:** `.venv\Scripts\streamlit run app/streamlit_app.py`

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `src/odd_analyzer/candidates/builder.py` | Modify | `build_candidate` ganha `player_id` (p/ join pós-jogo) |
| `src/odd_analyzer/pipeline.py` | Modify | `_contagem_jogador` propaga `player_id`; `_contagem_partida` passa None |
| `src/odd_analyzer/service.py` | Create | Contrato estável: `listar_jogos`, `analisar`, `resultado_real_jogador`, `apostar_paper` |
| `app/streamlit_app.py` | Rewrite | UI fina: 2 telas, toggle de modo, abas de mercado, odds manual, tabela + IA |
| `tests/test_service.py` | Create | Testes da camada de serviço com fakes |
| `tests/test_front_smoke.py` | Modify/Replace | Smoke: o módulo do app importa sem quebrar |

---

### Task 1: `player_id` no candidato (habilita join pós-jogo)

**Files:**
- Modify: `src/odd_analyzer/candidates/builder.py`
- Modify: `src/odd_analyzer/pipeline.py` (`_contagem_jogador`, `_contagem_partida`)
- Test: `tests/test_builder.py`

- [ ] **Step 1: Escrever o teste que falha** — anexar a `tests/test_builder.py`:

```python
from odd_analyzer.candidates.builder import build_candidate

def test_build_candidate_carrega_player_id():
    c = build_candidate(
        jogador="Kaiki", linha=1.5, odd_over=1.90, odd_under=1.90,
        prob_modelo=0.73, mu=2.0, minutos_esperados=90.0, xi_confirmado=True,
        amostra_jogos=50, concedido_adversario="14.6", incerteza="baixa",
        market_type="desarmes", player_id="1867",
    )
    assert c["player_id"] == "1867"

def test_build_candidate_player_id_default_none():
    c = build_candidate(
        jogador="Total", linha=8.5, odd_over=1.90, odd_under=1.90,
        prob_modelo=0.5, mu=9.0, minutos_esperados=90.0, xi_confirmado=True,
        amostra_jogos=10, concedido_adversario="n/d", incerteza="media",
        market_type="escanteios",
    )
    assert c["player_id"] is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_builder.py -k player_id -v`
Expected: FAIL (`unexpected keyword argument 'player_id'`)

- [ ] **Step 3: Implementar** — em `src/odd_analyzer/candidates/builder.py`, adicionar o parâmetro (default None, retrocompatível) e incluir no dict:

```python
def build_candidate(
    jogador, linha, odd_over, odd_under, prob_modelo, mu,
    minutos_esperados, xi_confirmado, amostra_jogos,
    concedido_adversario, incerteza, market_type: str,
    player_id=None,
) -> dict:
    prob_devig = fair_prob_over(odd_over, odd_under)
    m = edge_ev(prob_modelo, prob_devig, odd_over)
    return {
        "jogador": jogador,
        "player_id": player_id,
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
        "concedido_adversario": concedido_adversario,
        "incerteza": incerteza,
        "market_type": market_type,
    }
```

Em `src/odd_analyzer/pipeline.py`, `_contagem_jogador`, na chamada `build_candidate(...)` dentro do loop, adicionar o argumento `player_id=entidade["id"],`. (O `_contagem_partida` não passa `player_id` → fica None pelo default; não mexer nele.)

- [ ] **Step 4: Rodar e ver passar (suíte inteira)**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: PASS. Se algum teste comparava o dict de candidato por igualdade exata e quebrou com a nova chave, atualizar esse teste para incluir `player_id` (e reportar qual).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/candidates/builder.py src/odd_analyzer/pipeline.py tests/test_builder.py
git commit -m "feat: player_id no candidato (habilita join de resultado real no pos-jogo)"
```

---

### Task 2: `service.listar_jogos`

**Files:**
- Create: `src/odd_analyzer/service.py`
- Test: `tests/test_service.py`

- [ ] **Step 1: Escrever o teste que falha** — criar `tests/test_service.py`:

```python
from odd_analyzer.service import listar_jogos

class _FakeClient:
    def events(self, **kw):
        assert kw.get("status") == "finished"
        return {"results": [
            {"id": 7166, "home_team": "Cruzeiro", "away_team": "Fluminense",
             "event_date": "2026-05-31T23:30:00+00:00", "status": "finished",
             "home_score": 1, "away_score": 1},
            {"id": 7171, "home_team": "Remo", "away_team": "São Paulo",
             "event_date": "2026-05-31T23:30:00+00:00", "status": "finished",
             "home_score": 1, "away_score": 0},
        ]}

def test_listar_jogos_mapeia_forma_bsd():
    jogos = listar_jogos(_FakeClient(), league_id=9, status="finished", limit=50)
    assert len(jogos) == 2
    j = jogos[0]
    assert j["id"] == 7166
    assert j["mandante"] == "Cruzeiro" and j["visitante"] == "Fluminense"
    assert j["status"] == "finished"
    assert j["placar"] == "1×1"

def test_listar_jogos_sem_placar_quando_nao_finalizado():
    class _C:
        def events(self, **kw):
            return {"results": [
                {"id": 99, "home_team": "A", "away_team": "B",
                 "event_date": "2026-07-01T00:00:00+00:00", "status": "notstarted",
                 "home_score": None, "away_score": None},
            ]}
    jogos = listar_jogos(_C(), league_id=9, status="notstarted")
    assert jogos[0]["placar"] is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k listar -v`
Expected: FAIL (`No module named ...service`)

- [ ] **Step 3: Implementar** — criar `src/odd_analyzer/service.py`:

```python
"""Camada de serviço: contrato estável entre a UI (Streamlit hoje, FastAPI/Next.js
amanhã) e o motor validado. Funções puras, sem Streamlit e sem print; recebem
client/repo injetados → testáveis com fakes. Devolvem dados JSON-serializáveis."""
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.runner import run_analise


def listar_jogos(client, league_id, status, limit: int = 50) -> list[dict]:
    """Lista jogos de uma liga no BSD. status='finished' (pós-jogo) ou
    'notstarted' (pré-jogo). Retorna dados puros p/ a UI."""
    data = client.events(league_id=league_id, status=status, limit=limit)
    results = data.get("results", []) if isinstance(data, dict) else []
    jogos = []
    for ev in results[:limit]:
        hs, as_ = ev.get("home_score"), ev.get("away_score")
        placar = f"{hs}×{as_}" if (hs is not None and as_ is not None) else None
        jogos.append({
            "id": ev.get("id"),
            "mandante": ev.get("home_team"),
            "visitante": ev.get("away_team"),
            "data": ev.get("event_date"),
            "status": ev.get("status"),
            "placar": placar,
        })
    return jogos
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k listar -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: service.listar_jogos (lista jogos do BSD como dados puros)"
```

---

### Task 3: `service.analisar`

**Files:**
- Modify: `src/odd_analyzer/service.py`
- Test: `tests/test_service.py`

Contexto: `run_analise(client, event_id, market_key, player_ref, linha, odd_over, odd_under, usar_ia, repo)` já existe e devolve `{"candidatos": [...], "ia": {...}}` (varredura com `player_ref=None`). O serviço envolve isso, adiciona o rótulo do jogo e a flag `em_validacao` (mercados de partida não calibram → UI sela).

- [ ] **Step 1: Escrever o teste que falha** — anexar a `tests/test_service.py`:

```python
from odd_analyzer.service import analisar
from odd_analyzer.model.markets import MARKETS

def _fake_client_para_analise():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "Cruzeiro", "away_team": "Fluminense",
                    "home_team_id": 150, "away_team_id": 153}
        def lineups(self, eid):
            return {"lineups": {"home": {"team_id": 150, "players": [
                {"id": 1867, "name": "Kaiki", "position": "M"}]}, "away": {"team_id": 153, "players": []}}}
        def player_stats(self, pid):
            return {"results": [{"event_id": i, "total_tackle": 3, "minutes_played": 90} for i in range(12)]}
        def events(self, **kw):
            return {"results": []}
        def event_stats(self, eid):
            return {"stats": {}}
    return _C()

def test_analisar_jogador_retorna_estrutura():
    out = analisar(_fake_client_para_analise(), event_id=7166, market_key="desarmes",
                   linha=1.5, odd_over=1.90, odd_under=1.90, usar_ia=False)
    assert out["jogo"] == "Cruzeiro x Fluminense"
    assert out["em_validacao"] is False
    assert isinstance(out["candidatos"], list)
    assert "ia" in out

def test_analisar_marca_em_validacao_para_partida():
    out = analisar(_fake_client_para_analise(), event_id=7166, market_key="escanteios",
                   linha=8.5, odd_over=1.90, odd_under=1.90, usar_ia=False)
    assert out["em_validacao"] is True
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k analisar -v`
Expected: FAIL (`cannot import name 'analisar'`)

- [ ] **Step 3: Implementar** — adicionar a `src/odd_analyzer/service.py`:

```python
def analisar(client, event_id, market_key, linha, odd_over, odd_under,
             usar_ia: bool = False, repo=None) -> dict:
    """Roda a varredura do elenco (player_ref=None) p/ 1 jogo+mercado. Devolve
    {jogo, candidatos, ia, em_validacao}. em_validacao=True p/ mercados de partida
    (gols/escanteios) que ainda não calibram → a UI sela ('não apostar')."""
    if market_key not in MARKETS:
        raise ValueError(f"mercado desconhecido: {market_key}. Opções: {list(MARKETS)}")
    market = MARKETS[market_key]
    em_validacao = market.nivel == "partida"

    raw = client.get_event(event_id)
    jogo = f'{raw.get("home_team", "")} x {raw.get("away_team", "")}'.strip(" x")

    out = run_analise(client, event_id, market_key, None,
                      linha, odd_over, odd_under, usar_ia=usar_ia, repo=repo)
    return {
        "jogo": jogo,
        "candidatos": out.get("candidatos", []),
        "ia": out.get("ia", {}),
        "em_validacao": em_validacao,
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k analisar -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: service.analisar (varredura + flag em_validacao p/ partida)"
```

---

### Task 4: `service.resultado_real_jogador` (modo pós-jogo)

**Files:**
- Modify: `src/odd_analyzer/service.py`
- Test: `tests/test_service.py`

Contexto: em jogo finalizado, o serviço lê `client.event_player_stats(event_id)` → `{"player_stats": [{player_id, <stat_field>, ...}]}` e diz, por jogador, se o stat real superou a linha. A UI junta com o candidato por `player_id` (Task 1).

- [ ] **Step 1: Escrever o teste que falha** — anexar a `tests/test_service.py`:

```python
from odd_analyzer.service import resultado_real_jogador

def test_resultado_real_jogador_calcula_bateu():
    class _C:
        def event_player_stats(self, eid):
            return {"player_stats": [
                {"player_id": 1867, "total_tackle": 3, "minutes_played": 90},
                {"player_id": 1861, "total_tackle": 1, "minutes_played": 90},
            ]}
    res = resultado_real_jogador(_C(), event_id=7166, market_key="desarmes", linha=1.5)
    assert res["1867"]["valor_real"] == 3
    assert res["1867"]["bateu"] is True
    assert res["1861"]["bateu"] is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k resultado_real -v`
Expected: FAIL (`cannot import name 'resultado_real_jogador'`)

- [ ] **Step 3: Implementar** — adicionar a `src/odd_analyzer/service.py`:

```python
def resultado_real_jogador(client, event_id, market_key, linha) -> dict:
    """Modo pós-jogo: lê os actuals de /events/{id}/player-stats/ e diz, por player_id,
    o valor real do stat do mercado e se superou a linha. Chave = str(player_id)."""
    market = MARKETS[market_key]
    field = market.stat_field
    data = client.event_player_stats(event_id)
    rows = data.get("player_stats", []) if isinstance(data, dict) else []
    out = {}
    for row in rows:
        pid = row.get("player_id")
        if pid is None:
            continue
        valor = row.get(field) or 0
        out[str(pid)] = {"valor_real": valor, "bateu": valor > linha}
    return out
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k resultado_real -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: service.resultado_real_jogador (actuals p/ validacao pos-jogo)"
```

---

### Task 5: `service.apostar_paper` (modo pré-jogo)

**Files:**
- Modify: `src/odd_analyzer/service.py`
- Test: `tests/test_service.py`

Contexto: no pré-jogo, o usuário registra uma aposta-papel. O serviço grava no `paper_ledger` via `repo.save_ledger([row])` (mesma forma que `pipeline` usa) e **bloqueia** mercados `em_validacao`.

- [ ] **Step 1: Escrever o teste que falha** — anexar a `tests/test_service.py`:

```python
import pytest
from odd_analyzer.service import apostar_paper
from odd_analyzer.store.repo import InMemoryRepo

_CAND = {
    "jogador": "Kaiki", "linha": 1.5, "odd": 1.90, "market_type": "desarmes",
    "prob_modelo": 0.73, "prob_devig": 0.55, "edge": 0.18, "ev": 0.24,
}

def test_apostar_paper_grava_no_ledger():
    repo = InMemoryRepo()
    apostar_paper(repo, event_id="7166", candidato=_CAND, em_validacao=False)
    assert len(repo.ledger) == 1
    row = repo.ledger[0]
    assert row["event_id"] == "7166" and row["jogador"] == "Kaiki"
    assert row["market_type"] == "desarmes" and row["odd_flag"] == 1.90

def test_apostar_paper_bloqueia_em_validacao():
    repo = InMemoryRepo()
    with pytest.raises(ValueError):
        apostar_paper(repo, event_id="7166", candidato=_CAND, em_validacao=True)
    assert repo.ledger == []
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k apostar -v`
Expected: FAIL (`cannot import name 'apostar_paper'`)

- [ ] **Step 3: Implementar** — adicionar a `src/odd_analyzer/service.py`:

```python
def apostar_paper(repo, event_id, candidato: dict, em_validacao: bool = False) -> None:
    """Modo pré-jogo: grava a aposta-papel no paper_ledger. Bloqueia mercados
    em validação (gols/escanteios não calibram → não registrar como aposta real)."""
    if em_validacao:
        raise ValueError("mercado em validação — não registrar aposta-papel")
    repo.save_ledger([{
        "event_id": str(event_id),
        "jogador": candidato["jogador"],
        "linha": candidato["linha"],
        "market_type": candidato["market_type"],
        "odd_flag": candidato["odd"],
        "prob_modelo": candidato["prob_modelo"],
        "prob_devig": candidato["prob_devig"],
        "edge": candidato["edge"],
        "ev": candidato["ev"],
    }])
```

- [ ] **Step 4: Rodar e ver passar (suíte)**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -q`
Expected: PASS (todos os testes de serviço)

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: service.apostar_paper (paper-bet no ledger; bloqueia em_validacao)"
```

---

### Task 6: Reescrever `app/streamlit_app.py` (2 telas, 2 modos)

**Files:**
- Rewrite: `app/streamlit_app.py`
- Test: `tests/test_front_smoke.py`

Contexto: o app atual está quebrado (The Odds API + assinatura velha de `analisar_jogo` + `_taxa_fn` placeholder). Reescrever do zero consumindo SÓ o `service.py`. Navegação entre telas via `st.session_state`. UI fina, sem lógica de negócio.

- [ ] **Step 1: Escrever o smoke test que falha** — substituir o conteúdo de `tests/test_front_smoke.py` por:

```python
"""Smoke: o módulo do app importa sem quebrar e expõe as funções de tela.
Streamlit não é testado pixel-a-pixel; a lógica está em service.py (testada)."""
import importlib.util
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app" / "streamlit_app.py"

def test_app_importa_sem_erro():
    spec = importlib.util.spec_from_file_location("streamlit_app", APP)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # não deve levantar; render() só roda sob runtime do streamlit
    assert hasattr(mod, "render")
    assert hasattr(mod, "tela_lista") and hasattr(mod, "tela_analise")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv\Scripts\python.exe -m pytest tests/test_front_smoke.py -v`
Expected: FAIL (app antigo não tem `tela_lista`/`tela_analise`, ou quebra ao importar pelas deps antigas)

- [ ] **Step 3: Implementar** — substituir todo o conteúdo de `app/streamlit_app.py` por:

```python
"""Front (Streamlit) — 2 telas, 2 modos. UI fina: chama só odd_analyzer.service,
nunca o motor direto. Rodar: streamlit run app/streamlit_app.py

Modos: pós-jogo (jogos finalizados, mostra resultado real) e pré-jogo (jogos
futuros, registra paper-bet). Mercados de jogador confiáveis; partida selado."""
import streamlit as st

from odd_analyzer.config import get_required
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.store.repo import InMemoryRepo
from odd_analyzer import service

MERCADOS_JOGADOR = [("sot", "SOT"), ("finalizacoes", "Finalizações"), ("desarmes", "Desarmes")]
MERCADOS_PARTIDA = [("gols", "Gols"), ("escanteios", "Escanteios")]


@st.cache_resource
def _client():
    return BSDClient(get_required("BZZOIRO_API_KEY"))


@st.cache_resource
def _repo():
    try:
        from odd_analyzer.store.repo import SupabaseRepo
        return SupabaseRepo()
    except Exception:
        return InMemoryRepo()  # fallback offline


def tela_lista():
    st.title("odd-analyzer")
    modo = st.radio("Modo", ["Pós-jogo (validar)", "Pré-jogo (operar)"], horizontal=True)
    status = "finished" if modo.startswith("Pós") else "notstarted"
    st.session_state["modo"] = "pos" if status == "finished" else "pre"
    league = st.number_input("Liga (BSD league_id)", value=9, step=1)
    busca = st.text_input("Buscar time").strip().lower()

    try:
        jogos = service.listar_jogos(_client(), int(league), status)
    except Exception as e:
        st.error(f"Fonte indisponível ({type(e).__name__}). Tente de novo. "
                 f"Se persistir, confira BZZOIRO_API_KEY no .env.")
        return
    if busca:
        jogos = [j for j in jogos if busca in (str(j["mandante"]) + str(j["visitante"])).lower()]
    if not jogos:
        st.info("Nenhum jogo nesse filtro.")
        return
    for j in jogos:
        placar = f" {j['placar']} " if j["placar"] else " × "
        col1, col2 = st.columns([4, 1])
        col1.write(f"**{j['mandante']}**{placar}**{j['visitante']}** · {(j['data'] or '')[:10]} · {j['status']}")
        if col2.button("Analisar →", key=f"go-{j['id']}"):
            st.session_state["evento"] = j
            st.rerun()


def tela_analise():
    j = st.session_state["evento"]
    modo = st.session_state.get("modo", "pos")
    if st.button("← voltar"):
        del st.session_state["evento"]
        st.rerun()
    placar = f" {j['placar']} " if j["placar"] else " × "
    st.subheader(f"{j['mandante']}{placar}{j['visitante']}")

    aba_labels = [lbl for _, lbl in MERCADOS_JOGADOR] + [f"{lbl} 🏷" for _, lbl in MERCADOS_PARTIDA]
    todos = MERCADOS_JOGADOR + MERCADOS_PARTIDA
    abas = st.tabs(aba_labels)
    for aba, (mkey, _) in zip(abas, todos):
        with aba:
            _render_mercado(j, mkey, modo)


def _render_mercado(j, market_key, modo):
    em_validacao = market_key in dict(MERCADOS_PARTIDA)
    if em_validacao:
        st.warning("EM VALIDAÇÃO — este mercado ainda não calibra; não apostar.")
    c1, c2, c3, c4 = st.columns(4)
    linha = c1.number_input("Linha", value=1.5, step=0.5, key=f"l-{market_key}")
    over = c2.number_input("Over", value=1.90, step=0.01, key=f"o-{market_key}")
    under = c3.number_input("Under", value=1.90, step=0.01, key=f"u-{market_key}")
    usar_ia = c4.checkbox("IA", key=f"ia-{market_key}")
    if not st.button("Varrer elenco", key=f"scan-{market_key}"):
        return
    try:
        out = service.analisar(_client(), j["id"], market_key, linha, over, under, usar_ia=usar_ia, repo=_repo())
    except Exception as e:
        st.error(f"Falha na análise ({type(e).__name__}).")
        return
    cands = out["candidatos"]
    if not cands:
        st.info("Nenhum candidato com valor (edge/EV abaixo do corte). Poucas oportunidades fortes > muitas fracas.")
        return

    reais = {}
    if modo == "pos":
        try:
            reais = service.resultado_real_jogador(_client(), j["id"], market_key, linha)
        except Exception:
            reais = {}

    linhas_tab = []
    for c in cands:
        row = {
            "Jogador": c["jogador"], "Linha": c["linha"], "p_mod": round(c["prob_modelo"], 3),
            "p_devig": round(c["prob_devig"], 3), "Edge": round(c["edge"], 3), "EV": round(c["ev"], 3),
            "n": c["amostra_jogos"], "adv_concede": c.get("concedido_adversario", "n/d"),
        }
        if modo == "pos":
            r = reais.get(str(c.get("player_id")))
            row["Resultado"] = (f"{r['valor_real']} {'✅' if r['bateu'] else '❌'}") if r else "n/d"
        linhas_tab.append(row)
    st.table(linhas_tab)

    if modo == "pre":
        for c in cands:
            if st.button(f"Apostar (paper): {c['jogador']} {c['linha']}", key=f"bet-{market_key}-{c.get('player_id')}-{c['linha']}",
                         disabled=em_validacao):
                try:
                    service.apostar_paper(_repo(), j["id"], c, em_validacao=em_validacao)
                    st.success("Registrado no paper_ledger.")
                except Exception as e:
                    st.error(f"Não registrado: {e}")

    ia = out.get("ia") or {}
    ap = ia.get("melhor_aposta")
    if ap:
        st.success(f"🤖 {ap['jogador']} {ap['linha']} — {ap['veredito']} ({ap['confianca']}) · {ap['motivo']}")
    for alerta in ia.get("alertas", []):
        st.caption(f"[IA] {alerta}")


def render():
    if "evento" in st.session_state:
        tela_analise()
    else:
        tela_lista()


if st.runtime.exists():
    render()
```

- [ ] **Step 4: Rodar e ver passar (smoke + suíte)**

Run: `.venv\Scripts\python.exe -m pytest tests/test_front_smoke.py tests/ -q`
Expected: PASS. (O smoke importa o módulo; `render()` não roda fora do runtime do Streamlit por causa do guard `if st.runtime.exists()`.)
> Se o import falhar porque `st.runtime` não existe como atributo na versão instalada, trocar o guard final por `if __name__ == "__main__" or (hasattr(st, "runtime") and st.runtime.exists()):` e reportar.

- [ ] **Step 5: Commit**

```bash
git add app/streamlit_app.py tests/test_front_smoke.py
git commit -m "feat: reescreve front Streamlit — 2 telas, 2 modos, sobre service.py"
```

---

### Task 7: Sanity ao vivo (BSD real) — checklist manual

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar o app contra o BSD vivo**

Run: `.venv\Scripts\streamlit run app/streamlit_app.py`
No navegador: modo **Pós-jogo**, liga **9**, achar **Cruzeiro × Fluminense** (event 7166) → Analisar → aba **Desarmes** → linha 1.5, over/under 1.90 → **Varrer elenco**.
Expected: aparece tabela com candidatos (ex.: **Kaiki** edge>0) e a coluna **Resultado** com o valor real (✅/❌). Trocar de aba (SOT/Finalizações) funciona. Abas Gols/Escanteios mostram o selo "EM VALIDAÇÃO".

- [ ] **Step 2: Registrar o sanity no ROADMAP**

Adicionar uma nota curta em `docs/ROADMAP.md` (seção "Como retomar" ou follow-up `front 2 modos`): front Streamlit 2-modos no ar sobre `service.py`; sanity OK no evento 7166; próximos = ligar CLV-snapshot forward e migração Next.js (serviço já pronto). Commit:

```bash
git add docs/ROADMAP.md
git commit -m "docs: front Streamlit 2-modos no ar (sanity 7166) + proximos passos"
```

---

## Self-Review (preenchido)

**Spec coverage:** camada de serviço (4 funções) ✓ Tasks 2-5. `player_id` p/ join ✓ Task 1. 2 telas + toggle ✓ Task 6. abas 3 jogador + 2 partida seladas ✓ Task 6 (`MERCADOS_PARTIDA` + warning + botão disabled). odds manual ✓ Task 6. resultado real pós-jogo ✓ Task 4+6. paper-bet pré-jogo ✓ Task 5+6. tratamento de erro (sem key/BSD falha/sem candidato/em_validacao) ✓ Task 6. testes do serviço com fakes ✓ Tasks 2-5; smoke da UI ✓ Task 6. sanity ao vivo ✓ Task 7.

**Placeholder scan:** sem TBD/TODO. O único ponto "condicional" é o guard `st.runtime.exists()` (Task 6 Step 4 dá o fallback exato se a versão do streamlit divergir). Sem "add error handling" vago — os erros tratados estão escritos no código.

**Type consistency:** `service.analisar` devolve `{jogo, candidatos, ia, em_validacao}` consumido na Task 6. `resultado_real_jogador` chaveia por `str(player_id)`; o candidato carrega `player_id` (Task 1) e a UI junta por `str(c["player_id"])`. `apostar_paper(repo, event_id, candidato, em_validacao)` assinatura igual entre Task 5 e a chamada na Task 6. `listar_jogos` retorna `{id,mandante,visitante,data,status,placar}` usado na Task 6.
