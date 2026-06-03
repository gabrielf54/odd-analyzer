# Seletor de jogador (escalação provável) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a varredura cega de elenco por um seletor de 1 jogador por vez, alimentado pela escalação provável (fallback: quem jogou nos últimos 3 jogos), nos mercados de jogador (SOT/finalizações/desarmes).

**Architecture:** Toda a lógica nova vive em `service.py` (puro, testável com fake client). O front `streamlit_app.py` continua fino: só chama `service`. `run_analise` já restringe a 1 jogador via `OnlyPlayer` — `analisar` só precisa repassar `player_ref`.

**Tech Stack:** Python 3, pytest, Streamlit. Ambiente em `.venv` — rodar testes com `.venv\Scripts\python.exe -m pytest`.

Spec: `docs/superpowers/specs/2026-06-03-front-picker-jogador-design.md`.

---

## File Structure

- `src/odd_analyzer/service.py` — **modificar**: adicionar `escalacao_provavel`, `media_recente_jogador`, helpers `_players_from_lineup`/`_players_ultimos3`; param `player_ref` em `analisar`.
- `app/streamlit_app.py` — **modificar**: `_render_mercado` ganha branch de mercado de jogador; novo `_render_picker`.
- `tests/test_service.py` — **modificar**: testes das funções novas e do repasse de `player_ref`.
- `tests/test_front_smoke.py` — **inalterado**: garante que o app importa.

---

## Task 1: `escalacao_provavel` — escalação provável + fallback últimos 3

**Files:**
- Modify: `src/odd_analyzer/service.py`
- Test: `tests/test_service.py`

- [ ] **Step 1: Write the failing tests**

Adicionar ao fim de `tests/test_service.py`:

```python
from odd_analyzer.service import escalacao_provavel


def test_escalacao_provavel_usa_lineup_quando_existe():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "Flamengo", "away_team": "Palmeiras",
                    "home_team_id": 150, "away_team_id": 160}
        def lineups(self, eid):
            return {"lineup_status": "confirmed", "lineups": {
                "home": {"team_id": 150, "players": [
                    {"id": 11, "name": "Wesley", "position": "D"},
                    {"id": 12, "name": "Gerson", "position": "M"}]},
                "away": {"team_id": 160, "players": [
                    {"id": 21, "name": "Piquerez", "position": "D"}]}}}
    esc = escalacao_provavel(_C(), event_id=7000)
    assert esc["origem"] == "confirmada"
    assert esc["home"]["team_name"] == "Flamengo" and esc["home"]["team_id"] == "150"
    nomes_home = [p["name"] for p in esc["home"]["jogadores"]]
    assert nomes_home == ["Wesley", "Gerson"]
    assert esc["home"]["jogadores"][0]["id"] == "11"  # id vira string
    assert esc["home"]["jogadores"][0]["posicao"] == "D"
    assert [p["name"] for p in esc["away"]["jogadores"]] == ["Piquerez"]


def test_escalacao_provavel_marca_provavel_sem_confirmacao():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "A", "away_team": "B",
                    "home_team_id": 1, "away_team_id": 2}
        def lineups(self, eid):
            return {"lineups": {
                "home": {"team_id": 1, "players": [{"id": 9, "name": "X", "position": "F"}]},
                "away": {"team_id": 2, "players": []}}}
    esc = escalacao_provavel(_C(), event_id=1)
    assert esc["origem"] == "provavel"


def test_escalacao_provavel_fallback_ultimos3():
    class _C:
        def get_event(self, eid):
            return {"id": eid, "home_team": "A", "away_team": "B",
                    "home_team_id": 1, "away_team_id": 2}
        def lineups(self, eid):
            return {"lineups": {"home": {"team_id": 1, "players": []},
                                "away": {"team_id": 2, "players": []}}}
        def events(self, **kw):
            # 3 jogos finalizados do time pedido
            assert kw.get("status") == "finished"
            return {"results": [{"id": 501}, {"id": 502}, {"id": 503}]}
        def event_player_stats(self, eid):
            return {"player_stats": [
                {"player_id": 100, "name": "Joao", "position": "D", "minutes_played": 90},
                {"player_id": 101, "name": "Pedro", "minutes_played": 0},   # não jogou
                {"player_id": 100, "name": "Joao", "minutes_played": 45},   # dup → 1 vez
            ]}
    esc = escalacao_provavel(_C(), event_id=1)
    assert esc["origem"] == "ultimos3"
    ids = [p["id"] for p in esc["home"]["jogadores"]]
    assert ids == ["100"]                      # Pedro (0 min) fora; Joao deduplicado
    assert esc["home"]["jogadores"][0]["name"] == "Joao"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k escalacao_provavel -v`
Expected: FAIL com `ImportError: cannot import name 'escalacao_provavel'`.

- [ ] **Step 3: Write minimal implementation**

Adicionar a `src/odd_analyzer/service.py` (após `listar_jogos`):

```python
def _players_from_lineup(side: dict) -> list[dict]:
    """Jogadores titulares de um lado do lineup, normalizados (mesmo shape de elenco)."""
    team_id = str(side.get("team_id", ""))
    out = []
    for p in side.get("players", []):
        out.append({
            "id": str(p["id"]), "name": p["name"],
            "team_id": team_id, "posicao": p.get("position", ""),
        })
    return out


def _players_ultimos3(client, team_id: str, n_jogos: int = 3) -> list[dict]:
    """Fallback: união (dedupe por id) de quem JOGOU (minutos>0, ou sem campo de
    minutos) nos últimos `n_jogos` finalizados do time. Barato em metadado: usa
    só player-stats de jogo, sem player_stats por jogador."""
    if not team_id:
        return []
    evs = client.events(team_id=team_id, status="finished", limit=n_jogos)
    results = evs.get("results", []) if isinstance(evs, dict) else []
    vistos: dict[str, dict] = {}
    for ev in results[:n_jogos]:
        ps = client.event_player_stats(ev["id"])
        rows = ps.get("player_stats", []) if isinstance(ps, dict) else []
        for r in rows:
            pid = r.get("player_id")
            if pid is None:
                continue
            minutos = r.get("minutes_played")
            if minutos is not None and minutos == 0:
                continue  # estava no jogo mas não entrou
            pid = str(pid)
            if pid not in vistos:
                vistos[pid] = {
                    "id": pid, "name": r.get("name") or r.get("player_name") or pid,
                    "team_id": str(team_id), "posicao": r.get("position", ""),
                }
    return list(vistos.values())


def escalacao_provavel(client, event_id) -> dict:
    """Lista de jogadores por time p/ a UI escolher 1. Usa o lineup do jogo
    (origem 'confirmada'/'provavel'); se vazio, cai p/ quem jogou nos últimos 3
    (origem 'ultimos3'). Barato: nenhuma chamada de stats por jogador."""
    raw = client.get_event(event_id)
    home_name = raw.get("home_team") or "?"
    away_name = raw.get("away_team") or "?"
    home_id = str(raw.get("home_team_id", ""))
    away_id = str(raw.get("away_team_id", ""))

    data = client.lineups(event_id)
    lineups = data.get("lineups", {}) if isinstance(data, dict) else {}
    home_players = _players_from_lineup(lineups.get("home", {}))
    away_players = _players_from_lineup(lineups.get("away", {}))

    if home_players or away_players:
        confirmado = data.get("lineup_status") == "confirmed" or any(
            v.get("confirmed") for v in lineups.values() if isinstance(v, dict))
        origem = "confirmada" if confirmado else "provavel"
    else:
        origem = "ultimos3"
        home_players = _players_ultimos3(client, home_id)
        away_players = _players_ultimos3(client, away_id)

    return {
        "origem": origem,
        "home": {"team_name": home_name, "team_id": home_id, "jogadores": home_players},
        "away": {"team_name": away_name, "team_id": away_id, "jogadores": away_players},
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k escalacao_provavel -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: escalacao_provavel no service (lineup + fallback ultimos 3)"
```

---

## Task 2: `media_recente_jogador` — média recente do jogador (1 call)

**Files:**
- Modify: `src/odd_analyzer/service.py`
- Test: `tests/test_service.py`

- [ ] **Step 1: Write the failing tests**

Adicionar ao fim de `tests/test_service.py`:

```python
from odd_analyzer.service import media_recente_jogador


def test_media_recente_jogador_agrega_stat_do_mercado():
    class _C:
        def player_stats(self, pid):
            return {"results": [
                {"total_tackle": 2}, {"total_tackle": 4}, {"total_tackle": 3}]}
    mr = media_recente_jogador(_C(), event_id=1, market_key="desarmes", player_id=100)
    assert mr["jogos"] == 3
    assert mr["media"] == 3.0


def test_media_recente_jogador_sem_dado_retorna_zero():
    class _C:
        def player_stats(self, pid):
            return {"results": []}
    mr = media_recente_jogador(_C(), event_id=1, market_key="desarmes", player_id=100)
    assert mr == {"media": 0.0, "jogos": 0}


def test_media_recente_jogador_mercado_invalido():
    class _C:
        def player_stats(self, pid):
            return {"results": []}
    with pytest.raises(ValueError):
        media_recente_jogador(_C(), event_id=1, market_key="xxx", player_id=100)
```

(`pytest` já está importado no arquivo, na linha do `apostar_paper`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k media_recente -v`
Expected: FAIL com `ImportError: cannot import name 'media_recente_jogador'`.

- [ ] **Step 3: Write minimal implementation**

Adicionar a `src/odd_analyzer/service.py` (após `escalacao_provavel`):

```python
def media_recente_jogador(client, event_id, market_key, player_id) -> dict:
    """Média recente do stat do mercado p/ UM jogador (1 call). Roda só quando o
    usuário escolhe o jogador no picker (dado caro só depois de escolher)."""
    if market_key not in MARKETS:
        raise ValueError(f"mercado desconhecido: {market_key}. Opções: {list(MARKETS)}")
    field = MARKETS[market_key].stat_field
    raw = client.player_stats(player_id)
    results = raw.get("results", []) if isinstance(raw, dict) else []
    valores = [float(r[field]) for r in results if r.get(field) is not None]
    if not valores:
        return {"media": 0.0, "jogos": 0}
    return {"media": sum(valores) / len(valores), "jogos": len(valores)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k media_recente -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: media_recente_jogador no service (1 call apos selecao)"
```

---

## Task 3: `analisar` aceita `player_ref`

**Files:**
- Modify: `src/odd_analyzer/service.py:43-67`
- Test: `tests/test_service.py`

- [ ] **Step 1: Write the failing test**

Adicionar ao fim de `tests/test_service.py`:

```python
def test_analisar_repassa_player_ref(monkeypatch):
    import odd_analyzer.service as svc
    capturado = {}

    def fake_run_analise(client, event_id, market_key, player_ref, linha, odd_over,
                         odd_under, usar_ia=False, repo=None, escopo_historico="todos",
                         league_id=None):
        capturado["player_ref"] = player_ref
        return {"candidatos": [], "ia": {}}

    class _C:
        def get_event(self, eid): return {"home_team": "A", "away_team": "B"}

    monkeypatch.setattr(svc, "run_analise", fake_run_analise)
    svc.analisar(_C(), "900", "desarmes", 1.5, 1.8, 2.0, player_ref="11")
    assert capturado["player_ref"] == "11"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -k analisar_repassa_player_ref -v`
Expected: FAIL com `TypeError: analisar() got an unexpected keyword argument 'player_ref'`.

- [ ] **Step 3: Write minimal implementation**

Em `src/odd_analyzer/service.py`, alterar a assinatura e a chamada de `analisar`. Trocar:

```python
def analisar(client, event_id, market_key, linha, odd_over, odd_under,
             usar_ia: bool = False, repo=None,
             escopo_historico: str = "todos", league_id=None) -> dict:
```
por:
```python
def analisar(client, event_id, market_key, linha, odd_over, odd_under,
             usar_ia: bool = False, repo=None,
             escopo_historico: str = "todos", league_id=None,
             player_ref=None) -> dict:
```

E na chamada interna, trocar:
```python
    out = run_analise(client, event_id, market_key, None,
                      linha, odd_over, odd_under, usar_ia=usar_ia, repo=repo,
                      escopo_historico=escopo_historico, league_id=league_id)
```
por:
```python
    out = run_analise(client, event_id, market_key, player_ref,
                      linha, odd_over, odd_under, usar_ia=usar_ia, repo=repo,
                      escopo_historico=escopo_historico, league_id=league_id)
```

- [ ] **Step 4: Run the full service suite to verify nothing broke**

Run: `.venv\Scripts\python.exe -m pytest tests/test_service.py -v`
Expected: PASS (todos, inclusive os antigos `test_analisar_*` que passam `player_ref=None` por default = varredura, compat).

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/service.py tests/test_service.py
git commit -m "feat: analisar repassa player_ref (analise de 1 jogador)"
```

---

## Task 4: Front — picker de 2 colunas nos mercados de jogador

Front (Streamlit) não é testado pixel-a-pixel; a lógica está em `service` (Tasks 1-3, testadas). O teste aqui é o smoke de import continuar verde.

**Files:**
- Modify: `app/streamlit_app.py`
- Test: `tests/test_front_smoke.py` (inalterado)

- [ ] **Step 1: Adicionar o helper `_render_picker`**

Em `app/streamlit_app.py`, adicionar esta função **antes** de `_render_mercado`:

```python
def _render_picker(j, market_key):
    """Picker de 1 jogador: 2 colunas (mandante|visitante) da escalação provável
    (ou últimos 3 no fallback). Devolve o player_id escolhido, ou None."""
    try:
        esc = service.escalacao_provavel(_client(), j["id"])
    except Exception as e:
        st.warning(f"Não consegui montar a escalação ({type(e).__name__}); tente de novo.")
        return None
    badges = {
        "confirmada": "✅ Escalação confirmada",
        "provavel": "📋 Escalação provável",
        "ultimos3": "⚠ Sem escalação — jogadores dos últimos 3 jogos",
    }
    st.caption(badges.get(esc["origem"], esc["origem"]))

    sel_key = f"sel-{market_key}"
    escolhido = st.session_state.get(sel_key)
    col_home, col_away = st.columns(2)
    for col, lado in ((col_home, "home"), (col_away, "away")):
        side = esc[lado]
        col.markdown(f"**{side['team_name']}**")
        for p in side["jogadores"]:
            rotulo = f"{p['name']} · {p['posicao']}" if p["posicao"] else p["name"]
            if col.button(rotulo, key=f"pick-{market_key}-{p['id']}"):
                st.session_state[sel_key] = p
                st.rerun()
    if not escolhido:
        return None
    st.success(f"Selecionado: **{escolhido['name']}** ({escolhido.get('posicao') or 's/ pos'})")
    try:
        mr = service.media_recente_jogador(_client(), j["id"], market_key, escolhido["id"])
        if mr["jogos"]:
            st.caption(f"Média recente ({MARKETS[market_key].label}): "
                       f"**{mr['media']:.1f}/jogo** · {mr['jogos']} jogos")
    except Exception:
        pass
    return escolhido["id"]
```

- [ ] **Step 2: Ligar o picker em `_render_mercado`**

Em `app/streamlit_app.py`, dentro de `_render_mercado`, **depois** do bloco do `st.caption("⚠️ Calibração de SELEÇÃO ...")` e **antes** de `c1, c2, c3, c4 = st.columns(4)`, inserir:

```python
    nivel_jogador = bool(spec) and spec.nivel != "partida"
    player_ref = None
    if nivel_jogador:
        player_ref = _render_picker(j, market_key)
        if player_ref is None:
            st.info("Escolha um jogador na lista para analisar.")
            return
```

- [ ] **Step 3: Trocar o rótulo do botão e passar `player_ref`**

Em `_render_mercado`, trocar a linha do botão:
```python
    if not st.button("Varrer elenco", key=f"scan-{market_key}"):
        return
```
por:
```python
    botao_label = "Analisar jogador" if nivel_jogador else "Varrer elenco"
    if not st.button(botao_label, key=f"scan-{market_key}"):
        return
```

E na chamada `service.analisar(...)`, acrescentar `player_ref=player_ref`. Trocar:
```python
        out = service.analisar(_client(), j["id"], market_key, linha, over, under,
                               usar_ia=usar_ia, repo=_repo(),
                               escopo_historico=escopo_historico, league_id=j.get("league_id"))
```
por:
```python
        out = service.analisar(_client(), j["id"], market_key, linha, over, under,
                               usar_ia=usar_ia, repo=_repo(),
                               escopo_historico=escopo_historico, league_id=j.get("league_id"),
                               player_ref=player_ref)
```

- [ ] **Step 4: Rodar o smoke do front + suíte inteira**

Run: `.venv\Scripts\python.exe -m pytest tests/test_front_smoke.py -v`
Expected: PASS (`test_app_importa_sem_erro`).

Run: `.venv\Scripts\python.exe -m pytest`
Expected: PASS (suíte inteira; nenhum teste antigo quebrado).

- [ ] **Step 5: Smoke manual (opcional, recomendado)**

Run: `.venv\Scripts\python.exe -m streamlit run app/streamlit_app.py`
Verificar: abrir um jogo → aba Desarmes mostra 2 colunas com jogadores e badge de origem; clicar 1 jogador mostra a média recente; "Analisar jogador" roda só pra ele. Aba Escanteios (partida) segue sem picker.

- [ ] **Step 6: Commit**

```bash
git add app/streamlit_app.py
git commit -m "feat: front picker de 1 jogador (escalacao provavel) nos mercados de jogador"
```

---

## Notas

- **Branch primeiro.** O repo proíbe commit direto na `main` (default). Antes da Task 1, criar branch: `git checkout -b feat/front-picker-jogador`.
- **Sem mudança de schema** → não toca Supabase, MCP, nem `schema.sql`.
- **Compat:** `analisar(player_ref=None)` mantém a varredura antiga — qualquer outro caller (CLI, testes) não quebra.
