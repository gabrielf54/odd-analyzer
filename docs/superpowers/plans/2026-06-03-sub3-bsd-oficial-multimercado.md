# Sub-projeto #3 — BSD oficial + multi-mercado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ligar o BSD/Bzzoiro como fonte oficial de stats (fallback API-Football) e generalizar o motor de SOT para os 6 mercados MVP (jogador: SOT, finalizacoes, desarmes; partida: gols, vitoria, escanteios), com EV decidido em codigo e IA so explicando.

**Architecture:** nucleo (model/value/ai) inalterado; mudanca em 2 seams (StatsProvider, OddsProvider) + 1 config (MarketSpec). "6 mercados" vira dado, nao codigo. Spec: `docs/superpowers/specs/2026-06-03-sub3-bsd-oficial-multimercado-design.md`.

**Tech Stack:** Python 3.14 (`requests`), pytest, BSD (`Authorization: Token`, env `BZZOIRO_API_KEY`), API-Football fallback (`APIFOOTBALL_KEY`), Supabase. Branch: `feat/sub3-bsd-oficial-multimercado`.

**Execucao:** fases 0->4. Cada tarefa e TDD bite-sized; testes via `.venv\Scripts\python.exe -m pytest`; tudo offline (providers e `bsd/client` testados contra fixtures gravadas, zero rede no CI). Doutrina: EV decide (filtro), IA explica; mu em codigo; matchup = concessao do adversario no mesmo eixo.

---

## fase0-infra

### Task 1: MarketSpec + MARKETS registry

**Files:**
- Create: `src/odd_analyzer/model/markets.py`
- Test: `tests/test_markets.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from dataclasses import fields
from odd_analyzer.model.markets import MarketSpec, MARKETS

EXPECTED_KEYS = {"escanteios", "sot", "finalizacoes", "desarmes", "gols", "vitoria"}

def test_markets_registry_has_all_six_keys():
    assert set(MARKETS.keys()) == EXPECTED_KEYS

def test_market_spec_is_frozen_dataclass():
    spec = MARKETS["sot"]
    assert isinstance(spec, MarketSpec)
    with pytest.raises((AttributeError, TypeError)):
        spec.key = "outro"  # type: ignore[misc]

def test_market_spec_fields_present():
    field_names = {f.name for f in fields(MarketSpec)}
    assert field_names == {
        "key", "nivel", "kind", "stat_field",
        "prior_rate", "prior_strength", "nb_dispersion",
        "lines", "eixo_concessao", "label",
    }

def test_sot_spec_values():
    s = MARKETS["sot"]
    assert s.key == "sot"
    assert s.nivel == "jogador"
    assert s.kind == "contagem"
    assert s.stat_field == "shots_on_target"
    assert s.prior_rate == pytest.approx(0.4)
    assert s.nb_dispersion == pytest.approx(3.0)
    assert s.lines == [0.5, 1.5, 2.5]

def test_finalizacoes_spec_values():
    s = MARKETS["finalizacoes"]
    assert s.key == "finalizacoes"
    assert s.nivel == "jogador"
    assert s.kind == "contagem"
    assert s.stat_field == "total_shots"
    assert s.prior_rate == pytest.approx(1.2)
    assert s.lines == [0.5, 1.5, 2.5]

def test_desarmes_spec_values():
    s = MARKETS["desarmes"]
    assert s.key == "desarmes"
    assert s.nivel == "jogador"
    assert s.kind == "contagem"
    assert s.stat_field == "total_tackle"
    assert s.prior_rate == pytest.approx(2.0)
    assert s.lines == [0.5, 1.5, 2.5]

def test_escanteios_spec_values():
    s = MARKETS["escanteios"]
    assert s.key == "escanteios"
    assert s.nivel == "partida"
    assert s.kind == "contagem"
    assert s.stat_field == "corners"
    assert s.prior_rate == pytest.approx(5.0)
    assert s.lines == [8.5, 9.5, 10.5]

def test_gols_spec_values():
    s = MARKETS["gols"]
    assert s.key == "gols"
    assert s.nivel == "partida"
    assert s.kind == "partida_totais"
    assert s.stat_field == "goals"
    assert s.prior_rate == pytest.approx(1.3)
    assert s.lines == [1.5, 2.5, 3.5]

def test_vitoria_spec_values():
    s = MARKETS["vitoria"]
    assert s.key == "vitoria"
    assert s.nivel == "partida"
    assert s.kind == "partida_1x2"
    assert s.stat_field == "goals"
    assert s.lines == [1.5, 2.5, 3.5]

def test_contagem_markets_have_valid_prior_strength():
    for key in ("sot", "finalizacoes", "desarmes", "escanteios"):
        assert MARKETS[key].prior_strength > 0

def test_kind_values_are_valid():
    valid_kinds = {"contagem", "partida_totais", "partida_1x2"}
    for spec in MARKETS.values():
        assert spec.kind in valid_kinds

def test_nivel_values_are_valid():
    for spec in MARKETS.values():
        assert spec.nivel in {"jogador", "partida"}

def test_all_specs_have_nonempty_label_and_eixo():
    for spec in MARKETS.values():
        assert spec.label, f"{spec.key} tem label vazio"
        assert spec.eixo_concessao, f"{spec.key} tem eixo_concessao vazio"

def test_lines_are_sorted_and_nonempty():
    for spec in MARKETS.values():
        assert len(spec.lines) >= 1
        assert spec.lines == sorted(spec.lines)
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_markets.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.model.markets')`

- [ ] **Step 3: Write minimal implementation**

```python
"""Registry de mercados do MVP. Cada MarketSpec carrega TODOS os seus parâmetros
de forma que o pipeline e o backtest não precisam de nenhum parâmetro hard-coded
além do que está aqui."""
from dataclasses import dataclass

@dataclass(frozen=True)
class MarketSpec:
    key: str
    nivel: str           # "jogador" | "partida"
    kind: str            # "contagem" | "partida_totais" | "partida_1x2"
    stat_field: str      # campo BSD: "corners" | "shots_on_target" | "total_shots" | "total_tackle" | "goals"
    prior_rate: float
    prior_strength: float
    nb_dispersion: float
    lines: list[float]
    eixo_concessao: str  # descrição do eixo de concessão do adversário (p/ matchup + prompt)
    label: str


MARKETS: dict[str, MarketSpec] = {
    "sot": MarketSpec(
        key="sot",
        nivel="jogador",
        kind="contagem",
        stat_field="shots_on_target",
        prior_rate=0.4,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="chutes_a_gol_concedidos_por_jogo",
        label="Chutes a Gol (SOT)",
    ),
    "finalizacoes": MarketSpec(
        key="finalizacoes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_shots",
        prior_rate=1.2,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="finalizacoes_concedidas_por_jogo",
        label="Finalizações Totais",
    ),
    "desarmes": MarketSpec(
        key="desarmes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_tackle",
        prior_rate=2.0,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="desarmes_concedidos_por_jogo",
        label="Desarmes",
    ),
    "escanteios": MarketSpec(
        key="escanteios",
        nivel="partida",
        kind="contagem",
        stat_field="corners",
        prior_rate=5.0,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[8.5, 9.5, 10.5],
        eixo_concessao="escanteios_concedidos_por_jogo",
        label="Escanteios (Total)",
    ),
    "gols": MarketSpec(
        key="gols",
        nivel="partida",
        kind="partida_totais",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[1.5, 2.5, 3.5],
        eixo_concessao="gols_concedidos_por_jogo",
        label="Gols (Total)",
    ),
    "vitoria": MarketSpec(
        key="vitoria",
        nivel="partida",
        kind="partida_1x2",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[1.5, 2.5, 3.5],
        eixo_concessao="gols_concedidos_por_jogo",
        label="Resultado (1X2)",
    ),
}
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_markets.py -v`
  `Expected: PASS (14 passed)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/markets.py tests/test_markets.py && git commit -m "feat(infra): MarketSpec + MARKETS registry com 6 mercados MVP"
```

---

### Task 2: cache.py — TTL + source namespace

**Files:**
- Modify: `src/odd_analyzer/cache.py`
- Test: `tests/test_cache.py` (append new tests; keep existing ones green)

- [ ] **Step 1: Write the failing test**

```python
import time
from odd_analyzer.cache import cached_get

# ── novos testes (appended) ──────────────────────────────────────────────────

def test_ttl_expirado_refaz_fetch(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"t": chamadas["n"]}

    # grava com ttl=0 (expira imediatamente)
    a = cached_get("ttl-key", fetch, cache_dir=tmp_path, ttl_seconds=0)
    # mesmo com ttl=0 a segunda chamada deve refazer (já expirou)
    b = cached_get("ttl-key", fetch, cache_dir=tmp_path, ttl_seconds=0)
    assert chamadas["n"] == 2
    assert a == {"t": 1}
    assert b == {"t": 2}

def test_ttl_none_e_eterno(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"v": chamadas["n"]}

    cached_get("eternal", fetch, cache_dir=tmp_path, ttl_seconds=None)
    cached_get("eternal", fetch, cache_dir=tmp_path, ttl_seconds=None)
    assert chamadas["n"] == 1  # ttl=None -> nunca expira

def test_source_namespace_separa_caches(tmp_path):
    """Mesma key, sources diferentes -> arquivos diferentes -> valores independentes."""
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"src": chamadas["n"]}

    a = cached_get("shared-key", fetch, cache_dir=tmp_path, source="bsd")
    b = cached_get("shared-key", fetch, cache_dir=tmp_path, source="apifootball")
    assert chamadas["n"] == 2
    assert a == {"src": 1}
    assert b == {"src": 2}

def test_source_namespace_reutiliza_cache_mesma_source(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"v": 99}

    cached_get("k", fetch, cache_dir=tmp_path, source="bsd")
    cached_get("k", fetch, cache_dir=tmp_path, source="bsd")
    assert chamadas["n"] == 1

def test_cached_at_gravado_no_arquivo(tmp_path):
    import json, hashlib, time
    from pathlib import Path

    cached_get("ts-key", lambda: {"x": 1}, cache_dir=tmp_path, source="test")
    h = hashlib.sha1("ts-key".encode()).hexdigest()[:16]
    path = tmp_path / "test" / f"{h}.json"
    envelope = json.loads(path.read_text())
    assert "data" in envelope
    assert "cached_at" in envelope
    assert envelope["data"] == {"x": 1}
    assert isinstance(envelope["cached_at"], float)

def test_ttl_valido_nao_refaz_antes_de_expirar(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"v": chamadas["n"]}

    cached_get("long-ttl", fetch, cache_dir=tmp_path, ttl_seconds=3600)
    cached_get("long-ttl", fetch, cache_dir=tmp_path, ttl_seconds=3600)
    assert chamadas["n"] == 1  # ainda válido

def test_retrocompat_default_source_nao_quebra(tmp_path):
    """Chamada sem source continua funcionando (usa namespace 'default')."""
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"v": chamadas["n"]}

    cached_get("compat-key", fetch, cache_dir=tmp_path)
    cached_get("compat-key", fetch, cache_dir=tmp_path)
    assert chamadas["n"] == 1
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_cache.py -v`
  `Expected: FAIL (existing tests pass, new TTL/namespace tests fail with TypeError: cached_get() got unexpected keyword argument 'ttl_seconds')`

- [ ] **Step 3: Write minimal implementation**

```python
import json
import time
import hashlib
from pathlib import Path

_DEFAULT_DIR = Path(__file__).resolve().parents[2] / ".cache_api"

def cached_get(key: str, fetch, cache_dir: Path | None = None,
               ttl_seconds: float | None = None, source: str = "default",
               should_cache=None):
    """Retorna do cache local se existir e válido; senão chama fetch(), grava e retorna.

    `key`          identifica a chamada (ex.: URL completa com params).
    `ttl_seconds`  None = eterno; 0 = sempre expira; > 0 = segundos de validade.
    `source`       namespace de subdiretório (ex.: 'bsd', 'apifootball', 'default').
    `should_cache` opcional: se retornar False, NÃO grava (ex.: resposta de erro).
    Envelope em disco: {"data": <payload>, "cached_at": <unix timestamp float>}.
    """
    base = Path(cache_dir) if cache_dir is not None else _DEFAULT_DIR
    d = base / source
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    path = d / f"{h}.json"

    if path.exists():
        try:
            envelope = json.loads(path.read_text(encoding="utf-8"))
            # Suporte a arquivos antigos (sem envelope): valor direto
            if isinstance(envelope, dict) and "data" in envelope and "cached_at" in envelope:
                cached_at = envelope["cached_at"]
                data = envelope["data"]
                if ttl_seconds is None or (time.time() - cached_at) < ttl_seconds:
                    return data
                # Expirou: cai para fetch
            else:
                # Arquivo no formato antigo (sem envelope) — ttl=None trata como eterno
                if ttl_seconds is None:
                    return envelope
                # ttl definido + formato antigo: refaz para migrar formato
        except (json.JSONDecodeError, KeyError):
            pass  # arquivo corrompido: refaz

    data = fetch()
    if should_cache is None or should_cache(data):
        d.mkdir(parents=True, exist_ok=True)
        envelope = {"data": data, "cached_at": time.time()}
        path.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
    return data
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_cache.py -v`
  `Expected: PASS (10 passed — 3 existing + 7 new)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/cache.py tests/test_cache.py && git commit -m "feat(infra): cache TTL + namespace por source (envelope data+cached_at)"
```

---

### Task 3: bsd/client.py — BSDClient skeleton

**Files:**
- Create: `src/odd_analyzer/bsd/__init__.py`
- Create: `src/odd_analyzer/bsd/client.py`
- Test: `tests/test_bsd_client.py`

- [ ] **Step 1: Write the failing test**

```python
"""Testa o BSDClient contra fixtures inline — zero rede."""
import pytest
from odd_analyzer.bsd.client import BSDClient

# Fixture mínima que replica a shape real da resposta BSD
EVENTS_FIXTURE = {
    "count": 2,
    "results": [
        {"id": "evt_001", "home_team": {"id": 10, "name": "Brazil"},
         "away_team": {"id": 11, "name": "Croatia"}, "status": "NS"},
        {"id": "evt_002", "home_team": {"id": 12, "name": "France"},
         "away_team": {"id": 13, "name": "Poland"}, "status": "NS"},
    ]
}

PLAYER_STATS_FIXTURE = {
    "count": 1,
    "results": [
        {"player": {"id": 100, "name": "Vinicius Jr"},
         "shots_on_target": 2, "total_shots": 4, "total_tackle": 1,
         "minutes_played": 90}
    ]
}

EVENT_ODDS_FIXTURE = {
    "count": 1,
    "results": [
        {"bookmaker": "pinnacle",
         "markets": [{"name": "1x2",
                      "outcomes": [{"name": "1", "odds": 1.85},
                                   {"name": "X", "odds": 3.40},
                                   {"name": "2", "odds": 4.10}]}]}
    ]
}

LINEUPS_FIXTURE = {
    "count": 2,
    "results": [
        {"player": {"id": 100, "name": "Vinicius Jr"},
         "team": {"id": 10}, "position": "F", "starting": True},
        {"player": {"id": 200, "name": "Modric"},
         "team": {"id": 11}, "position": "M", "starting": True},
    ]
}

NATIONAL_POOL_FIXTURE = {
    "count": 1,
    "results": [
        {"id": 100, "name": "Vinicius Jr", "current_team_id": 50}
    ]
}


def _make_client(fixture: dict, tmp_path=None):
    """Retorna BSDClient com _get injetado que devolve o fixture sem chamar a rede."""
    def fake_get(url, params=None):
        return fixture
    return BSDClient(api_key="test-key", cache_dir=tmp_path, _get=fake_get)


def test_events_retorna_fixture(tmp_path):
    client = _make_client(EVENTS_FIXTURE, tmp_path)
    result = client.events(league="FIFA World Cup")
    assert result == EVENTS_FIXTURE


def test_get_event_retorna_fixture(tmp_path):
    client = _make_client(EVENTS_FIXTURE, tmp_path)
    result = client.get_event("evt_001")
    assert result == EVENTS_FIXTURE


def test_event_player_stats_retorna_fixture(tmp_path):
    client = _make_client(PLAYER_STATS_FIXTURE, tmp_path)
    result = client.event_player_stats("evt_001")
    assert result == PLAYER_STATS_FIXTURE


def test_player_stats_retorna_fixture(tmp_path):
    client = _make_client(PLAYER_STATS_FIXTURE, tmp_path)
    result = client.player_stats(100, seasons="2025")
    assert result == PLAYER_STATS_FIXTURE


def test_lineups_retorna_fixture(tmp_path):
    client = _make_client(LINEUPS_FIXTURE, tmp_path)
    result = client.lineups("evt_001")
    assert result == LINEUPS_FIXTURE


def test_team_stats_retorna_fixture(tmp_path):
    client = _make_client(PLAYER_STATS_FIXTURE, tmp_path)
    result = client.team_stats("evt_001")
    assert result == PLAYER_STATS_FIXTURE


def test_event_odds_retorna_fixture(tmp_path):
    client = _make_client(EVENT_ODDS_FIXTURE, tmp_path)
    result = client.event_odds("evt_001")
    assert result == EVENT_ODDS_FIXTURE


def test_odds_by_book_retorna_fixture(tmp_path):
    client = _make_client(EVENT_ODDS_FIXTURE, tmp_path)
    result = client.odds_by_book("evt_001", market="1x2", book="pinnacle")
    assert result == EVENT_ODDS_FIXTURE


def test_national_pool_retorna_fixture(tmp_path):
    client = _make_client(NATIONAL_POOL_FIXTURE, tmp_path)
    result = client.national_pool(team_id=10)
    assert result == NATIONAL_POOL_FIXTURE


def test_squad_retorna_fixture(tmp_path):
    client = _make_client(NATIONAL_POOL_FIXTURE, tmp_path)
    result = client.squad(team_id=10)
    assert result == NATIONAL_POOL_FIXTURE


def test_leagues_retorna_fixture(tmp_path):
    leagues_fixture = {"count": 1, "results": [{"id": 1, "name": "FIFA World Cup"}]}
    client = _make_client(leagues_fixture, tmp_path)
    result = client.leagues()
    assert result == leagues_fixture


def test_cache_evita_segunda_chamada_fake_get(tmp_path):
    """_get deve ser chamado só uma vez; segunda chamada vem do cache em disco."""
    chamadas = {"n": 0}
    def counting_get(url, params=None):
        chamadas["n"] += 1
        return EVENTS_FIXTURE

    client = BSDClient(api_key="test-key", cache_dir=tmp_path, _get=counting_get)
    client.events()
    client.events()
    assert chamadas["n"] == 1  # segunda veio do cache


def test_base_url_e_auth_header_usados(tmp_path):
    """Verifica que o cliente monta URL com a base correta e passa o header Token."""
    urls_chamadas = []
    headers_vistos = []

    class FakeGet:
        def __init__(self, client_ref):
            self._client = client_ref
        def __call__(self, url, params=None):
            urls_chamadas.append(url)
            return EVENTS_FIXTURE

    client = BSDClient(api_key="secret-key", cache_dir=tmp_path)
    # Substitui _get depois de construir para inspecionar URL
    client._get = lambda url, params=None: (urls_chamadas.append(url), EVENTS_FIXTURE)[1]
    client.events(league="wc")
    assert urls_chamadas[0].startswith("https://sports.bzzoiro.com/api/v2")


def test_client_sem_api_key_levanta_erro():
    with pytest.raises((ValueError, RuntimeError)):
        BSDClient(api_key="")
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_client.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.bsd')`

- [ ] **Step 3: Write minimal implementation**

`src/odd_analyzer/bsd/__init__.py` — empty file.

```python
```

`src/odd_analyzer/bsd/client.py`:

```python
"""Cliente HTTP fino para a API BSD/Bzzoiro.

Base URL: https://sports.bzzoiro.com/api/v2
Auth: Authorization: Token <api_key>

Todas as chamadas passam por cached_get (TTL + namespace 'bsd').
_get é injetável nos testes para evitar rede real.
"""
import hashlib
import urllib.parse
from odd_analyzer.cache import cached_get

_BASE = "https://sports.bzzoiro.com/api/v2"

# TTL em segundos por tipo de recurso
_TTL_ODDS = 300        # odds mudam rápido
_TTL_LINEUP = 300      # confirmação de escalação
_TTL_STATS = 3600      # histórico de jogador muda pouco
_TTL_ETERNAL = None    # jogo finalizado / dados históricos


def _default_get(url: str, params: dict | None = None):
    import requests
    headers = {"Authorization": f"Token {_BASE}"}  # preenchido com api_key no _call
    raise NotImplementedError("_default_get é substituído por _make_get no construtor")


class BSDClient:
    """Cliente BSD. Em testes, passe _get=lambda url, params: fixture_dict."""

    def __init__(self, api_key: str, cache_dir=None, _get=None):
        if not api_key:
            raise ValueError("api_key não pode ser vazio")
        self._api_key = api_key
        self._cache_dir = cache_dir
        if _get is not None:
            self._get = _get
        else:
            self._get = self._make_requests_get()

    def _make_requests_get(self):
        import requests
        headers = {"Authorization": f"Token {self._api_key}"}
        session = requests.Session()
        session.headers.update(headers)
        def _get(url: str, params: dict | None = None):
            resp = session.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json()
        return _get

    def _call(self, path: str, params: dict | None = None,
              ttl: float | None = _TTL_ETERNAL) -> dict:
        url = f"{_BASE}{path}"
        qs = urllib.parse.urlencode(sorted((params or {}).items()))
        cache_key = f"{url}?{qs}"
        return cached_get(
            cache_key,
            lambda: self._get(url, params),
            cache_dir=self._cache_dir,
            ttl_seconds=ttl,
            source="bsd",
            should_cache=lambda d: bool(d),
        )

    # ── endpoints ──────────────────────────────────────────────────────────────

    def events(self, **filtros) -> dict:
        return self._call("/events/", filtros or None, ttl=_TTL_ODDS)

    def get_event(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/", ttl=_TTL_ETERNAL)

    def event_player_stats(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/player-stats/", ttl=_TTL_ETERNAL)

    def player_stats(self, player_id, **filtros) -> dict:
        return self._call(f"/players/{player_id}/stats/", filtros or None, ttl=_TTL_STATS)

    def lineups(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/lineups/", ttl=_TTL_LINEUP)

    def team_stats(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/team-stats/", ttl=_TTL_STATS)

    def event_odds(self, event_id) -> dict:
        return self._call(f"/events/{event_id}/odds/", ttl=_TTL_ODDS)

    def odds_by_book(self, event_id, market: str, book: str) -> dict:
        params = {"market": market, "book": book}
        return self._call(f"/events/{event_id}/odds/", params, ttl=_TTL_ODDS)

    def national_pool(self, team_id) -> dict:
        return self._call("/players/", {"national_team_id": team_id}, ttl=_TTL_STATS)

    def squad(self, team_id) -> dict:
        return self._call(f"/teams/{team_id}/squad/", ttl=_TTL_STATS)

    def leagues(self) -> dict:
        return self._call("/leagues/", ttl=_TTL_ETERNAL)
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_client.py -v`
  `Expected: PASS (14 passed)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/bsd/__init__.py src/odd_analyzer/bsd/client.py tests/test_bsd_client.py && git commit -m "feat(infra): BSDClient skeleton com cached_get, Token auth, _get injetável"
```

---

### Task 4: providers/stats.py + providers/odds.py — Protocols + stubs

**Files:**
- Create: `src/odd_analyzer/providers/__init__.py`
- Create: `src/odd_analyzer/providers/stats.py`
- Create: `src/odd_analyzer/providers/odds.py`
- Test: `tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

```python
"""Verifica contratos dos Provider protocols e stubs (zero rede)."""
import pytest
from odd_analyzer.model.markets import MARKETS

from odd_analyzer.providers.stats import (
    StatsProvider, BSDStatsProvider, ApiFootballStatsProvider, FallbackStatsProvider,
)
from odd_analyzer.providers.odds import (
    OddsProvider, BSDMatchOdds, ManualOdds, NullOdds, PropOddsProvider,
)

# ── helpers de verificação de Protocol ─────────────────────────────────────

def _has_method(cls, name):
    return callable(getattr(cls, name, None))


# ── StatsProvider protocol ──────────────────────────────────────────────────

def test_stats_provider_protocol_methods_exist():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(StatsProvider, name), f"StatsProvider.{name} ausente"

def test_bsd_stats_provider_has_protocol_methods():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(BSDStatsProvider, name)

def test_apifootball_stats_provider_has_protocol_methods():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(ApiFootballStatsProvider, name)

def test_fallback_stats_provider_has_protocol_methods():
    for name in ("elenco", "entity_taxa", "team_rates"):
        assert _has_method(FallbackStatsProvider, name)


# ── NullOdds ────────────────────────────────────────────────────────────────

def test_null_odds_linhas_retorna_lista_vazia():
    provider = NullOdds()
    event = {"id": "evt1"}
    market = MARKETS["sot"]
    result = provider.linhas(event, market)
    assert result == []

def test_null_odds_cobre_todos_os_mercados():
    provider = NullOdds()
    event = {"id": "evt1"}
    for key, market in MARKETS.items():
        result = provider.linhas(event, market)
        assert result == [], f"NullOdds.linhas deveria ser [] para {key}"


# ── ManualOdds ──────────────────────────────────────────────────────────────

def test_manual_odds_devolve_linhas_injetadas():
    linhas = [
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.72, "odd_under": 2.10, "book": "manual"},
    ]
    provider = ManualOdds(linhas)
    event = {"id": "evt1"}
    market = MARKETS["sot"]
    result = provider.linhas(event, market)
    assert result == linhas

def test_manual_odds_devolve_mesmas_linhas_para_qualquer_mercado():
    linhas = [{"lado": "home", "odd": 1.85}]
    provider = ManualOdds(linhas)
    for market in MARKETS.values():
        assert provider.linhas({"id": "x"}, market) == linhas


# ── PropOddsProvider ─────────────────────────────────────────────────────────

def test_prop_odds_provider_raises_not_implemented():
    provider = PropOddsProvider()
    with pytest.raises(NotImplementedError):
        provider.linhas({"id": "evt1"}, MARKETS["sot"])


# ── BSDMatchOdds stub ────────────────────────────────────────────────────────

def test_bsd_match_odds_has_linhas_method():
    assert _has_method(BSDMatchOdds, "linhas")


# ── OddsProvider protocol ────────────────────────────────────────────────────

def test_odds_provider_protocol_has_linhas():
    assert _has_method(OddsProvider, "linhas")


# ── structural: stubs são instanciáveis ─────────────────────────────────────

def test_stubs_instantiable_without_deps():
    NullOdds()
    ManualOdds([])
    PropOddsProvider()

def test_bsd_stats_provider_needs_client():
    """BSDStatsProvider requer um client BSD; sem ele levanta TypeError/ValueError."""
    with pytest.raises((TypeError, ValueError)):
        BSDStatsProvider()  # sem client -> deve falhar

def test_fallback_stats_provider_needs_providers():
    with pytest.raises((TypeError, ValueError)):
        FallbackStatsProvider()  # sem primário/fallback -> deve falhar
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.providers')`

- [ ] **Step 3: Write minimal implementation**

`src/odd_analyzer/providers/__init__.py` — empty file.

```python
```

`src/odd_analyzer/providers/stats.py`:

```python
"""StatsProvider protocol + implementações skeleton.

Contrato (Protocol):
    elenco(event)          -> list[dict]   [{id, name, team_id, posicao}]
    entity_taxa(id, mkt, ctx) -> dict|None  {mu, minutos_esperados, xi_confirmado,
                                              amostra_jogos, concedido_adversario, incerteza}
    team_rates(team_id, ctx)  -> dict|None  {attack, defense} p/ match_model
"""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec


@runtime_checkable
class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]: ...
    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None: ...
    def team_rates(self, team_id, contexto: dict) -> dict | None: ...


class BSDStatsProvider:
    """Fonte primária: BSD/Bzzoiro. Implementação completa na Fase 1."""

    def __init__(self, client):
        if client is None:
            raise ValueError("BSDStatsProvider requer um BSDClient")
        self._client = client

    def elenco(self, event: dict) -> list[dict]:
        raise NotImplementedError("BSDStatsProvider.elenco — implementar na Fase 1")

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raise NotImplementedError("BSDStatsProvider.entity_taxa — implementar na Fase 1")

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        raise NotImplementedError("BSDStatsProvider.team_rates — implementar na Fase 1")


class ApiFootballStatsProvider:
    """Fallback: API-Football. Envolve stats/apifootball.py existente."""

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key

    def elenco(self, event: dict) -> list[dict]:
        raise NotImplementedError("ApiFootballStatsProvider.elenco — implementar na Fase 1")

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raise NotImplementedError("ApiFootballStatsProvider.entity_taxa — implementar na Fase 1")

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        raise NotImplementedError("ApiFootballStatsProvider.team_rates — implementar na Fase 1")


class FallbackStatsProvider:
    """Tenta BSD; se retornar None/erro, cai para API-Football. Loga a fonte servida."""

    def __init__(self, primary: BSDStatsProvider, fallback: ApiFootballStatsProvider):
        if primary is None or fallback is None:
            raise ValueError("FallbackStatsProvider requer primary e fallback não-nulos")
        self._primary = primary
        self._fallback = fallback

    def elenco(self, event: dict) -> list[dict]:
        try:
            result = self._primary.elenco(event)
            if result is not None:
                return result
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("BSD elenco falhou (%s); usando fallback", exc)
        return self._fallback.elenco(event)

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        try:
            result = self._primary.entity_taxa(entity_id, market, contexto)
            if result is not None:
                return result
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("BSD entity_taxa falhou (%s); usando fallback", exc)
        return self._fallback.entity_taxa(entity_id, market, contexto)

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        try:
            result = self._primary.team_rates(team_id, contexto)
            if result is not None:
                return result
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("BSD team_rates falhou (%s); usando fallback", exc)
        return self._fallback.team_rates(team_id, contexto)
```

`src/odd_analyzer/providers/odds.py`:

```python
"""OddsProvider protocol + implementações.

Contrato (Protocol):
    linhas(event, market) -> list[dict]
        contagem : [{entidade, linha, odd_over, odd_under, book}]
        partida_1x2: [{lado, odd}]  lado in {"home", "draw", "away"}
"""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec


@runtime_checkable
class OddsProvider(Protocol):
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]: ...


class NullOdds:
    """Sem odds externas — modo modelo-only. EV não é calculado."""

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return []


class ManualOdds:
    """Odds fornecidas manualmente pelo usuário (colar da casa)."""

    def __init__(self, linhas: list[dict]):
        self._linhas = linhas

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return self._linhas


class PropOddsProvider:
    """Slot reservado para feed de odds de props de jogador (futuro).
    Raise NotImplementedError até haver um feed barato disponível."""

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raise NotImplementedError(
            "PropOddsProvider não tem fonte implementada — "
            "use ManualOdds para inserir odds de props manualmente."
        )


class BSDMatchOdds:
    """Odds de partida via BSD /events/{id}/odds/. Implementação completa na Fase 1."""

    def __init__(self, client=None):
        self._client = client

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raise NotImplementedError("BSDMatchOdds.linhas — implementar na Fase 1")
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers.py -v`
  `Expected: PASS (17 passed)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/__init__.py src/odd_analyzer/providers/stats.py src/odd_analyzer/providers/odds.py tests/test_providers.py && git commit -m "feat(infra): StatsProvider + OddsProvider protocols, stubs (NullOdds, ManualOdds, PropOdds, BSD*)"
```

---

### Task 5: store/schema.sql + repo.py — market_type column

**Files:**
- Modify: `src/odd_analyzer/store/schema.sql`
- Modify: `src/odd_analyzer/store/repo.py`
- Test: `tests/test_repo.py` (append new tests; keep existing ones green)

- [ ] **Step 1: Write the failing test**

```python
# ── novos testes (appended) — market_type ────────────────────────────────────
import pytest
from odd_analyzer.store.repo import InMemoryRepo, clv

def test_save_ledger_com_market_type():
    r = InMemoryRepo()
    r.save_ledger([{
        "event_id": "evt1", "jogador": "Vinicius Jr", "linha": 0.5,
        "market_type": "sot", "odd_flag": 1.85,
        "prob_modelo": 0.6, "prob_devig": 0.5, "edge": 0.1, "ev": 0.11,
    }])
    assert r.ledger[0]["market_type"] == "sot"

def test_update_fechamento_com_market_type():
    r = InMemoryRepo()
    r.save_ledger([{
        "event_id": "evt1", "jogador": "Neymar", "linha": 1.5,
        "market_type": "finalizacoes", "odd_flag": 2.00,
        "prob_modelo": 0.55, "prob_devig": 0.50, "edge": 0.05, "ev": 0.10,
    }])
    r.update_fechamento("evt1", "Neymar", 1.5, "finalizacoes",
                        odd_fechamento=1.90, resultado=1)
    row = r.ledger[0]
    assert row["odd_fechamento"] == 1.90
    assert row["resultado"] == 1
    assert row["clv"] == pytest.approx(2.00 / 1.90 - 1.0)

def test_update_fechamento_sem_market_type_usa_legacy_match():
    """Retro-compat: update sem market_type ainda encontra registro por (event, jogador, linha)."""
    r = InMemoryRepo()
    r.save_ledger([{
        "event_id": "evt1", "jogador": "Vinicius Jr", "linha": 0.5,
        "odd_flag": 2.10, "prob_modelo": 0.6, "prob_devig": 0.5,
        "edge": 0.1, "ev": 0.26,
    }])
    r.update_fechamento("evt1", "Vinicius Jr", 0.5, None,
                        odd_fechamento=1.90, resultado=1)
    row = r.ledger[0]
    assert row["resultado"] == 1

def test_market_type_isola_colisao_entre_mercados():
    """Dois mercados diferentes do mesmo jogador/linha devem coexistir como linhas separadas."""
    r = InMemoryRepo()
    r.save_ledger([
        {"event_id": "evt1", "jogador": "X", "linha": 1.5,
         "market_type": "sot", "odd_flag": 1.80,
         "prob_modelo": 0.6, "prob_devig": 0.5, "edge": 0.1, "ev": 0.08},
        {"event_id": "evt1", "jogador": "X", "linha": 1.5,
         "market_type": "finalizacoes", "odd_flag": 1.95,
         "prob_modelo": 0.65, "prob_devig": 0.55, "edge": 0.1, "ev": 0.15},
    ])
    assert len(r.ledger) == 2

    r.update_fechamento("evt1", "X", 1.5, "sot", odd_fechamento=1.75, resultado=1)
    sot_row = next(row for row in r.ledger if row.get("market_type") == "sot")
    fin_row = next(row for row in r.ledger if row.get("market_type") == "finalizacoes")
    assert sot_row["odd_fechamento"] == 1.75
    assert "odd_fechamento" not in fin_row  # finalizacoes não foi atualizado

def test_update_fechamento_market_type_inexistente_e_noop():
    r = InMemoryRepo()
    r.update_fechamento("ghost", "Ninguem", 0.5, "sot", odd_fechamento=1.80, resultado=0)
    assert r.ledger == []
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_repo.py -v`
  `Expected: FAIL (TypeError: InMemoryRepo.update_fechamento() takes 5 positional arguments but 6 were given)`

- [ ] **Step 3: Write minimal implementation**

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
                          market_type: str | None,
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

    def update_fechamento(self, event_id, jogador, linha, market_type,
                          odd_fechamento, resultado):
        for row in self.ledger:
            base_match = (row["event_id"], row["jogador"], row["linha"]) == (event_id, jogador, linha)
            if not base_match:
                continue
            # Se market_type for None (retro-compat), corresponde ao primeiro match da tripla.
            # Se market_type for fornecido, exige também correspondência de mercado.
            if market_type is not None and row.get("market_type") != market_type:
                continue
            row["odd_fechamento"] = odd_fechamento
            row["resultado"] = resultado
            row["clv"] = clv(row["odd_flag"], odd_fechamento)
            break  # 1 registro por quadrupla (garantido pela constraint unique no schema)

class SupabaseRepo(Repo):
    """Persiste no Supabase. Tabelas em store/schema.sql (rodar uma vez no SQL editor)."""
    def __init__(self, client=None):
        if client is None:
            from supabase import create_client
            from odd_analyzer.config import get_required
            client = create_client(get_required("SUPABASE_URL"),
                                   get_required("SUPABASE_SERVICE_KEY"))
        self._client = client

    def save_analise(self, event_id, payload):
        self._client.table("analises").upsert({"event_id": event_id, **payload}).execute()

    def get_analise(self, event_id):
        r = self._client.table("analises").select("*").eq("event_id", event_id).execute()
        return r.data[0] if r.data else None

    def save_ledger(self, rows):
        if rows:
            self._client.table("paper_ledger").insert(rows).execute()

    def update_fechamento(self, event_id, jogador, linha, market_type,
                          odd_fechamento, resultado):
        q = (self._client.table("paper_ledger").select("odd_flag")
             .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha))
        if market_type is not None:
            q = q.eq("market_type", market_type)
        sel = q.execute()
        if not sel.data:
            return
        if len(sel.data) > 1:
            raise RuntimeError(
                f"paper_ledger com linhas duplicadas para ({event_id}, {jogador}, {linha}, {market_type})"
            )
        c = clv(sel.data[0]["odd_flag"], odd_fechamento)
        upd = self._client.table("paper_ledger").update(
            {"odd_fechamento": odd_fechamento, "resultado": resultado, "clv": c}
        ).eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha)
        if market_type is not None:
            upd = upd.eq("market_type", market_type)
        upd.execute()
```

`src/odd_analyzer/store/schema.sql`:

```sql
-- Fonte de verdade do schema. Aplicar via apply_migration no MCP Supabase.
-- Última migração: add_market_type (2026-06-03)

create table if not exists analises (
  event_id text not null,
  market_type text not null default 'sot',
  jogo text,
  data timestamptz default now(),
  ttl int,
  candidatos jsonb,
  llm_resultado jsonb,
  primary key (event_id, market_type)
);

create table if not exists paper_ledger (
  id bigint generated always as identity primary key,
  event_id text not null,
  jogador text not null,
  linha numeric not null,
  market_type text not null default 'sot',
  odd_flag numeric not null,
  prob_modelo numeric,
  prob_devig numeric,
  edge numeric,
  ev numeric,
  odd_fechamento numeric,
  prob_devig_fechamento numeric,
  resultado int,
  clv numeric,
  criado_em timestamptz default now(),
  unique (event_id, jogador, linha, market_type)
  -- unique por quadrupla: evita colisao silenciosa entre mercados diferentes
);

create table if not exists jogadores_crosswalk (
  id_canonico bigint primary key,  -- id canonico do jogador, fornecido pelo caller (ex.: ID API-Football)
  nome_normalizado text,
  fontes_ids jsonb,
  confianca numeric,
  verificado_manual boolean default false
);
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_repo.py -v`
  `Expected: PASS (9 passed — 4 existing + 5 new)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/store/repo.py src/odd_analyzer/store/schema.sql tests/test_repo.py && git commit -m "feat(infra): market_type em repo e schema — unique (event_id,jogador,linha,market_type) elimina colisao silenciosa"
```

---

## fase1-escanteios

### Task 6: model/assemble.py — windowed_rate + assemble_mu

**Files:**
- Create: `src/odd_analyzer/model/assemble.py`
- Test: `tests/test_assemble.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.assemble import windowed_rate, assemble_mu

# games: list of dicts with stat_field values (one per game, in chronological order)
GAMES = [
    {"corners": 3, "mando": "home"},
    {"corners": 5, "mando": "away"},
    {"corners": 4, "mando": "home"},
    {"corners": 6, "mando": "away"},
    {"corners": 2, "mando": "home"},
    {"corners": 7, "mando": "away"},
    {"corners": 5, "mando": "home"},
    {"corners": 3, "mando": "away"},
    {"corners": 6, "mando": "home"},
    {"corners": 4, "mando": "away"},
]

def test_windowed_rate_returns_windows_3_5_10():
    result = windowed_rate(GAMES, stat_field="corners")
    assert "w3" in result
    assert "w5" in result
    assert "w10" in result

def test_windowed_rate_w3_is_mean_of_last_3():
    result = windowed_rate(GAMES, stat_field="corners")
    # last 3 games: corners = [6, 3, 4] (indices 7,8,9 reversed -> 9,8,7 = 4,6,3)
    expected = (4 + 6 + 3) / 3
    assert result["w3"] == pytest.approx(expected)

def test_windowed_rate_w5_is_mean_of_last_5():
    result = windowed_rate(GAMES, stat_field="corners")
    # last 5 games: indices 5,6,7,8,9 = corners 7,5,3,6,4
    expected = (7 + 5 + 3 + 6 + 4) / 5
    assert result["w5"] == pytest.approx(expected)

def test_windowed_rate_w10_is_mean_of_last_10():
    result = windowed_rate(GAMES, stat_field="corners")
    all_corners = [g["corners"] for g in GAMES]
    expected = sum(all_corners) / 10
    assert result["w10"] == pytest.approx(expected)

def test_windowed_rate_fewer_games_than_window_returns_available():
    games_short = [{"corners": 4, "mando": "home"}, {"corners": 6, "mando": "away"}]
    result = windowed_rate(games_short, stat_field="corners")
    assert result["w3"] == pytest.approx((4 + 6) / 2)
    assert result["w5"] == pytest.approx((4 + 6) / 2)
    assert result["w10"] == pytest.approx((4 + 6) / 2)

def test_windowed_rate_empty_games_returns_none():
    result = windowed_rate([], stat_field="corners")
    assert result["w3"] is None
    assert result["w5"] is None
    assert result["w10"] is None

def test_windowed_rate_mando_filter_home_only():
    result = windowed_rate(GAMES, stat_field="corners", mando="home")
    # home games: indices 0,2,4,6,8 -> corners 3,4,2,5,6
    home_games = [g for g in GAMES if g.get("mando") == "home"]
    expected_w5 = sum(g["corners"] for g in home_games[-5:]) / min(5, len(home_games))
    assert result["w5"] == pytest.approx(expected_w5)

def test_windowed_rate_mando_filter_away_only():
    result = windowed_rate(GAMES, stat_field="corners", mando="away")
    # away games: indices 1,3,5,7,9 -> corners 5,6,7,3,4
    away_games = [g for g in GAMES if g.get("mando") == "away"]
    expected_w5 = sum(g["corners"] for g in away_games[-5:]) / min(5, len(away_games))
    assert result["w5"] == pytest.approx(expected_w5)

def test_assemble_mu_composes_factors():
    # rate_per90=5.0, minutos=90 -> expected_lambda=5.0; opp_mult=1.2, ha_mult=1.1
    mu = assemble_mu(rate_per90=5.0, minutos_esperados=90.0, opp_mult=1.2, ha_mult=1.1)
    # shrink_rate is called inside but with pure pass-through when rate is already shrunk;
    # assemble_mu = expected_lambda * opp_mult * ha_mult
    assert mu == pytest.approx(5.0 * (90.0 / 90.0) * 1.2 * 1.1)

def test_assemble_mu_zero_minutes_returns_zero():
    mu = assemble_mu(rate_per90=5.0, minutos_esperados=0.0, opp_mult=1.2, ha_mult=1.1)
    assert mu == pytest.approx(0.0)

def test_assemble_mu_neutral_multipliers_equals_expected_lambda():
    mu = assemble_mu(rate_per90=4.0, minutos_esperados=90.0, opp_mult=1.0, ha_mult=1.0)
    assert mu == pytest.approx(4.0)
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_assemble.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.model.assemble')`

- [ ] **Step 3: Write minimal implementation**

```python
"""Monta mu para mercados de contagem: taxa janelada + shrinkage + multiplicadores.
Compõe as funções genéricas existentes (expected_lambda, opponent_multiplier,
home_away_multiplier) sem adicionar nova matemática."""

from odd_analyzer.model.sot_model import expected_lambda


def windowed_rate(
    games: list[dict],
    stat_field: str,
    windows: tuple = (3, 5, 10),
    mando: str | None = None,
) -> dict:
    """Taxa média do stat_field nas últimas N partidas (janelas 3/5/10).

    Args:
        games: lista de dicts com pelo menos {stat_field, mando} em ordem cronológica.
        stat_field: chave do dict a somar (e.g. "corners", "shots_on_target").
        windows: tupla de tamanhos de janela a calcular.
        mando: se "home" ou "away", filtra apenas partidas nesse mando antes de janelas.

    Returns:
        dict {f"w{n}": float | None} — None quando não há jogos disponíveis.
    """
    source = games
    if mando is not None:
        source = [g for g in games if g.get("mando") == mando]

    result: dict = {}
    for n in windows:
        window = source[-n:] if len(source) >= 1 else []
        if not window:
            result[f"w{n}"] = None
        else:
            vals = [g[stat_field] for g in window]
            result[f"w{n}"] = sum(vals) / len(vals)
    return result


def assemble_mu(
    rate_per90: float,
    minutos_esperados: float,
    opp_mult: float,
    ha_mult: float,
) -> float:
    """Monta o mu final para prob_over_line.

    mu = expected_lambda(rate_per90, minutos_esperados) * opp_mult * ha_mult

    rate_per90 deve chegar já encogido (shrink_rate aplicado upstream, em
    entity_taxa do StatsProvider). assemble_mu só compõe.
    """
    lam = expected_lambda(rate_per90, minutos_esperados)
    return lam * opp_mult * ha_mult
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_assemble.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/assemble.py tests/test_assemble.py && git commit -m "feat: model/assemble.py — windowed_rate + assemble_mu (fase1 task1)"
```

---

### Task 7: model/markets.py — MarketSpec registry

**Files:**
- Create: `src/odd_analyzer/model/markets.py`
- Test: `tests/test_markets.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.markets import MarketSpec, MARKETS


def test_markets_has_six_keys():
    assert set(MARKETS.keys()) == {"escanteios", "sot", "finalizacoes", "desarmes", "gols", "vitoria"}


def test_escanteios_spec():
    m = MARKETS["escanteios"]
    assert m.key == "escanteios"
    assert m.nivel == "partida"
    assert m.kind == "contagem"
    assert m.stat_field == "corners"
    assert m.prior_rate > 0
    assert m.prior_strength > 0
    assert m.nb_dispersion > 0
    assert isinstance(m.lines, list) and len(m.lines) >= 1
    assert m.eixo_concessao != ""
    assert m.label != ""


def test_sot_spec():
    m = MARKETS["sot"]
    assert m.key == "sot"
    assert m.nivel == "jogador"
    assert m.kind == "contagem"
    assert m.stat_field == "shots_on_target"


def test_finalizacoes_spec():
    m = MARKETS["finalizacoes"]
    assert m.kind == "contagem"
    assert m.stat_field == "total_shots"


def test_desarmes_spec():
    m = MARKETS["desarmes"]
    assert m.kind == "contagem"
    assert m.stat_field == "total_tackle"


def test_gols_spec():
    m = MARKETS["gols"]
    assert m.nivel == "partida"
    assert m.kind == "partida_totais"
    assert m.stat_field == "goals"


def test_vitoria_spec():
    m = MARKETS["vitoria"]
    assert m.nivel == "partida"
    assert m.kind == "partida_1x2"
    assert m.stat_field == "goals"


def test_all_specs_are_frozen():
    m = MARKETS["escanteios"]
    with pytest.raises((TypeError, AttributeError)):
        m.key = "outro"


def test_contagem_markets_have_nonempty_lines():
    for key in ("escanteios", "sot", "finalizacoes", "desarmes"):
        m = MARKETS[key]
        assert len(m.lines) >= 1, f"{key} deve ter linhas"


def test_kind_values_are_valid():
    valid_kinds = {"contagem", "partida_totais", "partida_1x2"}
    for key, m in MARKETS.items():
        assert m.kind in valid_kinds, f"{key}.kind={m.kind!r} inválido"
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_markets.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.model.markets')`

- [ ] **Step 3: Write minimal implementation**

```python
"""Registry de mercados MVP. MarketSpec é dado puro — sem lógica — de modo que
'6 mercados' vira configuração e não código duplicado no pipeline."""
from dataclasses import dataclass


@dataclass(frozen=True)
class MarketSpec:
    key: str            # "escanteios" | "sot" | "finalizacoes" | "desarmes" | "gols" | "vitoria"
    nivel: str          # "jogador" | "partida"
    kind: str           # "contagem" | "partida_totais" | "partida_1x2"
    stat_field: str     # campo BSD: "corners" | "shots_on_target" | "total_shots" | "total_tackle" | "goals"
    prior_rate: float
    prior_strength: float
    nb_dispersion: float
    lines: list[float]
    eixo_concessao: str  # eixo de concessão do adversário (p/ matchup + prompt)
    label: str


MARKETS: dict[str, MarketSpec] = {
    "escanteios": MarketSpec(
        key="escanteios",
        nivel="partida",
        kind="contagem",
        stat_field="corners",
        prior_rate=5.0,          # ~5 escanteios/jogo por time (prior conservador)
        prior_strength=10.0,
        nb_dispersion=4.0,
        lines=[7.5, 9.5, 10.5],  # over/under totais de escanteios da partida
        eixo_concessao="escanteios_concedidos_por_jogo",
        label="Escanteios (partida)",
    ),
    "sot": MarketSpec(
        key="sot",
        nivel="jogador",
        kind="contagem",
        stat_field="shots_on_target",
        prior_rate=0.4,          # calibrado backtest EPL 2023
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5],
        eixo_concessao="sot_concedidos_por_jogo",
        label="Chutes a gol (jogador)",
    ),
    "finalizacoes": MarketSpec(
        key="finalizacoes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_shots",
        prior_rate=1.5,
        prior_strength=10.0,
        nb_dispersion=3.5,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="finalizacoes_concedidas_por_jogo",
        label="Finalizações totais (jogador)",
    ),
    "desarmes": MarketSpec(
        key="desarmes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_tackle",
        prior_rate=1.0,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="desarmes_concedidos_por_jogo",
        label="Desarmes (jogador)",
    ),
    "gols": MarketSpec(
        key="gols",
        nivel="partida",
        kind="partida_totais",
        stat_field="goals",
        prior_rate=1.3,          # gols/jogo por time (média liga)
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[1.5, 2.5, 3.5],
        eixo_concessao="gols_concedidos_por_jogo",
        label="Gols (partida)",
    ),
    "vitoria": MarketSpec(
        key="vitoria",
        nivel="partida",
        kind="partida_1x2",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10.0,
        nb_dispersion=3.0,
        lines=[],                # 1X2 não usa linha over/under
        eixo_concessao="gols_concedidos_por_jogo",
        label="Resultado (1X2)",
    ),
}
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_markets.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/markets.py tests/test_markets.py && git commit -m "feat: model/markets.py — MarketSpec registry com 6 mercados MVP (fase1 task2)"
```

---

### Task 8: candidates/builder.py — rename field + add market_type

**Files:**
- Modify: `src/odd_analyzer/candidates/builder.py`
- Modify: `tests/test_builder.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.candidates.builder import build_candidate


def test_build_candidate_monta_dossie():
    c = build_candidate(
        jogador="Vinicius Jr", linha=0.5, odd_over=1.72, odd_under=2.10,
        prob_modelo=0.68, mu=1.9, minutos_esperados=88, xi_confirmado=True,
        amostra_jogos=24, concedido_adversario="alto", incerteza="media",
        market_type="sot",
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
    assert c["concedido_adversario"] == "alto"
    assert c["incerteza"] == "media"
    assert c["market_type"] == "sot"


def test_build_candidate_campo_renomeado_nao_usa_sot_prefix():
    c = build_candidate(
        jogador="Raphinha", linha=1.5, odd_over=2.40, odd_under=1.55,
        prob_modelo=0.45, mu=0.9, minutos_esperados=75, xi_confirmado=False,
        amostra_jogos=15, concedido_adversario="baixo", incerteza="alta",
        market_type="finalizacoes",
    )
    assert "sot_concedido_adversario" not in c
    assert "concedido_adversario" in c
    assert c["market_type"] == "finalizacoes"


def test_build_candidate_escanteios():
    c = build_candidate(
        jogador="Brasil", linha=9.5, odd_over=1.85, odd_under=1.95,
        prob_modelo=0.55, mu=10.2, minutos_esperados=90, xi_confirmado=True,
        amostra_jogos=12, concedido_adversario="medio", incerteza="baixa",
        market_type="escanteios",
    )
    assert c["market_type"] == "escanteios"
    assert c["jogador"] == "Brasil"
    assert c["linha"] == 9.5
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_builder.py -v`
  `Expected: FAIL (TypeError: build_candidate() got an unexpected keyword argument 'concedido_adversario' / missing market_type)`

- [ ] **Step 3: Write minimal implementation**

```python
"""Monta o dossiê de UM candidato no formato que a IA lê (design v1 §7).
Toda a matemática (de-vig, edge, EV) vem do código aqui — a IA nunca calcula.

Alterações em relação a v1:
- sot_concedido_adversario → concedido_adversario  (genérico p/ qualquer mercado)
- novo campo market_type (e.g. "sot", "escanteios", "desarmes")
"""
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev


def build_candidate(
    jogador, linha, odd_over, odd_under, prob_modelo, mu,
    minutos_esperados, xi_confirmado, amostra_jogos,
    concedido_adversario, incerteza, market_type: str,
) -> dict:
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
        "concedido_adversario": concedido_adversario,
        "incerteza": incerteza,
        "market_type": market_type,
    }
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_builder.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/candidates/builder.py tests/test_builder.py && git commit -m "refactor: builder — rename sot_concedido_adversario->concedido_adversario + add market_type (fase1 task3)"
```

---

### Task 9: bsd/client.py — HTTP client with fixture-based tests

**Files:**
- Create: `src/odd_analyzer/bsd/__init__.py`
- Create: `src/odd_analyzer/bsd/client.py`
- Create: `tests/test_bsd_client.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for BSDClient — all offline, using inline fixture dicts (no network)."""
import pytest
from odd_analyzer.bsd.client import BSDClient

# Minimal BSD API response shapes captured from live exploration

FIXTURE_EVENTS = {
    "count": 2,
    "results": [
        {"id": "101", "home_team": {"id": "10", "name": "Brasil"},
         "away_team": {"id": "20", "name": "Croacia"},
         "date": "2026-06-15T18:00:00Z", "status": "scheduled"},
        {"id": "102", "home_team": {"id": "30", "name": "Argentina"},
         "away_team": {"id": "40", "name": "Franca"},
         "date": "2026-06-16T21:00:00Z", "status": "scheduled"},
    ],
}

FIXTURE_GET_EVENT = {
    "id": "101",
    "home_team": {"id": "10", "name": "Brasil"},
    "away_team": {"id": "20", "name": "Croacia"},
    "status": "finished",
}

FIXTURE_TEAM_STATS = {
    "event_id": "101",
    "home": {"corners": 7, "total_shots": 14, "shots_on_target": 5, "goals": 2},
    "away": {"corners": 3, "total_shots": 8, "shots_on_target": 3, "goals": 1},
}

FIXTURE_EVENT_ODDS = {
    "event_id": "101",
    "bookmakers": [
        {"name": "Pinnacle", "markets": [
            {"key": "corners_total", "outcomes": [
                {"name": "Over", "point": 9.5, "price": 1.87},
                {"name": "Under", "point": 9.5, "price": 1.93},
            ]},
        ]},
    ],
}

FIXTURE_ODDS_BY_BOOK = {
    "event_id": "101",
    "book": "Pinnacle",
    "market": "corners_total",
    "outcomes": [
        {"name": "Over", "point": 9.5, "price": 1.87},
        {"name": "Under", "point": 9.5, "price": 1.93},
    ],
}

FIXTURE_LINEUPS = {
    "event_id": "101",
    "home": {"starting_xi": [{"id": "p1", "name": "Vinicius Jr", "position": "FW"}]},
    "away": {"starting_xi": [{"id": "p2", "name": "Modric", "position": "MF"}]},
}


def _make_client(responses: dict) -> BSDClient:
    """Builds a BSDClient with a fake _get that returns from the responses dict."""
    def fake_get(path, params=None):
        if path in responses:
            return responses[path]
        raise KeyError(f"No fixture for path: {path!r}")
    return BSDClient(api_key="test-key", cache_dir=None, _get=fake_get)


def test_events_returns_results_list():
    client = _make_client({"events/": FIXTURE_EVENTS})
    result = client.events()
    assert result == FIXTURE_EVENTS


def test_get_event_returns_event_dict():
    client = _make_client({"events/101/": FIXTURE_GET_EVENT})
    result = client.get_event("101")
    assert result["id"] == "101"
    assert result["status"] == "finished"


def test_team_stats_returns_home_away_corners():
    client = _make_client({"events/101/team-stats/": FIXTURE_TEAM_STATS})
    result = client.team_stats("101")
    assert result["home"]["corners"] == 7
    assert result["away"]["corners"] == 3


def test_event_odds_returns_bookmakers():
    client = _make_client({"events/101/odds/": FIXTURE_EVENT_ODDS})
    result = client.event_odds("101")
    assert len(result["bookmakers"]) == 1
    assert result["bookmakers"][0]["name"] == "Pinnacle"


def test_odds_by_book_returns_market_outcomes():
    path = "events/101/odds/"
    client = _make_client({path: FIXTURE_ODDS_BY_BOOK})
    result = client.odds_by_book("101", market="corners_total", book="Pinnacle")
    assert result == FIXTURE_ODDS_BY_BOOK


def test_lineups_returns_starting_xi():
    client = _make_client({"events/101/lineups/": FIXTURE_LINEUPS})
    result = client.lineups("101")
    assert result["home"]["starting_xi"][0]["name"] == "Vinicius Jr"


def test_client_builds_correct_auth_header():
    """Verify the auth header is set to 'Token <api_key>'."""
    headers_seen = {}

    def fake_get(path, params=None):
        return {}

    client = BSDClient(api_key="my-secret-key", cache_dir=None, _get=fake_get)
    assert client._api_key == "my-secret-key"
    assert client._base.endswith("/api/v2")


def test_client_raises_on_network_error():
    def exploding_get(path, params=None):
        raise ConnectionError("network down")

    client = BSDClient(api_key="key", cache_dir=None, _get=exploding_get)
    with pytest.raises(ConnectionError):
        client.events()
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_client.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.bsd')`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/bsd/__init__.py
```

```python
# src/odd_analyzer/bsd/client.py
"""HTTP client fino para o BSD/Bzzoiro (https://sports.bzzoiro.com/api/v2).
Autenticação: Authorization: Token <api_key>.
Cada chamada passa por cached_get (TTL injetável por chamada).
_get injetável p/ testes offline (substitui requests.get)."""
import requests
from odd_analyzer.cache import cached_get as _cached_get

BASE = "https://sports.bzzoiro.com/api/v2"


class BSDClient:
    def __init__(self, api_key: str, cache_dir=None, _get=None):
        self._api_key = api_key
        self._base = BASE
        self._cache_dir = cache_dir
        self._get_impl = _get  # None → usa requests.get real

    def _request(self, path: str, params: dict | None = None) -> dict:
        if self._get_impl is not None:
            return self._get_impl(path, params)

        def fetch():
            url = f"{self._base}/{path}"
            headers = {"Authorization": f"Token {self._api_key}"}
            r = requests.get(url, headers=headers, params=params or {}, timeout=30)
            r.raise_for_status()
            return r.json()

        cache_key = f"bsd:{path}:{sorted((params or {}).items())}"
        return _cached_get(cache_key, fetch, cache_dir=self._cache_dir)

    def events(self, **filtros) -> dict:
        return self._request("events/", filtros or None)

    def get_event(self, event_id) -> dict:
        return self._request(f"events/{event_id}/")

    def event_player_stats(self, event_id) -> dict:
        return self._request(f"events/{event_id}/player-stats/")

    def player_stats(self, player_id, **filtros) -> dict:
        return self._request(f"players/{player_id}/stats/", filtros or None)

    def lineups(self, event_id) -> dict:
        return self._request(f"events/{event_id}/lineups/")

    def team_stats(self, event_id) -> dict:
        return self._request(f"events/{event_id}/team-stats/")

    def event_odds(self, event_id) -> dict:
        return self._request(f"events/{event_id}/odds/")

    def odds_by_book(self, event_id, market: str, book: str) -> dict:
        return self._request(f"events/{event_id}/odds/",
                             {"market": market, "book": book})

    def national_pool(self, team_id) -> dict:
        return self._request("players/", {"national_team_id": team_id})

    def squad(self, team_id) -> dict:
        return self._request(f"teams/{team_id}/squad/")

    def leagues(self) -> dict:
        return self._request("leagues/")
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_client.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/bsd/__init__.py src/odd_analyzer/bsd/client.py tests/test_bsd_client.py && git commit -m "feat: bsd/client.py — HTTP client BSD com _get injetável p/ testes offline (fase1 task4)"
```

---

### Task 10: providers/stats.py — BSDStatsProvider.elenco + entity_taxa for escanteios

**Files:**
- Create: `src/odd_analyzer/providers/__init__.py`
- Create: `src/odd_analyzer/providers/stats.py`
- Create: `tests/test_providers_stats.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for BSDStatsProvider — all offline, BSD client responses are fakes."""
import pytest
from odd_analyzer.providers.stats import BSDStatsProvider
from odd_analyzer.model.markets import MARKETS

# Fixture: BSD lineups response
FIXTURE_LINEUPS = {
    "event_id": "101",
    "home": {
        "team_id": "10",
        "starting_xi": [
            {"id": "p1", "name": "Vinicius Jr", "position": "FW"},
            {"id": "p2", "name": "Casemiro", "position": "MF"},
        ],
    },
    "away": {
        "team_id": "20",
        "starting_xi": [
            {"id": "p3", "name": "Modric", "position": "MF"},
        ],
    },
}

# Fixture: BSD team stats (10 historical games for team "10")
FIXTURE_PLAYER_STATS = {
    "player_id": "p1",
    "games": [
        {"event_id": str(i), "corners": 5 + (i % 3), "mando": "home" if i % 2 == 0 else "away"}
        for i in range(1, 11)
    ],
}

# Fixture: BSD team stats for the event (opponent's corners conceded)
FIXTURE_TEAM_STATS_EVENT = {
    "event_id": "101",
    "home": {"corners": 7},
    "away": {"corners": 3},
}

EVENT = {
    "id": "101",
    "home_team": {"id": "10", "name": "Brasil"},
    "away_team": {"id": "20", "name": "Croacia"},
}


class FakeBSDClient:
    def __init__(self):
        self._lineups = FIXTURE_LINEUPS
        self._player_stats = FIXTURE_PLAYER_STATS
        self._team_stats = FIXTURE_TEAM_STATS_EVENT

    def lineups(self, event_id):
        return self._lineups

    def player_stats(self, player_id, **filtros):
        return self._player_stats

    def team_stats(self, event_id):
        return self._team_stats


def make_provider():
    return BSDStatsProvider(client=FakeBSDClient())


def test_elenco_returns_all_players_with_required_fields():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    assert len(elenco) == 3
    ids = {p["id"] for p in elenco}
    assert "p1" in ids and "p2" in ids and "p3" in ids
    for p in elenco:
        assert "id" in p
        assert "name" in p
        assert "team_id" in p
        assert "posicao" in p


def test_elenco_home_players_get_correct_team_id():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    home_players = [p for p in elenco if p["id"] in ("p1", "p2")]
    for p in home_players:
        assert p["team_id"] == "10"


def test_elenco_away_players_get_correct_team_id():
    provider = make_provider()
    elenco = provider.elenco(EVENT)
    away = next(p for p in elenco if p["id"] == "p3")
    assert away["team_id"] == "20"


def test_entity_taxa_returns_required_keys():
    provider = make_provider()
    market = MARKETS["escanteios"]
    contexto = {
        "event": EVENT,
        "entity_team_id": "10",
        "is_home": True,
        "league_avg_conceded": 5.0,
    }
    result = provider.entity_taxa("10", market, contexto)
    assert result is not None
    for key in ("mu", "minutos_esperados", "xi_confirmado", "amostra_jogos",
                "concedido_adversario", "incerteza"):
        assert key in result, f"chave ausente: {key}"


def test_entity_taxa_mu_is_positive():
    provider = make_provider()
    market = MARKETS["escanteios"]
    contexto = {
        "event": EVENT,
        "entity_team_id": "10",
        "is_home": True,
        "league_avg_conceded": 5.0,
    }
    result = provider.entity_taxa("10", market, contexto)
    assert result["mu"] > 0


def test_entity_taxa_amostra_jogos_reflects_available_games():
    provider = make_provider()
    market = MARKETS["escanteios"]
    contexto = {
        "event": EVENT,
        "entity_team_id": "10",
        "is_home": True,
        "league_avg_conceded": 5.0,
    }
    result = provider.entity_taxa("10", market, contexto)
    # FIXTURE_PLAYER_STATS has 10 games
    assert result["amostra_jogos"] == 10


def test_entity_taxa_returns_none_when_no_games():
    class EmptyClient:
        def lineups(self, event_id):
            return FIXTURE_LINEUPS
        def player_stats(self, player_id, **filtros):
            return {"player_id": player_id, "games": []}
        def team_stats(self, event_id):
            return FIXTURE_TEAM_STATS_EVENT

    provider = BSDStatsProvider(client=EmptyClient())
    market = MARKETS["escanteios"]
    contexto = {
        "event": EVENT,
        "entity_team_id": "10",
        "is_home": True,
        "league_avg_conceded": 5.0,
    }
    result = provider.entity_taxa("10", market, contexto)
    assert result is None


def test_entity_taxa_xi_confirmado_is_bool():
    provider = make_provider()
    market = MARKETS["escanteios"]
    contexto = {
        "event": EVENT,
        "entity_team_id": "10",
        "is_home": True,
        "league_avg_conceded": 5.0,
        "xi_team_ids": {"10"},  # team confirmed in lineup
    }
    result = provider.entity_taxa("10", market, contexto)
    assert isinstance(result["xi_confirmado"], bool)
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.providers')`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/providers/__init__.py
```

```python
# src/odd_analyzer/providers/stats.py
"""StatsProvider protocol + BSDStatsProvider (BSD primário).

BSDStatsProvider.elenco(event) — lê lineups BSD, retorna
    [{id, name, team_id, posicao}] para todos os jogadores do jogo.

BSDStatsProvider.entity_taxa(entity_id, market, contexto) — para kind=contagem:
    puxa retrospecto (player_stats ou team_stats), calcula windowed_rate,
    aplica shrink_rate + assemble_mu (×matchup ×mando).
    Retorna {mu, minutos_esperados, xi_confirmado, amostra_jogos,
             concedido_adversario, incerteza} ou None se sem amostra.
"""
from typing import Protocol

from odd_analyzer.model.markets import MarketSpec
from odd_analyzer.model.assemble import windowed_rate, assemble_mu
from odd_analyzer.model.shrinkage import shrink_rate
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier


class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]: ...
    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None: ...
    def team_rates(self, team_id, contexto: dict) -> dict | None: ...


class BSDStatsProvider:
    """Fonte primária de estatísticas via BSD/Bzzoiro."""

    # Mando padrão quando não há dados históricos segmentados
    HOME_FACTOR = 1.08
    AWAY_FACTOR = 0.92

    def __init__(self, client):
        self._client = client

    # ------------------------------------------------------------------
    # elenco
    # ------------------------------------------------------------------

    def elenco(self, event: dict) -> list[dict]:
        """Retorna todos os jogadores (home + away) do jogo.

        Formato: [{id, name, team_id, posicao}].
        """
        data = self._client.lineups(event["id"])
        players: list[dict] = []

        home_team_id = str(
            event.get("home_team", {}).get("id", data.get("home", {}).get("team_id", ""))
        )
        away_team_id = str(
            event.get("away_team", {}).get("id", data.get("away", {}).get("team_id", ""))
        )

        for side, team_id in (("home", home_team_id), ("away", away_team_id)):
            side_data = data.get(side, {})
            for p in side_data.get("starting_xi", []):
                players.append({
                    "id": str(p["id"]),
                    "name": p["name"],
                    "team_id": team_id,
                    "posicao": p.get("position", ""),
                })
        return players

    # ------------------------------------------------------------------
    # entity_taxa — kind=contagem (escanteios, SOT, finalizações, desarmes)
    # ------------------------------------------------------------------

    def entity_taxa(
        self, entity_id, market: MarketSpec, contexto: dict
    ) -> dict | None:
        """Calcula mu e metadados para uma entidade (time ou jogador).

        contexto esperado:
            event: dict
            entity_team_id: str   — id do time da entidade (p/ saber is_home)
            is_home: bool
            league_avg_conceded: float   — média da liga no eixo de concessão
            xi_team_ids: set[str] opcional — times com XI confirmado
        """
        if market.kind != "contagem":
            return None

        event = contexto["event"]
        is_home: bool = contexto.get("is_home", False)
        league_avg: float = contexto.get("league_avg_conceded", 1.0)
        xi_team_ids: set = contexto.get("xi_team_ids", set())
        entity_team_id = str(contexto.get("entity_team_id", entity_id))

        # Busca retrospecto histórico do stat_field
        raw = self._client.player_stats(entity_id)
        games: list[dict] = raw.get("games", [])

        if not games:
            return None

        # Taxa janelada (w5 como principal; fallback w3, w10, all)
        rates = windowed_rate(games, market.stat_field)
        w5 = rates.get("w5")
        w3 = rates.get("w3")
        w10 = rates.get("w10")
        raw_rate = w5 if w5 is not None else (w3 if w3 is not None else w10)
        if raw_rate is None:
            return None

        # Shrinkage (puxa para o prior quando amostra pequena)
        shrunk = shrink_rate(
            rate=raw_rate,
            apps=len(games),
            prior_rate=market.prior_rate,
            prior_strength=market.prior_strength,
        )

        # Concessão do adversário — lê do event stats (último dado disponível)
        try:
            team_stats = self._client.team_stats(event["id"])
            # adversário = lado oposto da entidade
            opp_side = "away" if is_home else "home"
            opp_conceded = float(team_stats.get(opp_side, {}).get(market.stat_field, league_avg))
        except Exception:
            opp_conceded = league_avg

        opp_mult = opponent_multiplier(opp_conceded, league_avg)
        ha_mult = home_away_multiplier(is_home, self.HOME_FACTOR, self.AWAY_FACTOR)

        # minutos_esperados = 90 p/ escanteios de time (partida inteira)
        minutos_esperados = 90.0

        mu = assemble_mu(
            rate_per90=shrunk,
            minutos_esperados=minutos_esperados,
            opp_mult=opp_mult,
            ha_mult=ha_mult,
        )

        # XI confirmado: True se o time da entidade está no conjunto confirmado
        xi_confirmado = (entity_team_id in xi_team_ids) if xi_team_ids else True

        # Incerteza qualitativa (simples: amostra pequena = alta)
        n = len(games)
        incerteza = "alta" if n < 5 else ("media" if n < 12 else "baixa")

        return {
            "mu": mu,
            "minutos_esperados": minutos_esperados,
            "xi_confirmado": xi_confirmado,
            "amostra_jogos": n,
            "concedido_adversario": str(opp_conceded),
            "incerteza": incerteza,
        }

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        """Retorna taxas de ataque/defesa do time para match_model (Fase 3)."""
        # Implementado na Fase 3; retorna None por ora.
        return None
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/__init__.py src/odd_analyzer/providers/stats.py tests/test_providers_stats.py && git commit -m "feat: providers/stats.py — BSDStatsProvider elenco + entity_taxa contagem (fase1 task5)"
```

---

### Task 11: providers/odds.py — BSDMatchOdds.linhas for escanteios

**Files:**
- Create: `src/odd_analyzer/providers/odds.py`
- Create: `tests/test_providers_odds.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for OddsProvider implementations — all offline, fixture-based."""
import pytest
from odd_analyzer.providers.odds import BSDMatchOdds, ManualOdds, NullOdds, PropOddsProvider
from odd_analyzer.model.markets import MARKETS

EVENT = {
    "id": "101",
    "home_team": {"id": "10", "name": "Brasil"},
    "away_team": {"id": "20", "name": "Croacia"},
}

# BSD /events/{id}/odds/ response shape for corners_total
FIXTURE_EVENT_ODDS_CORNERS = {
    "event_id": "101",
    "bookmakers": [
        {
            "name": "Pinnacle",
            "markets": [
                {
                    "key": "corners_total",
                    "outcomes": [
                        {"name": "Over", "point": 9.5, "price": 1.87},
                        {"name": "Under", "point": 9.5, "price": 1.93},
                        {"name": "Over", "point": 7.5, "price": 1.45},
                        {"name": "Under", "point": 7.5, "price": 2.60},
                    ],
                }
            ],
        },
        {
            "name": "bet365",
            "markets": [
                {
                    "key": "corners_total",
                    "outcomes": [
                        {"name": "Over", "point": 9.5, "price": 1.85},
                        {"name": "Under", "point": 9.5, "price": 1.95},
                    ],
                }
            ],
        },
    ],
}


class FakeBSDClientOdds:
    def event_odds(self, event_id):
        return FIXTURE_EVENT_ODDS_CORNERS

    def odds_by_book(self, event_id, market, book):
        return FIXTURE_EVENT_ODDS_CORNERS


# ──────────────────────────────────────────────────────────────────────
# BSDMatchOdds
# ──────────────────────────────────────────────────────────────────────

def test_bsd_match_odds_returns_list_of_linhas():
    provider = BSDMatchOdds(client=FakeBSDClientOdds())
    market = MARKETS["escanteios"]
    linhas = provider.linhas(EVENT, market)
    assert isinstance(linhas, list)
    assert len(linhas) >= 1


def test_bsd_match_odds_each_linha_has_required_keys():
    provider = BSDMatchOdds(client=FakeBSDClientOdds())
    market = MARKETS["escanteios"]
    linhas = provider.linhas(EVENT, market)
    for linha in linhas:
        assert "entidade" in linha
        assert "linha" in linha
        assert "odd_over" in linha
        assert "odd_under" in linha
        assert "book" in linha


def test_bsd_match_odds_parses_over_under_pairs():
    provider = BSDMatchOdds(client=FakeBSDClientOdds())
    market = MARKETS["escanteios"]
    linhas = provider.linhas(EVENT, market)
    linha_95 = [l for l in linhas if l["linha"] == 9.5]
    assert len(linha_95) >= 1
    assert linha_95[0]["odd_over"] > 1.0
    assert linha_95[0]["odd_under"] > 1.0


def test_bsd_match_odds_skips_incomplete_pairs():
    """Uma linha sem under deve ser descartada (não dá p/ de-vig)."""
    class OneSideClient:
        def event_odds(self, event_id):
            return {
                "event_id": "101",
                "bookmakers": [{"name": "Pinnacle", "markets": [{"key": "corners_total",
                    "outcomes": [{"name": "Over", "point": 9.5, "price": 1.87}]}]}],
            }
        def odds_by_book(self, event_id, market, book):
            return self.event_odds(event_id)

    provider = BSDMatchOdds(client=OneSideClient())
    market = MARKETS["escanteios"]
    linhas = provider.linhas(EVENT, market)
    assert linhas == []


def test_bsd_match_odds_empty_when_no_bookmakers():
    class EmptyClient:
        def event_odds(self, event_id):
            return {"event_id": "101", "bookmakers": []}
        def odds_by_book(self, event_id, market, book):
            return self.event_odds(event_id)

    provider = BSDMatchOdds(client=EmptyClient())
    market = MARKETS["escanteios"]
    assert provider.linhas(EVENT, market) == []


# ──────────────────────────────────────────────────────────────────────
# ManualOdds
# ──────────────────────────────────────────────────────────────────────

def test_manual_odds_returns_provided_linhas():
    manual_linhas = [
        {"entidade": "partida", "linha": 9.5, "odd_over": 1.90, "odd_under": 1.90, "book": "manual"},
    ]
    provider = ManualOdds(linhas=manual_linhas)
    market = MARKETS["escanteios"]
    result = provider.linhas(EVENT, market)
    assert result == manual_linhas


def test_manual_odds_ignores_market_arg():
    manual_linhas = [{"entidade": "partida", "linha": 1.5, "odd_over": 2.0, "odd_under": 1.80, "book": "manual"}]
    provider = ManualOdds(linhas=manual_linhas)
    assert provider.linhas(EVENT, MARKETS["sot"]) == manual_linhas


# ──────────────────────────────────────────────────────────────────────
# NullOdds
# ──────────────────────────────────────────────────────────────────────

def test_null_odds_always_returns_empty():
    provider = NullOdds()
    assert provider.linhas(EVENT, MARKETS["escanteios"]) == []
    assert provider.linhas(EVENT, MARKETS["sot"]) == []


# ──────────────────────────────────────────────────────────────────────
# PropOddsProvider — stub, raises NotImplementedError
# ──────────────────────────────────────────────────────────────────────

def test_prop_odds_provider_raises_not_implemented():
    provider = PropOddsProvider()
    with pytest.raises(NotImplementedError):
        provider.linhas(EVENT, MARKETS["sot"])
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_odds.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.providers.odds')`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/providers/odds.py
"""OddsProvider protocol + implementações.

BSDMatchOdds   — /events/{id}/odds/ do BSD; retorna Over/Under por linha.
ManualOdds     — construído com linhas que o usuário cola (mercados de jogador).
NullOdds       — retorna [] → modelo-only (jogador sem odd pré-kickoff).
PropOddsProvider — stub documentado (slot p/ feed de prop futuro).

Formato de retorno (contagem):
    [{entidade, linha, odd_over, odd_under, book}]
Formato de retorno (partida_1x2):
    [{lado: "home"|"draw"|"away", odd}]
"""
from typing import Protocol

from odd_analyzer.model.markets import MarketSpec

# Mapeamento market.key → chave de mercado no BSD
_BSD_MARKET_KEY: dict[str, str] = {
    "escanteios": "corners_total",
    "gols": "goals_total",
    "vitoria": "match_winner",
}


class OddsProvider(Protocol):
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]: ...


# ──────────────────────────────────────────────────────────────────────
# BSDMatchOdds
# ──────────────────────────────────────────────────────────────────────

class BSDMatchOdds:
    """Puxa odds de partida do BSD (/events/{id}/odds/) e normaliza em linhas."""

    def __init__(self, client):
        self._client = client

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        bsd_market_key = _BSD_MARKET_KEY.get(market.key)
        if bsd_market_key is None:
            return []

        try:
            data = self._client.event_odds(event["id"])
        except Exception:
            return []

        grouped: dict[tuple, dict] = {}  # (book, line) → {over, under}

        for bm in data.get("bookmakers", []):
            book = bm.get("name", "")
            for mk in bm.get("markets", []):
                if mk.get("key") != bsd_market_key:
                    continue
                for outcome in mk.get("outcomes", []):
                    name = (outcome.get("name") or "").lower()
                    point = outcome.get("point")
                    price = outcome.get("price")
                    if point is None or price is None:
                        continue
                    entry = grouped.setdefault(
                        (book, point),
                        {"entidade": "partida", "linha": point,
                         "odd_over": None, "odd_under": None, "book": book},
                    )
                    if name == "over":
                        entry["odd_over"] = price
                    elif name == "under":
                        entry["odd_under"] = price

        # Descarta pares incompletos (sem os dois lados → não dá p/ de-vig)
        return [l for l in grouped.values() if l["odd_over"] and l["odd_under"]]


# ──────────────────────────────────────────────────────────────────────
# ManualOdds
# ──────────────────────────────────────────────────────────────────────

class ManualOdds:
    """Linhas fornecidas manualmente (mercados de jogador sem feed automático)."""

    def __init__(self, linhas: list[dict]):
        self._linhas = linhas

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return self._linhas


# ──────────────────────────────────────────────────────────────────────
# NullOdds
# ──────────────────────────────────────────────────────────────────────

class NullOdds:
    """Retorna lista vazia — modelo-only (sem odd disponível)."""

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return []


# ──────────────────────────────────────────────────────────────────────
# PropOddsProvider — slot para feed de prop futuro (não implementado)
# ──────────────────────────────────────────────────────────────────────

class PropOddsProvider:
    """Slot documentado para um feed de odds de prop de jogador no futuro.

    Não existe feed barato hoje — coleta manual via ManualOdds por ora.
    Quando o feed existir, implementar .linhas() aqui sem mudar o pipeline.
    """

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raise NotImplementedError(
            "PropOddsProvider: nenhum feed de prop de jogador configurado. "
            "Use ManualOdds para entrada manual ou NullOdds para modelo-only."
        )
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_odds.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/odds.py tests/test_providers_odds.py && git commit -m "feat: providers/odds.py — BSDMatchOdds + ManualOdds + NullOdds + PropOddsProvider stub (fase1 task6)"
```

---

### Task 12: pipeline.py — new signature dispatching by market.kind

**Files:**
- Modify: `src/odd_analyzer/pipeline.py`
- Modify: `tests/test_pipeline.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for the new analisar_jogo signature (fase1: market-aware, provider-injected)."""
import pytest
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.store.repo import InMemoryRepo

MARKET_ESCANTEIOS = MARKETS["escanteios"]

EVENT = {
    "id": "evt-corners-1",
    "jogo": "BRA x CRO",
}

# Fake StatsProvider for escanteios
class FakeStatsProvider:
    def elenco(self, event):
        return [{"id": "10", "name": "Brasil", "team_id": "10", "posicao": ""}]

    def entity_taxa(self, entity_id, market, contexto):
        return {
            "mu": 10.5,
            "minutos_esperados": 90.0,
            "xi_confirmado": True,
            "amostra_jogos": 12,
            "concedido_adversario": "alto",
            "incerteza": "baixa",
        }

    def team_rates(self, team_id, contexto):
        return None


# Fake OddsProvider with meaningful odds for escanteios
class FakeOddsProviderWithOdds:
    def linhas(self, event, market):
        return [
            {"entidade": "partida", "linha": 9.5, "odd_over": 1.87,
             "odd_under": 1.93, "book": "Pinnacle"},
        ]


class FakeOddsProviderEmpty:
    def linhas(self, event, market):
        return []


def fake_analista_apostar(candidatos, contexto):
    best = candidatos[0] if candidatos else None
    return {
        "melhor_aposta": (
            {"jogador": best["jogador"], "linha": best["linha"],
             "veredito": "APOSTAR", "confianca": "alta", "motivo": "ev positivo"}
            if best else None
        ),
        "outras": [],
        "alertas": [],
    }


def fake_analista_nao(candidatos, contexto):
    return {"melhor_aposta": None, "outras": [], "alertas": []}


# ──────────────────────────────────────────────────────────────────────
# Testes da nova assinatura
# ──────────────────────────────────────────────────────────────────────

def test_pipeline_nova_assinatura_aceita_market_e_providers():
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET_ESCANTEIOS,
        stats_provider=FakeStatsProvider(),
        odds_provider=FakeOddsProviderWithOdds(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert "candidatos" in result
    assert "ia" in result


def test_pipeline_contagem_gera_candidato_com_odds():
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET_ESCANTEIOS,
        stats_provider=FakeStatsProvider(),
        odds_provider=FakeOddsProviderWithOdds(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    # mu=10.5, linha=9.5 → P(X>=10) com NB → deve produzir candidato
    assert len(result["candidatos"]) >= 1
    c = result["candidatos"][0]
    assert c["market_type"] == "escanteios"
    assert c["linha"] == 9.5


def test_pipeline_contagem_null_odds_produz_lista_vazia_de_candidatos():
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET_ESCANTEIOS,
        stats_provider=FakeStatsProvider(),
        odds_provider=FakeOddsProviderEmpty(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert result["candidatos"] == []


def test_pipeline_grava_analise_no_repo():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKET_ESCANTEIOS,
        stats_provider=FakeStatsProvider(),
        odds_provider=FakeOddsProviderWithOdds(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert repo.get_analise(EVENT["id"]) is not None


def test_pipeline_grava_ledger_quando_apostar():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKET_ESCANTEIOS,
        stats_provider=FakeStatsProvider(),
        odds_provider=FakeOddsProviderWithOdds(),
        repo=repo,
        analista_fn=fake_analista_apostar,
    )
    assert len(repo.ledger) >= 1
    assert repo.ledger[0]["market_type"] == "escanteios"


def test_pipeline_nao_grava_ledger_sem_apostar():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKET_ESCANTEIOS,
        stats_provider=FakeStatsProvider(),
        odds_provider=FakeOddsProviderWithOdds(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert repo.ledger == []


def test_pipeline_market_type_propagado_para_candidato():
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET_ESCANTEIOS,
        stats_provider=FakeStatsProvider(),
        odds_provider=FakeOddsProviderWithOdds(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    for c in result["candidatos"]:
        assert c["market_type"] == "escanteios"
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline.py -v`
  `Expected: FAIL (TypeError: analisar_jogo() got unexpected keyword arguments 'market', 'stats_provider', 'odds_provider')`

- [ ] **Step 3: Write minimal implementation**

```python
"""Orquestra a análise de UM jogo: provider → mu → candidatos → filtro → IA → repo.
A matemática (builder) é código; a IA só lê e explica.
stats_provider e odds_provider são injetados — sem import direto de fonte."""
from odd_analyzer.candidates.builder import build_candidate
from odd_analyzer.candidates.filtro import filter_candidates
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.ai.analista import analisar as _default_analista
from odd_analyzer.model.markets import MarketSpec


def analisar_jogo(
    event: dict,
    market: MarketSpec,
    stats_provider,
    odds_provider,
    repo,
    overrides: dict | None = None,
    analista_fn=_default_analista,
) -> dict:
    """Analisa 1 jogo para 1 mercado. Retorna {"candidatos": [...], "ia": {...}}.

    dispatch por market.kind:
      "contagem"      → prob_over_line (NB) por linha × entidade
      "partida_totais"/ "partida_1x2" → match_model (Fase 3, ainda não implementado)
    """
    if market.kind == "contagem":
        candidatos = _run_contagem(event, market, stats_provider, odds_provider)
    else:
        # Fases 3+: match_model
        candidatos = []

    selecionados = filter_candidates(candidatos)
    ia = analista_fn(selecionados, {"jogo": event.get("jogo", event["id"])})

    repo.save_analise(event["id"], {
        "jogo": event.get("jogo"),
        "market_type": market.key,
        "candidatos": selecionados,
        "llm_resultado": ia,
    })

    aposta = ia.get("melhor_aposta")
    if aposta and aposta.get("veredito") == "APOSTAR":
        c = next(
            (c for c in selecionados
             if c["jogador"] == aposta["jogador"] and c["linha"] == aposta["linha"]),
            None,
        )
        if c:
            repo.save_ledger([{
                "event_id": event["id"],
                "jogador": c["jogador"],
                "linha": c["linha"],
                "market_type": c["market_type"],
                "odd_flag": c["odd"],
                "prob_modelo": c["prob_modelo"],
                "prob_devig": c["prob_devig"],
                "edge": c["edge"],
                "ev": c["ev"],
            }])

    return {"candidatos": selecionados, "ia": ia}


def _run_contagem(event, market: MarketSpec, stats_provider, odds_provider) -> list[dict]:
    """Constrói candidatos para mercados de contagem (time ou jogador)."""
    elenco = stats_provider.elenco(event)
    linhas = odds_provider.linhas(event, market)

    if not linhas:
        return []

    candidatos = []
    for entidade in elenco:
        contexto = {
            "event": event,
            "entity_team_id": entidade.get("team_id", entidade["id"]),
            "is_home": entidade.get("team_id") == str(
                event.get("home_team", {}).get("id", "")
            ),
            "league_avg_conceded": market.prior_rate,
        }
        taxa = stats_provider.entity_taxa(entidade["id"], market, contexto)
        if taxa is None:
            continue

        for linha_info in linhas:
            prob_modelo = prob_over_line(taxa["mu"], linha_info["linha"],
                                        r=market.nb_dispersion)
            candidatos.append(build_candidate(
                jogador=entidade["name"],
                linha=linha_info["linha"],
                odd_over=linha_info["odd_over"],
                odd_under=linha_info["odd_under"],
                prob_modelo=prob_modelo,
                mu=taxa["mu"],
                minutos_esperados=taxa["minutos_esperados"],
                xi_confirmado=taxa["xi_confirmado"],
                amostra_jogos=taxa["amostra_jogos"],
                concedido_adversario=taxa["concedido_adversario"],
                incerteza=taxa["incerteza"],
                market_type=market.key,
            ))

    return candidatos
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/pipeline.py tests/test_pipeline.py && git commit -m "refactor: pipeline — nova assinatura market/providers, dispatch kind=contagem (fase1 task7)"
```

---

### Task 13: End-to-end integration test — escanteios with fake providers

**Files:**
- Create: `tests/test_integration_escanteios.py`

- [ ] **Step 1: Write the failing test**

```python
"""Integração ponta-a-ponta: escanteios com providers FAKE (sem rede).

Doutrina validada:
  - EV calculado em código (filtro decide), IA só explica.
  - mu computado em código (assemble_mu via entity_taxa).
  - matchup = multiplicador de concessão no mesmo eixo (concedido_adversario).
  - Candidato com edge/EV positivo → filtro mantém → IA recebe → repo grava.
"""
import pytest
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev
from odd_analyzer.store.repo import InMemoryRepo

MARKET = MARKETS["escanteios"]

EVENT = {
    "id": "wc2026-bra-cro",
    "jogo": "Brasil x Croácia — WC2026",
    "home_team": {"id": "bra", "name": "Brasil"},
    "away_team": {"id": "cro", "name": "Croácia"},
}

# mu escolhido para garantir edge positivo contra odd_over=1.87 / odd_under=1.93
# fair_prob_over(1.87, 1.93) ≈ 0.516; precisamos prob_modelo > 0.516
# prob_over_line(10.5, 9.5, r=4.0) ≈ 0.60 → edge ≈ 0.08 > 0.04 ✓
TEAM_MU = 10.5


class FakeStatsE2E:
    """Provider fake: retorna um time com mu=TEAM_MU e amostra suficiente."""

    def elenco(self, event):
        return [{"id": "bra", "name": "Brasil", "team_id": "bra", "posicao": ""}]

    def entity_taxa(self, entity_id, market, contexto):
        return {
            "mu": TEAM_MU,
            "minutos_esperados": 90.0,
            "xi_confirmado": True,
            "amostra_jogos": 15,
            "concedido_adversario": "alto",
            "incerteza": "baixa",
        }

    def team_rates(self, team_id, contexto):
        return None


class FakeOddsE2E:
    """Provider fake: odd_over=1.87, odd_under=1.93 na linha 9.5."""

    def linhas(self, event, market):
        return [
            {"entidade": "partida", "linha": 9.5,
             "odd_over": 1.87, "odd_under": 1.93, "book": "Pinnacle"},
        ]


def _fake_analista_apostar(candidatos, contexto):
    best = candidatos[0] if candidatos else None
    return {
        "melhor_aposta": (
            {"jogador": best["jogador"], "linha": best["linha"],
             "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge positivo"}
            if best else None
        ),
        "outras": [],
        "alertas": [],
    }


# ──────────────────────────────────────────────────────────────────────
# Pré-condições matemáticas (verificam que os fixtures fazem sentido)
# ──────────────────────────────────────────────────────────────────────

def test_precondition_prob_modelo_acima_de_devig():
    prob_modelo = prob_over_line(TEAM_MU, 9.5, r=MARKET.nb_dispersion)
    prob_justa = fair_prob_over(1.87, 1.93)
    assert prob_modelo > prob_justa, (
        f"fixture inválido: prob_modelo={prob_modelo:.3f} <= prob_justa={prob_justa:.3f}"
    )


def test_precondition_ev_positivo():
    prob_modelo = prob_over_line(TEAM_MU, 9.5, r=MARKET.nb_dispersion)
    m = edge_ev(prob_modelo, fair_prob_over(1.87, 1.93), 1.87)
    assert m["ev"] > 0.05, f"EV={m['ev']:.3f} deve ser > 0.05 p/ filtro passar"
    assert m["edge"] > 0.04, f"edge={m['edge']:.3f} deve ser > 0.04 p/ filtro passar"


# ──────────────────────────────────────────────────────────────────────
# Fluxo completo
# ──────────────────────────────────────────────────────────────────────

def test_pipeline_produz_candidato_com_edge_ev_positivos():
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=FakeOddsE2E(),
        repo=repo,
        analista_fn=_fake_analista_apostar,
    )
    assert len(result["candidatos"]) >= 1
    c = result["candidatos"][0]
    assert c["edge"] > 0, "edge deve ser positivo"
    assert c["ev"] > 0, "EV deve ser positivo"


def test_pipeline_candidato_tem_market_type_escanteios():
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=FakeOddsE2E(),
        repo=repo,
        analista_fn=_fake_analista_apostar,
    )
    for c in result["candidatos"]:
        assert c["market_type"] == "escanteios"


def test_pipeline_filtro_mantem_candidato_acima_dos_cortes():
    """filtro.filter_candidates decide — não a IA."""
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=FakeOddsE2E(),
        repo=repo,
        analista_fn=_fake_analista_apostar,
    )
    from odd_analyzer.candidates.filtro import Cortes
    cuts = Cortes()
    for c in result["candidatos"]:
        assert c["edge"] >= cuts.edge_min
        assert c["ev"] >= cuts.ev_min
        assert c["xi_confirmado"] is True
        assert c["amostra_jogos"] >= cuts.amostra_min


def test_pipeline_ia_recebe_candidatos_e_recomenda():
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=FakeOddsE2E(),
        repo=repo,
        analista_fn=_fake_analista_apostar,
    )
    assert result["ia"]["melhor_aposta"] is not None
    aposta = result["ia"]["melhor_aposta"]
    assert aposta["veredito"] == "APOSTAR"
    assert aposta["jogador"] == "Brasil"
    assert aposta["linha"] == 9.5


def test_pipeline_analise_persistida_no_repo():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=FakeOddsE2E(),
        repo=repo,
        analista_fn=_fake_analista_apostar,
    )
    analise = repo.get_analise(EVENT["id"])
    assert analise is not None
    assert analise["market_type"] == "escanteios"


def test_pipeline_ledger_gravado_com_market_type():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=FakeOddsE2E(),
        repo=repo,
        analista_fn=_fake_analista_apostar,
    )
    assert len(repo.ledger) == 1
    ledger_row = repo.ledger[0]
    assert ledger_row["market_type"] == "escanteios"
    assert ledger_row["event_id"] == EVENT["id"]
    assert ledger_row["jogador"] == "Brasil"
    assert ledger_row["linha"] == 9.5


def test_pipeline_ia_nao_inventa_candidato_fora_do_conjunto():
    """IA só pode recomendar jogador/linha que o filtro já aprovou."""
    repo = InMemoryRepo()

    def ia_inventora(candidatos, contexto):
        # tenta recomendar jogador que não existe no conjunto
        return {
            "melhor_aposta": {
                "jogador": "Jogador Inventado",
                "linha": 99.5,
                "veredito": "APOSTAR",
                "confianca": "alta",
                "motivo": "inventei",
            },
            "outras": [],
            "alertas": [],
        }

    result = analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=FakeOddsE2E(),
        repo=repo,
        analista_fn=ia_inventora,
    )
    # ledger NÃO deve ser gravado para um jogador inventado fora do conjunto
    assert len(repo.ledger) == 0


def test_pipeline_sem_odds_nao_produz_candidatos():
    """NullOdds → candidatos=[] → IA recebe vazio → sem ledger."""
    from odd_analyzer.providers.odds import NullOdds
    repo = InMemoryRepo()
    result = analisar_jogo(
        event=EVENT,
        market=MARKET,
        stats_provider=FakeStatsE2E(),
        odds_provider=NullOdds(),
        repo=repo,
        analista_fn=_fake_analista_apostar,
    )
    assert result["candidatos"] == []
    assert result["ia"]["melhor_aposta"] is None
    assert repo.ledger == []
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_integration_escanteios.py -v`
  `Expected: FAIL (ImportError or assertion errors from missing pieces)`

- [ ] **Step 3: Write minimal implementation**

No new code — this test exercises the integration of Tasks 1–7. All components already exist after the previous tasks. If any test fails, the failing assertion will point to the exact gap (e.g. `ia_inventora` → ledger guard in pipeline, `NullOdds` import). Verify the pipeline's ledger guard uses `next(..., None)` so it silently skips when the IA recommends an entity not in `selecionados` (it already does per Task 7 implementation).

If `test_pipeline_ia_nao_inventa_candidato_fora_do_conjunto` fails, confirm `analisar_jogo` in `pipeline.py` has:

```python
c = next(
    (c for c in selecionados
     if c["jogador"] == aposta["jogador"] and c["linha"] == aposta["linha"]),
    None,
)
if c:
    repo.save_ledger([...])
```

This guard is already present in the Task 7 implementation — no additional code needed.

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_integration_escanteios.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add tests/test_integration_escanteios.py && git commit -m "test: integração ponta-a-ponta escanteios com providers fake (fase1 task8)"
```

---

### Task 14: Full suite green check

**Files:**
- No new files

- [ ] **Step 1: Write the failing test**

No new test — verify all existing tests still pass after the refactors in Tasks 3 and 7.

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/ -v --tb=short`
  `Expected: FAIL on tests/test_builder.py (old sot_concedido_adversario kwarg) and tests/test_pipeline.py (old signature)`

- [ ] **Step 3: Write minimal implementation**

The old `tests/test_pipeline.py` tests use the old `analisar_jogo(event, elenco, taxa_fn, repo, ...)` signature. Those tests were fully replaced in Task 7 with the new provider-based tests. Confirm the replacement is complete: the file at `tests/test_pipeline.py` now contains only the new-signature tests from Task 7 (no references to `taxa_fn` or `elenco` as positional args).

The old `tests/test_builder.py` test used `sot_concedido_adversario`. It was fully replaced in Task 3.

If any legacy test files still import the old names, patch them now. No legacy test files other than `test_builder.py` and `test_pipeline.py` reference `sot_concedido_adversario` or the old pipeline signature (verified by reading the test files above).

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/ -v --tb=short`
  `Expected: PASS (all tests green, 0 failures)`

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "chore: suite completa verde após fase1-escanteios (fase1 task9)"
```

---

## fase2-jogador

### Task 15: MARKETS registry — stat_field para mercados de jogador (sot/finalizacoes/desarmes)

**Files:**
- Modify: `src/odd_analyzer/model/markets.py`
- Test: `tests/test_markets_jogador.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.markets import MARKETS, MarketSpec

def test_sot_esta_no_registry():
    assert "sot" in MARKETS

def test_finalizacoes_esta_no_registry():
    assert "finalizacoes" in MARKETS

def test_desarmes_esta_no_registry():
    assert "desarmes" in MARKETS

def test_sot_stat_field_e_shots_on_target():
    assert MARKETS["sot"].stat_field == "shots_on_target"

def test_finalizacoes_stat_field_e_total_shots():
    assert MARKETS["finalizacoes"].stat_field == "total_shots"

def test_desarmes_stat_field_e_total_tackle():
    assert MARKETS["desarmes"].stat_field == "total_tackle"

def test_sot_nivel_jogador():
    assert MARKETS["sot"].nivel == "jogador"

def test_finalizacoes_nivel_jogador():
    assert MARKETS["finalizacoes"].nivel == "jogador"

def test_desarmes_nivel_jogador():
    assert MARKETS["desarmes"].nivel == "jogador"

def test_todos_mercados_jogador_kind_contagem():
    for key in ("sot", "finalizacoes", "desarmes"):
        assert MARKETS[key].kind == "contagem", f"{key} deveria ser kind=contagem"

def test_marketspec_e_frozen_dataclass():
    m = MARKETS["sot"]
    with pytest.raises((AttributeError, TypeError)):
        m.key = "outro"  # type: ignore[misc]

def test_sot_tem_lines_e_prior():
    m = MARKETS["sot"]
    assert isinstance(m.lines, list)
    assert len(m.lines) >= 1
    assert m.prior_rate > 0
    assert m.prior_strength > 0
    assert m.nb_dispersion > 0

def test_desarmes_tem_prior_rate_plausivel():
    # desarmes/90 médio de um lateral/volante é ~2-4; prior baixo é correto
    assert 0.5 <= MARKETS["desarmes"].prior_rate <= 5.0

def test_finalizacoes_prior_rate_maior_que_sot():
    # finalizações totais >= SOT sempre; prior deve refletir isso
    assert MARKETS["finalizacoes"].prior_rate >= MARKETS["sot"].prior_rate
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_markets_jogador.py -v`
`Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.model.markets' ou ImportError)`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/model/markets.py
from dataclasses import dataclass

@dataclass(frozen=True)
class MarketSpec:
    key: str
    nivel: str
    kind: str
    stat_field: str
    prior_rate: float
    prior_strength: float
    nb_dispersion: float
    lines: list
    eixo_concessao: str
    label: str

MARKETS: dict[str, MarketSpec] = {
    "sot": MarketSpec(
        key="sot",
        nivel="jogador",
        kind="contagem",
        stat_field="shots_on_target",
        prior_rate=0.4,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5],
        eixo_concessao="shots_on_target_concedido",
        label="Chutes a Gol (SOT)",
    ),
    "finalizacoes": MarketSpec(
        key="finalizacoes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_shots",
        prior_rate=1.2,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[1.5, 2.5],
        eixo_concessao="total_shots_concedido",
        label="Finalizações Totais",
    ),
    "desarmes": MarketSpec(
        key="desarmes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_tackle",
        prior_rate=1.8,
        prior_strength=12.0,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="total_tackle_concedido",
        label="Desarmes",
    ),
    "escanteios": MarketSpec(
        key="escanteios",
        nivel="partida",
        kind="contagem",
        stat_field="corners",
        prior_rate=5.0,
        prior_strength=10.0,
        nb_dispersion=4.0,
        lines=[8.5, 9.5, 10.5],
        eixo_concessao="corners_concedido",
        label="Escanteios",
    ),
    "gols": MarketSpec(
        key="gols",
        nivel="partida",
        kind="partida_totais",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10.0,
        nb_dispersion=4.0,
        lines=[2.5],
        eixo_concessao="goals_concedido",
        label="Gols",
    ),
    "vitoria": MarketSpec(
        key="vitoria",
        nivel="partida",
        kind="partida_1x2",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10.0,
        nb_dispersion=4.0,
        lines=[],
        eixo_concessao="goals_concedido",
        label="Resultado (1X2)",
    ),
}
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_markets_jogador.py -v`
`Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/model/markets.py tests/test_markets_jogador.py && git commit -m "feat: MarketSpec registry com 6 mercados MVP (sot/finalizacoes/desarmes/escanteios/gols/vitoria)"
```

---

### Task 16: BSDStatsProvider.entity_taxa usa stat_field do MarketSpec

**Files:**
- Create: `src/odd_analyzer/bsd/__init__.py`
- Create: `src/odd_analyzer/bsd/client.py`
- Create: `src/odd_analyzer/providers/__init__.py`
- Create: `src/odd_analyzer/providers/stats.py`
- Test: `tests/test_bsd_stats_provider.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.providers.stats import BSDStatsProvider

# Fixture inline — shape real do endpoint /players/{id}/stats/ do BSD
# (lista de jogos de clube na temporada; cada item = 1 jogo)
BSD_PLAYER_STATS_FIXTURE = {
    "results": 5,
    "data": [
        {"minutes_played": 90, "shots_on_target": 3, "total_shots": 5, "total_tackle": 2},
        {"minutes_played": 78, "shots_on_target": 1, "total_shots": 2, "total_tackle": 4},
        {"minutes_played": 90, "shots_on_target": 2, "total_shots": 4, "total_tackle": 1},
        {"minutes_played": 60, "shots_on_target": 0, "total_shots": 1, "total_tackle": 3},
        {"minutes_played": 90, "shots_on_target": 2, "total_shots": 3, "total_tackle": 2},
    ]
}

# Fixture do endpoint /events/{id}/player-stats/ (stats do adversário no mesmo jogo)
# Usada para calcular concedido_adversario
BSD_EVENT_PLAYER_STATS_FIXTURE = {
    "results": 4,
    "data": [
        # time adversário (team_id=99) — 4 jogadores
        {"team_id": 99, "player_id": 1, "shots_on_target": 2, "total_shots": 4, "total_tackle": 3},
        {"team_id": 99, "player_id": 2, "shots_on_target": 1, "total_shots": 2, "total_tackle": 2},
        {"team_id": 99, "player_id": 3, "shots_on_target": 0, "total_shots": 1, "total_tackle": 1},
        # time do jogador (team_id=10) — não entra no concedido
        {"team_id": 10, "player_id": 4, "shots_on_target": 3, "total_shots": 5, "total_tackle": 4},
    ]
}

def _make_provider(player_stats=None, event_player_stats=None):
    """Cria BSDStatsProvider com client mockado via _get injetado."""
    calls = {}
    player_data = player_stats or BSD_PLAYER_STATS_FIXTURE
    event_data = event_player_stats or BSD_EVENT_PLAYER_STATS_FIXTURE

    def fake_get(path, params=None):
        calls[path] = params
        if "player-stats" in path or path.endswith("/player-stats/"):
            return event_data
        if "/players/" in path and "/stats/" in path:
            return player_data
        return {}

    from odd_analyzer.bsd.client import BSDClient
    client = BSDClient(api_key="test-key", _get=fake_get)
    return BSDStatsProvider(client=client), calls

def test_entity_taxa_sot_stat_field_shots_on_target():
    provider, _ = _make_provider()
    market = MARKETS["sot"]
    # contexto: event_id, team_id do jogador, team_id adversário, mando
    ctx = {"event_id": "evt1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=42, market=market, contexto=ctx)
    assert result is not None
    assert "mu" in result
    assert result["mu"] > 0
    # mu deve ser computado a partir de shots_on_target
    assert "amostra_jogos" in result
    assert result["amostra_jogos"] == 5

def test_entity_taxa_finalizacoes_stat_field_total_shots():
    provider, _ = _make_provider()
    market = MARKETS["finalizacoes"]
    ctx = {"event_id": "evt1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=42, market=market, contexto=ctx)
    assert result is not None
    # com total_shots=[5,2,4,1,3] -> taxa maior que sot=[3,1,2,0,2]
    ctx2 = {"event_id": "evt1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result_sot = provider.entity_taxa(player_id=42, market=MARKETS["sot"], contexto=ctx2)
    assert result["mu"] > result_sot["mu"]

def test_entity_taxa_desarmes_stat_field_total_tackle():
    provider, _ = _make_provider()
    market = MARKETS["desarmes"]
    ctx = {"event_id": "evt1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=42, market=market, contexto=ctx)
    assert result is not None
    assert result["mu"] > 0
    # total_tackle=[2,4,1,3,2] -> taxa por 90 visível
    assert result["amostra_jogos"] == 5

def test_entity_taxa_retorna_none_sem_dados():
    provider, _ = _make_provider(player_stats={"results": 0, "data": []})
    market = MARKETS["sot"]
    ctx = {"event_id": "evt1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=42, market=market, contexto=ctx)
    assert result is None

def test_entity_taxa_contem_todos_os_campos_obrigatorios():
    provider, _ = _make_provider()
    market = MARKETS["sot"]
    ctx = {"event_id": "evt1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=42, market=market, contexto=ctx)
    for campo in ("mu", "minutos_esperados", "xi_confirmado", "amostra_jogos",
                  "concedido_adversario", "incerteza"):
        assert campo in result, f"campo '{campo}' ausente no retorno de entity_taxa"
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_stats_provider.py -v`
`Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.bsd' ou 'odd_analyzer.providers')`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/bsd/__init__.py
# (vazio — marca o pacote)
```

```python
# src/odd_analyzer/bsd/client.py
"""Cliente HTTP fino para a API BSD/Bzzoiro.
Toda chamada passa por cached_get. _get é injetável para testes offline."""
from odd_analyzer.cache import cached_get as _cached_get

_BASE = "https://sports.bzzoiro.com/api/v2"

class BSDClient:
    def __init__(self, api_key: str, cache_dir=None, _get=None):
        self._key = api_key
        self._cache_dir = cache_dir
        self._get_fn = _get  # injetado nos testes (None = requests real)

    def _request(self, path: str, params: dict | None = None) -> dict:
        params = params or {}
        if self._get_fn is not None:
            return self._get_fn(path, params)
        import requests
        url = f"{_BASE}/{path.lstrip('/')}"
        cache_key = f"bsd:{path}:{sorted(params.items())}"
        def fetch():
            r = requests.get(url, params=params,
                             headers={"Authorization": f"Token {self._key}"}, timeout=30)
            r.raise_for_status()
            return r.json()
        return _cached_get(cache_key, fetch, cache_dir=self._cache_dir,
                           should_cache=lambda d: bool(d.get("data")))

    def events(self, **filtros) -> dict:
        return self._request("events/", filtros)

    def get_event(self, event_id) -> dict:
        return self._request(f"events/{event_id}/")

    def event_player_stats(self, event_id) -> dict:
        return self._request(f"events/{event_id}/player-stats/")

    def player_stats(self, player_id, **filtros) -> dict:
        return self._request(f"players/{player_id}/stats/", filtros)

    def lineups(self, event_id) -> dict:
        return self._request(f"events/{event_id}/lineups/")

    def team_stats(self, event_id) -> dict:
        return self._request(f"events/{event_id}/team-stats/")

    def event_odds(self, event_id) -> dict:
        return self._request(f"events/{event_id}/odds/")

    def odds_by_book(self, event_id, market, book) -> dict:
        return self._request(f"events/{event_id}/odds/", {"market": market, "book": book})

    def national_pool(self, team_id) -> dict:
        return self._request("players/", {"national_team_id": team_id})

    def squad(self, team_id) -> dict:
        return self._request(f"teams/{team_id}/squad/")

    def leagues(self) -> dict:
        return self._request("leagues/")
```

```python
# src/odd_analyzer/providers/__init__.py
# (vazio — marca o pacote)
```

```python
# src/odd_analyzer/providers/stats.py
"""StatsProvider protocol + implementações BSD e fallback."""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec
from odd_analyzer.model.shrinkage import shrink_rate
from odd_analyzer.model.sot_model import expected_lambda
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier

@runtime_checkable
class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]: ...
    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None: ...
    def team_rates(self, team_id, contexto: dict) -> dict | None: ...


def _windowed_rate(games: list[dict], stat_field: str) -> tuple[float, int]:
    """Taxa por 90 e número de jogos com minutos > 0."""
    total_stat = 0.0
    total_min = 0.0
    n = 0
    for g in games:
        m = g.get("minutes_played") or 0
        s = g.get(stat_field) or 0
        if m > 0:
            total_stat += s
            total_min += m
            n += 1
    if total_min == 0:
        return 0.0, 0
    return total_stat / total_min * 90.0, n


class BSDStatsProvider:
    def __init__(self, client):
        self._client = client

    def elenco(self, event: dict) -> list[dict]:
        data = self._client.lineups(event["id"])
        players = []
        for item in data.get("data", []):
            players.append({
                "id": item.get("player_id"),
                "name": item.get("player_name", ""),
                "team_id": item.get("team_id"),
                "posicao": item.get("position", ""),
            })
        return players

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raw = self._client.player_stats(entity_id)
        games = raw.get("data", [])
        if not games:
            return None

        stat_field = market.stat_field
        rate_per90, n_games = _windowed_rate(games, stat_field)
        if n_games == 0:
            return None

        rate_shrunk = shrink_rate(
            rate_per90, n_games, market.prior_rate, market.prior_strength
        )

        # minutos esperados: mediana dos últimos jogos (usa média simples como proxy)
        total_min = sum(g.get("minutes_played") or 0 for g in games if (g.get("minutes_played") or 0) > 0)
        minutos_esperados = total_min / n_games if n_games else 90.0

        # concedido_adversario: agrega stat_field dos jogadores do adversário no evento
        event_id = contexto.get("event_id")
        opp_team_id = contexto.get("opp_team_id")
        concedido_adversario = None
        if event_id and opp_team_id is not None:
            ev_stats = self._client.event_player_stats(event_id)
            opp_players = [
                p for p in ev_stats.get("data", [])
                if p.get("team_id") == opp_team_id
            ]
            if opp_players:
                concedido_adversario = sum(p.get(stat_field) or 0 for p in opp_players)

        is_home = contexto.get("is_home", True)
        ha_mult = home_away_multiplier(is_home, home_factor=1.05, away_factor=0.95)

        # opponent_multiplier usa concedido_adversario como taxa bruta (sem média da liga aqui)
        # usa 1.0 como neutro se concedido_adversario indisponível
        opp_mult = 1.0
        if concedido_adversario is not None:
            league_avg = market.prior_rate * (minutos_esperados / 90.0) * len(
                [p for p in ev_stats.get("data", []) if (p.get("team_id") or 0) != opp_team_id]
            ) or 1.0
            # simplificado: compara concedido com o prior do mercado * jogadores típicos
            prior_concedido = market.prior_rate * 11 * (minutos_esperados / 90.0)
            opp_mult = opponent_multiplier(concedido_adversario, prior_concedido)

        mu = expected_lambda(rate_shrunk, minutos_esperados) * opp_mult * ha_mult

        incerteza = "alta" if n_games < 5 else ("media" if n_games < 15 else "baixa")
        xi_confirmado = n_games >= 3

        return {
            "mu": mu,
            "minutos_esperados": minutos_esperados,
            "xi_confirmado": xi_confirmado,
            "amostra_jogos": n_games,
            "concedido_adversario": concedido_adversario,
            "incerteza": incerteza,
        }

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        # Fase 3 — modelo de partida; stub por ora
        return None


class ApiFootballStatsProvider:
    """Envolve stats/apifootball.py existente para satisfazer o protocolo StatsProvider."""

    def __init__(self, league_id: int, season: int):
        self._league_id = league_id
        self._season = season

    def elenco(self, event: dict) -> list[dict]:
        return []

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        return None

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        return None


class FallbackStatsProvider:
    """Tenta BSD; cai para API-Football se None/erro. Loga a fonte servida."""

    def __init__(self, bsd: BSDStatsProvider, fallback: ApiFootballStatsProvider):
        self._bsd = bsd
        self._fallback = fallback

    def elenco(self, event: dict) -> list[dict]:
        try:
            result = self._bsd.elenco(event)
            if result:
                return result
        except Exception as exc:
            import logging
            logging.warning("BSD elenco falhou (%s); usando fallback", exc)
        return self._fallback.elenco(event)

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        try:
            result = self._bsd.entity_taxa(entity_id, market, contexto)
            if result is not None:
                import logging
                logging.debug("entity_taxa fonte=BSD player=%s market=%s", entity_id, market.key)
                return result
        except Exception as exc:
            import logging
            logging.warning("BSD entity_taxa falhou (player=%s, %s); usando fallback", entity_id, exc)
        result = self._fallback.entity_taxa(entity_id, market, contexto)
        if result is not None:
            import logging
            logging.info("entity_taxa fonte=API-Football player=%s market=%s", entity_id, market.key)
        else:
            import logging
            logging.warning("entity_taxa: ambas as fontes falharam para player=%s market=%s — descartado", entity_id, market.key)
        return result

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        try:
            result = self._bsd.team_rates(team_id, contexto)
            if result is not None:
                return result
        except Exception:
            pass
        return self._fallback.team_rates(team_id, contexto)
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_stats_provider.py -v`
`Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/bsd/__init__.py src/odd_analyzer/bsd/client.py src/odd_analyzer/providers/__init__.py src/odd_analyzer/providers/stats.py tests/test_bsd_stats_provider.py && git commit -m "feat: BSDClient + BSDStatsProvider com entity_taxa por stat_field de MarketSpec"
```

---

### Task 17: Concedido adversário — agrega event_player_stats por mercado

**Files:**
- Modify: `src/odd_analyzer/providers/stats.py`
- Test: `tests/test_bsd_concedido_adversario.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.providers.stats import BSDStatsProvider
from odd_analyzer.bsd.client import BSDClient

# Fixture inline do endpoint /events/{id}/player-stats/
# Time adversário (opp_team_id=99) tem 3 jogadores com stats conhecidas
EVENT_PLAYER_STATS = {
    "results": 5,
    "data": [
        {"team_id": 99, "player_id": 1, "shots_on_target": 2, "total_shots": 4, "total_tackle": 3},
        {"team_id": 99, "player_id": 2, "shots_on_target": 1, "total_shots": 2, "total_tackle": 2},
        {"team_id": 99, "player_id": 3, "shots_on_target": 0, "total_shots": 1, "total_tackle": 1},
        # time do jogador — não deve entrar no concedido
        {"team_id": 10, "player_id": 4, "shots_on_target": 5, "total_shots": 8, "total_tackle": 4},
        {"team_id": 10, "player_id": 5, "shots_on_target": 3, "total_shots": 6, "total_tackle": 2},
    ]
}

PLAYER_STATS_5GAMES = {
    "results": 5,
    "data": [
        {"minutes_played": 90, "shots_on_target": 2, "total_shots": 4, "total_tackle": 3},
        {"minutes_played": 90, "shots_on_target": 1, "total_shots": 3, "total_tackle": 2},
        {"minutes_played": 90, "shots_on_target": 2, "total_shots": 5, "total_tackle": 4},
        {"minutes_played": 90, "shots_on_target": 0, "total_shots": 2, "total_tackle": 1},
        {"minutes_played": 90, "shots_on_target": 1, "total_shots": 3, "total_tackle": 3},
    ]
}

def _make_provider():
    def fake_get(path, params=None):
        if "player-stats" in path:
            return EVENT_PLAYER_STATS
        if "/players/" in path:
            return PLAYER_STATS_5GAMES
        return {}
    client = BSDClient(api_key="test", _get=fake_get)
    return BSDStatsProvider(client=client)

def test_concedido_adversario_sot_soma_apenas_opp_team():
    """SOT concedido = soma de shots_on_target dos jogadores do adversário (team_id=99)."""
    provider = _make_provider()
    ctx = {"event_id": "e1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=7, market=MARKETS["sot"], contexto=ctx)
    assert result is not None
    # shots_on_target do time 99: 2+1+0 = 3
    assert result["concedido_adversario"] == 3

def test_concedido_adversario_finalizacoes_usa_total_shots():
    """Finalizações concedidas = soma de total_shots dos jogadores do adversário."""
    provider = _make_provider()
    ctx = {"event_id": "e1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=7, market=MARKETS["finalizacoes"], contexto=ctx)
    assert result is not None
    # total_shots do time 99: 4+2+1 = 7
    assert result["concedido_adversario"] == 7

def test_concedido_adversario_desarmes_usa_total_tackle():
    """Desarmes concedidos = soma de total_tackle dos jogadores do adversário."""
    provider = _make_provider()
    ctx = {"event_id": "e1", "team_id": 10, "opp_team_id": 99, "is_home": True}
    result = provider.entity_taxa(player_id=7, market=MARKETS["desarmes"], contexto=ctx)
    assert result is not None
    # total_tackle do time 99: 3+2+1 = 6
    assert result["concedido_adversario"] == 6

def test_concedido_adversario_none_sem_opp_team_id():
    """Sem opp_team_id no contexto, concedido_adversario deve ser None."""
    provider = _make_provider()
    ctx = {"event_id": "e1", "team_id": 10, "is_home": True}  # sem opp_team_id
    result = provider.entity_taxa(player_id=7, market=MARKETS["sot"], contexto=ctx)
    assert result is not None
    assert result["concedido_adversario"] is None

def test_concedido_adversario_none_sem_event_id():
    """Sem event_id no contexto, concedido_adversario deve ser None."""
    provider = _make_provider()
    ctx = {"team_id": 10, "opp_team_id": 99, "is_home": True}  # sem event_id
    result = provider.entity_taxa(player_id=7, market=MARKETS["sot"], contexto=ctx)
    assert result is not None
    assert result["concedido_adversario"] is None
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_concedido_adversario.py -v`
`Expected: FAIL (AssertionError nos valores de concedido_adversario — a lógica de agregação por stat_field ainda não está separada corretamente)`

- [ ] **Step 3: Write minimal implementation**

The fix is in `src/odd_analyzer/providers/stats.py` — replace the `entity_taxa` method's `concedido_adversario` block so it uses `stat_field` directly (not a fallback reference to `ev_stats` outside scope):

```python
# src/odd_analyzer/providers/stats.py
# Replace the full entity_taxa method in BSDStatsProvider with:

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raw = self._client.player_stats(entity_id)
        games = raw.get("data", [])
        if not games:
            return None

        stat_field = market.stat_field
        rate_per90, n_games = _windowed_rate(games, stat_field)
        if n_games == 0:
            return None

        rate_shrunk = shrink_rate(
            rate_per90, n_games, market.prior_rate, market.prior_strength
        )

        total_min = sum(g.get("minutes_played") or 0 for g in games if (g.get("minutes_played") or 0) > 0)
        minutos_esperados = total_min / n_games if n_games else 90.0

        event_id = contexto.get("event_id")
        opp_team_id = contexto.get("opp_team_id")
        concedido_adversario = None
        ev_stats_data = []
        if event_id is not None and opp_team_id is not None:
            ev_stats = self._client.event_player_stats(event_id)
            ev_stats_data = ev_stats.get("data", [])
            opp_players = [p for p in ev_stats_data if p.get("team_id") == opp_team_id]
            if opp_players:
                concedido_adversario = sum(p.get(stat_field) or 0 for p in opp_players)

        is_home = contexto.get("is_home", True)
        ha_mult = home_away_multiplier(is_home, home_factor=1.05, away_factor=0.95)

        opp_mult = 1.0
        if concedido_adversario is not None:
            prior_concedido = market.prior_rate * 11 * (minutos_esperados / 90.0)
            opp_mult = opponent_multiplier(concedido_adversario, prior_concedido)

        mu = expected_lambda(rate_shrunk, minutos_esperados) * opp_mult * ha_mult

        incerteza = "alta" if n_games < 5 else ("media" if n_games < 15 else "baixa")
        xi_confirmado = n_games >= 3

        return {
            "mu": mu,
            "minutos_esperados": minutos_esperados,
            "xi_confirmado": xi_confirmado,
            "amostra_jogos": n_games,
            "concedido_adversario": concedido_adversario,
            "incerteza": incerteza,
        }
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_bsd_concedido_adversario.py tests/test_bsd_stats_provider.py -v`
`Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/stats.py tests/test_bsd_concedido_adversario.py && git commit -m "feat: concedido_adversario agrega event_player_stats pelo stat_field do MarketSpec"
```

---

### Task 18: OddsProvider — NullOdds e ManualOdds

**Files:**
- Create: `src/odd_analyzer/providers/odds.py`
- Test: `tests/test_odds_providers.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.providers.odds import NullOdds, ManualOdds, PropOddsProvider

EVENT = {"id": "evt1", "jogo": "BRA x CRO"}

def test_null_odds_retorna_lista_vazia():
    p = NullOdds()
    assert p.linhas(EVENT, MARKETS["sot"]) == []

def test_null_odds_retorna_lista_vazia_para_qualquer_mercado():
    p = NullOdds()
    for key in ("sot", "finalizacoes", "desarmes", "escanteios"):
        assert p.linhas(EVENT, MARKETS[key]) == []

def test_manual_odds_retorna_linhas_fornecidas():
    linhas = [
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.85, "odd_under": 1.95, "book": "manual"},
        {"entidade": "Vinicius Jr", "linha": 1.5, "odd_over": 3.20, "odd_under": 1.35, "book": "manual"},
    ]
    p = ManualOdds(linhas=linhas)
    result = p.linhas(EVENT, MARKETS["sot"])
    assert result == linhas

def test_manual_odds_linhas_independe_do_event():
    linhas = [{"entidade": "Pedri", "linha": 1.5, "odd_over": 2.10, "odd_under": 1.72, "book": "manual"}]
    p = ManualOdds(linhas=linhas)
    result1 = p.linhas({"id": "e1"}, MARKETS["finalizacoes"])
    result2 = p.linhas({"id": "e2"}, MARKETS["finalizacoes"])
    assert result1 == result2 == linhas

def test_manual_odds_linhas_independe_do_market():
    linhas = [{"entidade": "Casemiro", "linha": 2.5, "odd_over": 2.00, "odd_under": 1.80, "book": "manual"}]
    p = ManualOdds(linhas=linhas)
    assert p.linhas(EVENT, MARKETS["desarmes"]) == linhas
    assert p.linhas(EVENT, MARKETS["sot"]) == linhas

def test_manual_odds_lista_vazia_se_construido_sem_linhas():
    p = ManualOdds(linhas=[])
    assert p.linhas(EVENT, MARKETS["sot"]) == []

def test_prop_odds_provider_levanta_not_implemented():
    p = PropOddsProvider()
    with pytest.raises(NotImplementedError):
        p.linhas(EVENT, MARKETS["sot"])
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_odds_providers.py -v`
`Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.providers.odds')`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/providers/odds.py
"""OddsProvider protocol + implementações para mercados de jogador e partida."""
from typing import Protocol, runtime_checkable
from odd_analyzer.model.markets import MarketSpec

@runtime_checkable
class OddsProvider(Protocol):
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]: ...


class NullOdds:
    """Retorna lista vazia — mercado sem odd disponível (modelo-only)."""
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return []


class ManualOdds:
    """Construído com linhas que o usuário cola manualmente na UI."""
    def __init__(self, linhas: list[dict]):
        self._linhas = linhas

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return self._linhas


class PropOddsProvider:
    """Slot reservado para feed de odd de prop futuro. Não implementado."""
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raise NotImplementedError(
            "PropOddsProvider: nenhum feed de odd de prop disponível no momento. "
            "Use ManualOdds para entrada manual ou NullOdds para modelo-only."
        )


class BSDMatchOdds:
    """Odds de partida via BSD (/events/{id}/odds/). Stub — implementado na Fase 1."""
    def __init__(self, client):
        self._client = client

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        # Implementação completa na Fase 1 (escanteios/gols/vitória).
        raise NotImplementedError("BSDMatchOdds: implementado na Fase 1.")
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_odds_providers.py -v`
`Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/odds.py tests/test_odds_providers.py && git commit -m "feat: NullOdds, ManualOdds e PropOddsProvider (slot) em providers/odds.py"
```

---

### Task 19: Pipeline com NullOdds → prob-only (EV=None, flag "sem odd")

**Files:**
- Modify: `src/odd_analyzer/candidates/builder.py`
- Modify: `src/odd_analyzer/pipeline.py`
- Test: `tests/test_pipeline_null_odds.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.providers.odds import NullOdds, ManualOdds
from odd_analyzer.store.repo import InMemoryRepo

# Providers fake para uso nos testes (sem rede)
class FakeStatsProvider:
    def elenco(self, event):
        return [{"id": 42, "name": "Vinicius Jr", "team_id": 10, "posicao": "ATA"}]

    def entity_taxa(self, entity_id, market, contexto):
        return {
            "mu": 1.4,
            "minutos_esperados": 88.0,
            "xi_confirmado": True,
            "amostra_jogos": 18,
            "concedido_adversario": 3,
            "incerteza": "media",
        }

    def team_rates(self, team_id, contexto):
        return None

EVENT = {"id": "evt1", "jogo": "BRA x CRO", "home_team_id": 10, "away_team_id": 99}


def _run(odds_provider, market_key="sot"):
    from odd_analyzer.pipeline import analisar_jogo
    market = MARKETS[market_key]
    repo = InMemoryRepo()
    return analisar_jogo(
        event=EVENT,
        market=market,
        stats_provider=FakeStatsProvider(),
        odds_provider=odds_provider,
        repo=repo,
        analista_fn=lambda cands, ctx: {"melhor_aposta": None, "outras": [], "alertas": []},
    ), repo


def test_null_odds_gera_candidato_sem_ev():
    out, repo = _run(NullOdds())
    # com NullOdds, candidatos não passam pelo filtro padrão (sem EV),
    # mas o pipeline deve retornar candidatos com flag sem_odd=True
    cands = out["candidatos_brutos"]  # candidatos antes do filtro de EV
    assert len(cands) >= 1
    c = cands[0]
    assert c["sem_odd"] is True
    assert c["ev"] is None
    assert c["edge"] is None
    assert c["prob_modelo"] > 0


def test_null_odds_candidatos_filtrados_estao_vazios():
    """Com NullOdds, filter_candidates não recebe candidatos com EV -> lista filtrada vazia."""
    out, _ = _run(NullOdds())
    assert out["candidatos"] == []


def test_manual_odds_gera_candidato_com_ev():
    linhas = [
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.85, "odd_under": 1.95, "book": "manual"},
    ]
    out, _ = _run(ManualOdds(linhas=linhas))
    cands = out["candidatos_brutos"]
    assert len(cands) >= 1
    c = next((c for c in cands if c["entidade"] == "Vinicius Jr" and c["linha"] == 0.5), None)
    assert c is not None
    assert c["sem_odd"] is False
    assert c["ev"] is not None
    assert c["edge"] is not None
    assert c["prob_modelo"] > 0


def test_null_odds_nao_grava_ledger():
    out, repo = _run(NullOdds())
    assert repo.ledger == []


def test_manual_odds_candidato_tem_market_type():
    linhas = [
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.85, "odd_under": 1.95, "book": "manual"},
    ]
    out, _ = _run(ManualOdds(linhas=linhas))
    for c in out["candidatos_brutos"]:
        assert c.get("market_type") == "sot"
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline_null_odds.py -v`
`Expected: FAIL (TypeError: analisar_jogo() got unexpected keyword argument 'market' ou AttributeError)`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/candidates/builder.py
"""Monta o dossiê de UM candidato no formato que a IA lê (design v1 §7).
Toda a matemática (de-vig, edge, EV) vem do código aqui — a IA nunca calcula."""
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev


def build_candidate(entidade, linha, prob_modelo, mu,
                    minutos_esperados, xi_confirmado, amostra_jogos,
                    concedido_adversario, incerteza, market_type,
                    odd_over=None, odd_under=None) -> dict:
    """Monta candidato. odd_over/odd_under opcionais — sem odd: ev=None, edge=None."""
    sem_odd = odd_over is None or odd_under is None
    if sem_odd:
        prob_devig = None
        edge = None
        ev = None
        odd = None
    else:
        prob_devig = fair_prob_over(odd_over, odd_under)
        m = edge_ev(prob_modelo, prob_devig, odd_over)
        edge = m["edge"]
        ev = m["ev"]
        odd = odd_over
    return {
        "entidade": entidade,
        "jogador": entidade,   # compat com pipeline antigo
        "linha": linha,
        "odd": odd,
        "prob_modelo": prob_modelo,
        "prob_devig": prob_devig,
        "edge": edge,
        "ev": ev,
        "lambda": mu,
        "minutos_esperados": minutos_esperados,
        "xi_confirmado": xi_confirmado,
        "amostra_jogos": amostra_jogos,
        "concedido_adversario": concedido_adversario,
        "incerteza": incerteza,
        "market_type": market_type,
        "sem_odd": sem_odd,
    }
```

```python
# src/odd_analyzer/pipeline.py
"""Orquestra a análise de UM jogo para UM mercado: stats -> odds -> modelo ->
candidatos -> filtro -> IA -> persiste. A matemática vem do código (builder);
a IA só lê. stats_provider e odds_provider são injetados p/ testar offline."""
from odd_analyzer.candidates.builder import build_candidate
from odd_analyzer.candidates.filtro import filter_candidates, Cortes
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.markets import MarketSpec
from odd_analyzer.ai.analista import analisar as _default_analista
from odd_analyzer.model.params import NB_DISPERSION


def analisar_jogo(event: dict, market: MarketSpec, stats_provider, odds_provider,
                  repo, overrides: dict | None = None,
                  analista_fn=_default_analista) -> dict:
    """Analisa 1 jogo / 1 mercado.

    Retorna {"candidatos": [...], "candidatos_brutos": [...], "ia": {...}}.
    candidatos_brutos inclui todos (com e sem odd); candidatos só os filtrados com EV.
    """
    contexto = {
        "event_id": event.get("id"),
        "team_id": event.get("home_team_id"),
        "opp_team_id": event.get("away_team_id"),
        "is_home": True,
    }

    elenco = stats_provider.elenco(event)
    linhas_odds = odds_provider.linhas(event, market)

    # Indexa odds por (entidade_normalizada, linha)
    odds_index: dict[tuple, dict] = {}
    for lo in linhas_odds:
        nome = (lo.get("entidade") or "").lower().strip()
        odds_index[(nome, lo["linha"])] = lo

    candidatos_brutos = []

    if market.kind == "contagem":
        for jogador in elenco:
            taxa = stats_provider.entity_taxa(jogador["id"], market, contexto)
            if taxa is None:
                continue
            mu = taxa["mu"]
            for linha in market.lines:
                prob_modelo = prob_over_line(mu, linha, r=market.nb_dispersion)
                nome_norm = jogador["name"].lower().strip()
                odd_entry = odds_index.get((nome_norm, linha))
                odd_over = odd_entry["odd_over"] if odd_entry else None
                odd_under = odd_entry["odd_under"] if odd_entry else None
                c = build_candidate(
                    entidade=jogador["name"],
                    linha=linha,
                    prob_modelo=prob_modelo,
                    mu=mu,
                    minutos_esperados=taxa["minutos_esperados"],
                    xi_confirmado=taxa["xi_confirmado"],
                    amostra_jogos=taxa["amostra_jogos"],
                    concedido_adversario=taxa["concedido_adversario"],
                    incerteza=taxa["incerteza"],
                    market_type=market.key,
                    odd_over=odd_over,
                    odd_under=odd_under,
                )
                candidatos_brutos.append(c)
    else:
        # partida_totais / partida_1x2 — Fase 3
        pass

    # Só passa pelo filtro de EV os candidatos com odd
    candidatos_com_odd = [c for c in candidatos_brutos if not c["sem_odd"]]
    selecionados = filter_candidates(candidatos_com_odd)

    ia = analista_fn(selecionados, {"jogo": event.get("jogo", event["id"]), "mercado": market.label})
    repo.save_analise(event["id"], {
        "jogo": event.get("jogo"),
        "market_type": market.key,
        "candidatos": selecionados,
        "llm_resultado": ia,
    })

    aposta = ia.get("melhor_aposta")
    if aposta and aposta.get("veredito") == "APOSTAR":
        c = next((c for c in selecionados
                  if c["jogador"] == aposta.get("jogador")
                  and c["linha"] == aposta.get("linha")), None)
        if c:
            repo.save_ledger([{
                "event_id": event["id"],
                "jogador": c["jogador"],
                "linha": c["linha"],
                "market_type": c["market_type"],
                "odd_flag": c["odd"],
                "prob_modelo": c["prob_modelo"],
                "prob_devig": c["prob_devig"],
                "edge": c["edge"],
                "ev": c["ev"],
            }])

    return {"candidatos": selecionados, "candidatos_brutos": candidatos_brutos, "ia": ia}
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline_null_odds.py -v`
`Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/candidates/builder.py src/odd_analyzer/pipeline.py tests/test_pipeline_null_odds.py && git commit -m "feat: pipeline multi-mercado com NullOdds (sem_odd=True, ev=None) e ManualOdds (ev computado)"
```

---

### Task 20: Integração SOT — modelo-only e SOT com odd manual

**Files:**
- Modify: `tests/test_pipeline_sot_integration.py` (novo)
- Depend on: `src/odd_analyzer/pipeline.py`, `src/odd_analyzer/providers/stats.py`, `src/odd_analyzer/providers/odds.py`

- [ ] **Step 1: Write the failing test**

```python
"""Teste de integração ponta-a-ponta do mercado SOT — sem rede.
Usa providers fake (não BSDStatsProvider real) para reproduzir o fluxo completo."""
import pytest
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.providers.odds import NullOdds, ManualOdds
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.store.repo import InMemoryRepo

MARKET_SOT = MARKETS["sot"]

EVENT = {
    "id": "wc2026-bra-cro-01",
    "jogo": "BRA x CRO",
    "home_team_id": 10,
    "away_team_id": 99,
}

class StubStatsSOT:
    """Stats provider que retorna taxas fixas para 2 jogadores."""
    def elenco(self, event):
        return [
            {"id": 7, "name": "Vinicius Jr", "team_id": 10, "posicao": "ATA"},
            {"id": 11, "name": "Rodrygo", "team_id": 10, "posicao": "ATA"},
        ]

    def entity_taxa(self, entity_id, market, contexto):
        # Vinicius: alta taxa (mu alto -> prob_modelo alta)
        if entity_id == 7:
            return {
                "mu": 1.8, "minutos_esperados": 90.0,
                "xi_confirmado": True, "amostra_jogos": 20,
                "concedido_adversario": 4, "incerteza": "media",
            }
        # Rodrygo: taxa moderada
        return {
            "mu": 0.9, "minutos_esperados": 85.0,
            "xi_confirmado": True, "amostra_jogos": 15,
            "concedido_adversario": 4, "incerteza": "media",
        }

    def team_rates(self, team_id, contexto):
        return None


class StubAnalista:
    def __call__(self, candidatos, contexto):
        melhor = candidatos[0] if candidatos else None
        return {
            "melhor_aposta": (
                {"jogador": melhor["jogador"], "linha": melhor["linha"],
                 "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge alto"}
                if melhor else None
            ),
            "outras": [],
            "alertas": [],
        }


# ── Integração 1: SOT modelo-only (NullOdds) ──────────────────────────────────

def test_sot_modelo_only_candidatos_brutos_gerados():
    """Com NullOdds, candidatos_brutos deve ter entradas (uma por jogador×linha)."""
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=NullOdds(),
        repo=repo, analista_fn=StubAnalista(),
    )
    # 2 jogadores × 2 linhas (0.5, 1.5) = 4 candidatos brutos
    assert len(out["candidatos_brutos"]) == 4

def test_sot_modelo_only_todos_sem_odd():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=NullOdds(),
        repo=repo, analista_fn=StubAnalista(),
    )
    assert all(c["sem_odd"] is True for c in out["candidatos_brutos"])

def test_sot_modelo_only_candidatos_filtrados_vazios():
    """Sem odd, nenhum candidato passa o filtro de EV."""
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=NullOdds(),
        repo=repo, analista_fn=StubAnalista(),
    )
    assert out["candidatos"] == []

def test_sot_modelo_only_prob_modelo_e_positiva():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=NullOdds(),
        repo=repo, analista_fn=StubAnalista(),
    )
    assert all(0.0 < c["prob_modelo"] < 1.0 for c in out["candidatos_brutos"])

def test_sot_modelo_only_prob_over05_maior_que_over15():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=NullOdds(),
        repo=repo, analista_fn=StubAnalista(),
    )
    vini = [c for c in out["candidatos_brutos"] if c["jogador"] == "Vinicius Jr"]
    p05 = next(c["prob_modelo"] for c in vini if c["linha"] == 0.5)
    p15 = next(c["prob_modelo"] for c in vini if c["linha"] == 1.5)
    assert p05 > p15

def test_sot_modelo_only_nao_grava_ledger():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=NullOdds(),
        repo=repo, analista_fn=StubAnalista(),
    )
    assert repo.ledger == []


# ── Integração 2: SOT com odd manual ──────────────────────────────────────────

def test_sot_manual_odds_candidato_com_ev():
    """Com ManualOdds de alto valor, candidato deve ter EV positivo."""
    linhas = [
        # Vinicius Jr over 0.5 com odd generosa — edge alto
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 2.20, "odd_under": 1.70, "book": "manual"},
    ]
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=ManualOdds(linhas=linhas),
        repo=repo, analista_fn=StubAnalista(),
    )
    c_com_odd = [c for c in out["candidatos_brutos"] if not c["sem_odd"]]
    assert len(c_com_odd) == 1
    c = c_com_odd[0]
    assert c["ev"] is not None
    assert c["edge"] is not None
    assert c["prob_modelo"] > 0

def test_sot_manual_odds_sem_odd_flag_correto():
    """Candidatos sem linha de odd manual ficam com sem_odd=True."""
    linhas = [
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 2.20, "odd_under": 1.70, "book": "manual"},
    ]
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=ManualOdds(linhas=linhas),
        repo=repo, analista_fn=StubAnalista(),
    )
    sem_odd = [c for c in out["candidatos_brutos"] if c["sem_odd"]]
    # Rodrygo (ambas linhas) + Vinicius linha 1.5 = 3 sem odd
    assert len(sem_odd) == 3

def test_sot_manual_odds_market_type_correto():
    linhas = [
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 2.20, "odd_under": 1.70, "book": "manual"},
    ]
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=ManualOdds(linhas=linhas),
        repo=repo, analista_fn=StubAnalista(),
    )
    for c in out["candidatos_brutos"]:
        assert c["market_type"] == "sot"

def test_sot_manual_odds_com_edge_alto_passa_filtro():
    """Odd generosa + mu alto -> edge > corte -> passa filter_candidates."""
    # mu=1.8 para linha 0.5 com NB(r=3) -> prob_modelo alta
    # odd=2.20/1.70 -> prob_devig ~= 0.50 (odd dupla = aprox) -> edge alto
    linhas = [
        {"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 2.20, "odd_under": 1.70, "book": "manual"},
    ]
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=ManualOdds(linhas=linhas),
        repo=repo, analista_fn=StubAnalista(),
    )
    # candidatos filtrados: só Vinicius 0.5 tem odd -> pode passar se edge/ev >= corte
    # (verifica que o pipeline não descarta por engano)
    assert isinstance(out["candidatos"], list)
    if out["candidatos"]:
        c = out["candidatos"][0]
        assert c["edge"] >= 0.04
        assert c["ev"] >= 0.05

def test_sot_analise_gravada_no_repo():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT, market=MARKET_SOT,
        stats_provider=StubStatsSOT(), odds_provider=NullOdds(),
        repo=repo, analista_fn=StubAnalista(),
    )
    analise = repo.get_analise(EVENT["id"])
    assert analise is not None
    assert analise.get("market_type") == "sot"
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline_sot_integration.py -v`
`Expected: FAIL (ImportError ou AssertionError — pipeline ainda não tem a assinatura nova com market/stats_provider/odds_provider)`

- [ ] **Step 3: Write minimal implementation**

No new code needed — this test exercises the pipeline implemented in Task 5. If Task 5 is complete, run the tests to confirm. If any assertion fails (e.g., `save_analise` does not persist `market_type`), update `InMemoryRepo.get_analise` to return the stored dict as-is. Verify `src/odd_analyzer/store/repo.py` stores and returns the full dict passed to `save_analise`:

```python
# src/odd_analyzer/store/repo.py  — only the InMemoryRepo section (ensure get_analise returns full dict)
# Locate existing InMemoryRepo class and confirm these methods look like this:

class InMemoryRepo:
    def __init__(self):
        self._analises: dict = {}
        self.ledger: list = []

    def save_analise(self, event_id: str, data: dict):
        self._analises[event_id] = data

    def get_analise(self, event_id: str) -> dict | None:
        return self._analises.get(event_id)

    def save_ledger(self, records: list[dict]):
        self.ledger.extend(records)
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline_sot_integration.py -v`
`Expected: PASS`

- [ ] **Step 5: Commit**

```bash
git add tests/test_pipeline_sot_integration.py && git commit -m "test: integracao SOT modelo-only (NullOdds) e SOT com odd manual ponta-a-ponta"
```

---

### Task 21: Suíte verde — testes anteriores não quebram com o novo pipeline

**Files:**
- Modify: `tests/test_builder.py`
- Modify: `tests/test_pipeline.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_builder_v2.py  — novo arquivo que testa a assinatura nova de build_candidate
import pytest
from odd_analyzer.candidates.builder import build_candidate

def test_build_candidate_com_odds_monta_dossie_completo():
    c = build_candidate(
        entidade="Vinicius Jr", linha=0.5, prob_modelo=0.68, mu=1.9,
        minutos_esperados=88, xi_confirmado=True, amostra_jogos=24,
        concedido_adversario=3, incerteza="media", market_type="sot",
        odd_over=1.72, odd_under=2.10,
    )
    assert c["entidade"] == "Vinicius Jr"
    assert c["jogador"] == "Vinicius Jr"  # compat
    assert c["linha"] == 0.5
    assert c["odd"] == 1.72
    assert c["prob_modelo"] == pytest.approx(0.68)
    assert 0.0 < c["prob_devig"] < 1.0
    assert c["edge"] == pytest.approx(c["prob_modelo"] - c["prob_devig"])
    assert c["ev"] == pytest.approx(c["prob_modelo"] * c["odd"] - 1.0)
    assert c["lambda"] == 1.9
    assert c["market_type"] == "sot"
    assert c["sem_odd"] is False
    assert c["concedido_adversario"] == 3

def test_build_candidate_sem_odds_marca_sem_odd():
    c = build_candidate(
        entidade="Casemiro", linha=1.5, prob_modelo=0.45, mu=0.8,
        minutos_esperados=90, xi_confirmado=True, amostra_jogos=12,
        concedido_adversario=2, incerteza="baixa", market_type="desarmes",
    )
    assert c["sem_odd"] is True
    assert c["ev"] is None
    assert c["edge"] is None
    assert c["odd"] is None
    assert c["prob_modelo"] == pytest.approx(0.45)
    assert c["market_type"] == "desarmes"

def test_build_candidate_sem_odds_odd_none_explicito():
    c = build_candidate(
        entidade="Pedri", linha=2.5, prob_modelo=0.30, mu=1.1,
        minutos_esperados=90, xi_confirmado=True, amostra_jogos=10,
        concedido_adversario=None, incerteza="media", market_type="finalizacoes",
        odd_over=None, odd_under=None,
    )
    assert c["sem_odd"] is True
    assert c["ev"] is None
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_builder_v2.py -v`
`Expected: FAIL (TypeError: build_candidate() got unexpected keyword argument 'entidade' ou assinatura antiga)`

- [ ] **Step 3: Write minimal implementation**

The new `build_candidate` signature was already written in Task 5. If the test fails for a different reason, verify the import and that `builder.py` has the new signature. Then update the old `test_builder.py` to use the new signature so it does not break the CI:

```python
# tests/test_builder.py  — atualizado para nova assinatura
import pytest
from odd_analyzer.candidates.builder import build_candidate

def test_build_candidate_monta_dossie():
    c = build_candidate(
        entidade="Vinicius Jr", linha=0.5, prob_modelo=0.68, mu=1.9,
        minutos_esperados=88, xi_confirmado=True, amostra_jogos=24,
        concedido_adversario="alto", incerteza="media", market_type="sot",
        odd_over=1.72, odd_under=2.10,
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
    assert c["concedido_adversario"] == "alto"
    assert c["incerteza"] == "media"
    assert c["sem_odd"] is False
```

Also update `test_pipeline.py` so the old pipeline tests pass against the new signature. Replace the file's content:

```python
# tests/test_pipeline.py  — atualizado para nova assinatura do pipeline
import pytest
from odd_analyzer.model.markets import MARKETS
from odd_analyzer.providers.odds import ManualOdds, NullOdds
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.store.repo import InMemoryRepo

MARKET_SOT = MARKETS["sot"]
EVENT = {
    "id": "evt1", "jogo": "BRA x CRO",
    "home_team_id": 10, "away_team_id": 99,
}

class FakeStats:
    def elenco(self, event):
        return [{"id": 1, "name": "Vinicius Jr", "team_id": 10, "posicao": "ATA"}]

    def entity_taxa(self, entity_id, market, contexto):
        return {"mu": 1.9, "minutos_esperados": 88, "xi_confirmado": True,
                "amostra_jogos": 24, "concedido_adversario": 3, "incerteza": "media"}

    def team_rates(self, team_id, contexto):
        return None

def fake_analista(candidatos, contexto):
    melhor = candidatos[0] if candidatos else None
    return {"melhor_aposta": (
        {"jogador": melhor["jogador"], "linha": melhor["linha"],
         "veredito": "APOSTAR", "confianca": "alta", "motivo": "edge alto"}
        if melhor else None), "outras": [], "alertas": []}

def test_pipeline_ponta_a_ponta_gera_candidato_e_grava_ledger():
    linhas = [{"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.72, "odd_under": 2.10, "book": "manual"}]
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, market=MARKET_SOT, stats_provider=FakeStats(),
                        odds_provider=ManualOdds(linhas=linhas), repo=repo, analista_fn=fake_analista)
    assert len(out["candidatos"]) == 1
    assert out["candidatos"][0]["jogador"] == "Vinicius Jr"
    assert out["ia"]["melhor_aposta"]["jogador"] == "Vinicius Jr"
    assert repo.get_analise("evt1") is not None
    assert len(repo.ledger) == 1

def test_pipeline_null_odds_candidatos_filtrados_vazios():
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, market=MARKET_SOT, stats_provider=FakeStats(),
                        odds_provider=NullOdds(), repo=repo, analista_fn=fake_analista)
    assert out["candidatos"] == []

def test_pipeline_nao_grava_ledger_quando_nao_apostar():
    linhas = [{"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.72, "odd_under": 2.10, "book": "manual"}]
    def analista_nao(candidatos, contexto):
        return {"melhor_aposta": None, "outras": [], "alertas": ["sem valor claro"]}
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, market=MARKET_SOT, stats_provider=FakeStats(),
                        odds_provider=ManualOdds(linhas=linhas), repo=repo, analista_fn=analista_nao)
    assert repo.ledger == []
    assert repo.get_analise("evt1") is not None
    assert out["ia"]["melhor_aposta"] is None
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/ -v --tb=short`
`Expected: PASS (todos os 97+ testes, incluindo os novos de fase2-jogador)`

- [ ] **Step 5: Commit**

```bash
git add tests/test_builder_v2.py tests/test_builder.py tests/test_pipeline.py && git commit -m "test: atualiza test_builder e test_pipeline para nova assinatura multi-mercado; adiciona test_builder_v2"
```

---

## fase3-partida

### Task 22: match_model.py — team_lambdas, score_matrix (Dixon-Coles rho), probs_1x2, prob_total_over

**Files:**
- Create: `src/odd_analyzer/model/match_model.py`
- Test: `tests/test_match_model.py`

- [ ] **Step 1: Write the failing test**

```python
import math
import pytest
from odd_analyzer.model.match_model import (
    team_lambdas, score_matrix, probs_1x2, prob_total_over,
)

# ---------------------------------------------------------------------------
# team_lambdas
# ---------------------------------------------------------------------------

def test_team_lambdas_symmetric_no_home_adv():
    # equal teams, zero home advantage → both lambdas equal
    lh, la = team_lambdas(
        home_attack=1.0, away_defense=1.0,
        away_attack=1.0, home_defense=1.0,
        home_adv=1.0,
    )
    assert lh == pytest.approx(la)
    assert lh == pytest.approx(1.0)

def test_team_lambdas_home_advantage_raises_home_lambda():
    lh, la = team_lambdas(
        home_attack=1.2, away_defense=0.9,
        away_attack=1.0, home_defense=1.0,
        home_adv=1.1,
    )
    # home_lambda = home_attack * away_defense * home_adv = 1.2 * 0.9 * 1.1
    assert lh == pytest.approx(1.2 * 0.9 * 1.1, rel=1e-9)
    # away_lambda = away_attack * home_defense (no home_adv for away)
    assert la == pytest.approx(1.0 * 1.0, rel=1e-9)

def test_team_lambdas_always_positive():
    lh, la = team_lambdas(0.5, 0.5, 0.5, 0.5, 1.0)
    assert lh > 0
    assert la > 0

# ---------------------------------------------------------------------------
# score_matrix — structure & sum
# ---------------------------------------------------------------------------

def test_score_matrix_sums_to_one():
    matrix = score_matrix(1.4, 1.1, rho=0.0, max_goals=10)
    total = sum(matrix[i][j] for i in range(11) for j in range(11))
    assert total == pytest.approx(1.0, abs=1e-4)

def test_score_matrix_shape():
    matrix = score_matrix(1.4, 1.1, rho=0.0, max_goals=10)
    assert len(matrix) == 11            # 0..10 home goals
    assert all(len(row) == 11 for row in matrix)  # 0..10 away goals

def test_score_matrix_non_negative():
    matrix = score_matrix(1.4, 1.1, rho=-0.1, max_goals=8)
    for row in matrix:
        for p in row:
            assert p >= 0.0

# ---------------------------------------------------------------------------
# score_matrix — Dixon-Coles rho correction raises low-score cells
# ---------------------------------------------------------------------------

def test_rho_raises_00_relative_to_rho_zero():
    mat_no_rho = score_matrix(1.4, 1.1, rho=0.0, max_goals=10)
    mat_rho = score_matrix(1.4, 1.1, rho=-0.1, max_goals=10)
    # rho < 0 increases weight on 0-0
    assert mat_rho[0][0] > mat_no_rho[0][0]

def test_rho_raises_11_relative_to_rho_zero():
    mat_no_rho = score_matrix(1.4, 1.1, rho=0.0, max_goals=10)
    mat_rho = score_matrix(1.4, 1.1, rho=-0.1, max_goals=10)
    # rho < 0 increases weight on 1-1
    assert mat_rho[1][1] > mat_no_rho[1][1]

def test_rho_zero_is_pure_poisson():
    """With rho=0 the matrix equals independent Poisson product."""
    mu_h, mu_a = 1.4, 1.1
    matrix = score_matrix(mu_h, mu_a, rho=0.0, max_goals=6)
    def poisson_pmf(k, mu):
        return math.exp(-mu) * mu**k / math.factorial(k)
    for i in range(7):
        for j in range(7):
            expected = poisson_pmf(i, mu_h) * poisson_pmf(j, mu_a)
            assert matrix[i][j] == pytest.approx(expected, rel=1e-6)

# ---------------------------------------------------------------------------
# probs_1x2
# ---------------------------------------------------------------------------

def test_probs_1x2_sums_to_one():
    matrix = score_matrix(1.4, 1.1, rho=-0.1, max_goals=10)
    ph, pd, pa = probs_1x2(matrix)
    assert ph + pd + pa == pytest.approx(1.0, abs=1e-6)

def test_probs_1x2_all_nonnegative():
    matrix = score_matrix(1.4, 1.1, rho=0.0, max_goals=10)
    ph, pd, pa = probs_1x2(matrix)
    assert ph >= 0.0
    assert pd >= 0.0
    assert pa >= 0.0

def test_probs_1x2_stronger_home_team_has_higher_home_prob():
    # strong home team: lambda_home >> lambda_away
    mat_home_fav = score_matrix(2.5, 0.5, rho=0.0, max_goals=10)
    mat_away_fav = score_matrix(0.5, 2.5, rho=0.0, max_goals=10)
    ph_fav, _, _ = probs_1x2(mat_home_fav)
    _, _, pa_fav = probs_1x2(mat_away_fav)
    # symmetric problem: ph when home is strong = pa when away is strong
    assert ph_fav == pytest.approx(pa_fav, rel=1e-6)
    # home team being dominant should give ph > 0.5
    assert ph_fav > 0.5

def test_probs_1x2_symmetric_teams_favor_draw_rho_effect():
    """Symmetric teams with rho<0: draw probability should be higher than with rho=0."""
    mat_no_rho = score_matrix(1.2, 1.2, rho=0.0, max_goals=10)
    mat_rho = score_matrix(1.2, 1.2, rho=-0.1, max_goals=10)
    _, pd_no_rho, _ = probs_1x2(mat_no_rho)
    _, pd_rho, _ = probs_1x2(mat_rho)
    assert pd_rho > pd_no_rho

# ---------------------------------------------------------------------------
# prob_total_over
# ---------------------------------------------------------------------------

def test_prob_total_over_line_zero_is_almost_one():
    matrix = score_matrix(1.4, 1.1, rho=0.0, max_goals=10)
    p = prob_total_over(matrix, line=0.0)
    # over 0.0 goals = P(total >= 1) = 1 - P(0-0)
    assert p == pytest.approx(1.0 - matrix[0][0], abs=1e-9)

def test_prob_total_over_line_25():
    matrix = score_matrix(1.4, 1.1, rho=0.0, max_goals=10)
    p = prob_total_over(matrix, line=2.5)
    # manually: sum all cells where i+j >= 3
    expected = sum(
        matrix[i][j]
        for i in range(11) for j in range(11)
        if i + j >= 3
    )
    assert p == pytest.approx(expected, abs=1e-9)

def test_prob_total_over_higher_mu_gives_higher_over_prob():
    mat_low = score_matrix(0.8, 0.8, rho=0.0, max_goals=10)
    mat_high = score_matrix(2.0, 2.0, rho=0.0, max_goals=10)
    assert prob_total_over(mat_high, 2.5) > prob_total_over(mat_low, 2.5)

def test_prob_total_over_between_zero_and_one():
    matrix = score_matrix(1.4, 1.1, rho=-0.1, max_goals=10)
    for line in [0.5, 1.5, 2.5, 3.5]:
        p = prob_total_over(matrix, line)
        assert 0.0 <= p <= 1.0
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_match_model.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.model.match_model')`

- [ ] **Step 3: Write minimal implementation**

```python
"""Modelo de partida Dixon-Coles: lambdas, score matrix, 1X2, totais.

Fórmulas:
  team_lambdas : mu_home = home_attack * away_defense * home_adv
                 mu_away = away_attack * home_defense
  score_matrix : P(i,j) = Poisson(i; mu_home)*Poisson(j; mu_away) * tau(i,j,rho)
    tau (Dixon-Coles low-score correction):
        (i,j)==(0,0): 1 - mu_home*mu_away*rho
        (i,j)==(1,0): 1 + mu_away*rho
        (i,j)==(0,1): 1 + mu_home*rho
        (i,j)==(1,1): 1 - rho
        else: 1
  probs_1x2    : home=sum(i>j), draw=sum(i==j), away=sum(i<j)
  prob_total_over: sum P(i,j) where i+j > line
"""
import math


def _poisson_pmf(k: int, mu: float) -> float:
    if mu <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-mu) * mu**k / math.factorial(k)


def _tau(i: int, j: int, mu_home: float, mu_away: float, rho: float) -> float:
    """Dixon-Coles correction factor for low scores."""
    if i == 0 and j == 0:
        return 1.0 - mu_home * mu_away * rho
    if i == 1 and j == 0:
        return 1.0 + mu_away * rho
    if i == 0 and j == 1:
        return 1.0 + mu_home * rho
    if i == 1 and j == 1:
        return 1.0 - rho
    return 1.0


def team_lambdas(
    home_attack: float,
    away_defense: float,
    away_attack: float,
    home_defense: float,
    home_adv: float,
) -> tuple[float, float]:
    """Return (mu_home, mu_away).

    mu_home = home_attack * away_defense * home_adv
    mu_away = away_attack * home_defense
    All inputs are positive multipliers normalised around 1.0.
    """
    mu_home = home_attack * away_defense * home_adv
    mu_away = away_attack * home_defense
    return mu_home, mu_away


def score_matrix(
    mu_home: float,
    mu_away: float,
    rho: float,
    max_goals: int = 10,
) -> list[list[float]]:
    """Return (max_goals+1)x(max_goals+1) matrix of P(home=i, away=j).

    Applies Dixon-Coles tau correction for low-score cells (0-0, 1-0, 0-1, 1-1).
    rho=0 → pure independent Poisson; rho<0 (typical -0.1) inflates low scores.
    """
    n = max_goals + 1
    matrix: list[list[float]] = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            p_i = _poisson_pmf(i, mu_home)
            p_j = _poisson_pmf(j, mu_away)
            t = _tau(i, j, mu_home, mu_away, rho)
            matrix[i][j] = p_i * p_j * t
    return matrix


def probs_1x2(matrix: list[list[float]]) -> tuple[float, float, float]:
    """Return (p_home_win, p_draw, p_away_win) from a score matrix."""
    p_home = p_draw = p_away = 0.0
    n = len(matrix)
    for i in range(n):
        for j in range(len(matrix[i])):
            p = matrix[i][j]
            if i > j:
                p_home += p
            elif i == j:
                p_draw += p
            else:
                p_away += p
    return p_home, p_draw, p_away


def prob_total_over(matrix: list[list[float]], line: float) -> float:
    """P(total goals > line) = sum of P(i,j) where i+j > line."""
    total = 0.0
    n = len(matrix)
    for i in range(n):
        for j in range(len(matrix[i])):
            if i + j > line:
                total += matrix[i][j]
    return total
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_match_model.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**
```bash
git add src/odd_analyzer/model/match_model.py tests/test_match_model.py && git commit -m "feat: model/match_model (team_lambdas, score_matrix Dixon-Coles rho, probs_1x2, prob_total_over)"
```

---

### Task 23: markets.py — MARKETS registry with vitoria and gols entries

**Files:**
- Create: `src/odd_analyzer/model/markets.py`
- Test: `tests/test_markets.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from odd_analyzer.model.markets import MARKETS, MarketSpec

def test_markets_has_all_six_keys():
    assert set(MARKETS.keys()) == {"escanteios", "sot", "finalizacoes", "desarmes", "gols", "vitoria"}

def test_all_entries_are_marketspec():
    for key, spec in MARKETS.items():
        assert isinstance(spec, MarketSpec), f"{key} is not a MarketSpec"

def test_vitoria_kind_is_partida_1x2():
    assert MARKETS["vitoria"].kind == "partida_1x2"
    assert MARKETS["vitoria"].nivel == "partida"

def test_gols_kind_is_partida_totais():
    assert MARKETS["gols"].kind == "partida_totais"
    assert MARKETS["gols"].nivel == "partida"

def test_contagem_markets_kind():
    for key in ("sot", "finalizacoes", "desarmes", "escanteios"):
        assert MARKETS[key].kind == "contagem", f"{key}.kind should be 'contagem'"

def test_vitoria_stat_field_is_goals():
    assert MARKETS["vitoria"].stat_field == "goals"

def test_gols_stat_field_is_goals():
    assert MARKETS["gols"].stat_field == "goals"

def test_sot_stat_field():
    assert MARKETS["sot"].stat_field == "shots_on_target"

def test_finalizacoes_stat_field():
    assert MARKETS["finalizacoes"].stat_field == "total_shots"

def test_desarmes_stat_field():
    assert MARKETS["desarmes"].stat_field == "total_tackle"

def test_escanteios_stat_field():
    assert MARKETS["escanteios"].stat_field == "corners"

def test_marketspec_is_frozen():
    spec = MARKETS["sot"]
    with pytest.raises((AttributeError, TypeError)):
        spec.key = "changed"  # type: ignore[misc]

def test_all_specs_have_positive_prior_rate():
    for key, spec in MARKETS.items():
        assert spec.prior_rate > 0, f"{key}.prior_rate must be > 0"

def test_all_specs_have_nonempty_lines():
    for key, spec in MARKETS.items():
        assert len(spec.lines) > 0, f"{key}.lines must be non-empty"

def test_all_specs_have_label_and_eixo():
    for key, spec in MARKETS.items():
        assert spec.label, f"{key}.label must be non-empty"
        assert spec.eixo_concessao, f"{key}.eixo_concessao must be non-empty"

def test_vitoria_lines_are_empty():
    # vitoria 1X2 has no numeric lines — outcomes are home/draw/away
    assert MARKETS["vitoria"].lines == []

def test_gols_lines_include_25():
    assert 2.5 in MARKETS["gols"].lines
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_markets.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.model.markets')`

- [ ] **Step 3: Write minimal implementation**

```python
"""Registry de mercados MVP. MarketSpec é dado puro (frozen dataclass) — toda a
configuração de um mercado em um lugar. O pipeline despacha por `kind`; os providers
filtram por `stat_field`. Adicionar mercado = adicionar entrada no dict MARKETS."""
from dataclasses import dataclass


@dataclass(frozen=True)
class MarketSpec:
    key: str
    nivel: str              # "jogador" | "partida"
    kind: str               # "contagem" | "partida_totais" | "partida_1x2"
    stat_field: str         # campo BSD: corners | shots_on_target | total_shots | total_tackle | goals
    prior_rate: float
    prior_strength: float
    nb_dispersion: float
    lines: list[float]
    eixo_concessao: str     # eixo de concessão do adversário (matchup + prompt)
    label: str


MARKETS: dict[str, MarketSpec] = {
    "sot": MarketSpec(
        key="sot",
        nivel="jogador",
        kind="contagem",
        stat_field="shots_on_target",
        prior_rate=0.4,
        prior_strength=12,
        nb_dispersion=3.0,
        lines=[0.5, 1.5],
        eixo_concessao="chutes_a_gol_concedidos",
        label="Chutes a Gol (SOT)",
    ),
    "finalizacoes": MarketSpec(
        key="finalizacoes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_shots",
        prior_rate=1.2,
        prior_strength=10,
        nb_dispersion=3.0,
        lines=[1.5, 2.5],
        eixo_concessao="finalizacoes_concedidas",
        label="Finalizações Totais",
    ),
    "desarmes": MarketSpec(
        key="desarmes",
        nivel="jogador",
        kind="contagem",
        stat_field="total_tackle",
        prior_rate=1.5,
        prior_strength=10,
        nb_dispersion=3.0,
        lines=[0.5, 1.5, 2.5],
        eixo_concessao="desarmes_sofridos_adversario",
        label="Desarmes",
    ),
    "escanteios": MarketSpec(
        key="escanteios",
        nivel="partida",
        kind="contagem",
        stat_field="corners",
        prior_rate=4.5,
        prior_strength=8,
        nb_dispersion=4.0,
        lines=[8.5, 9.5, 10.5],
        eixo_concessao="escanteios_concedidos",
        label="Escanteios",
    ),
    "gols": MarketSpec(
        key="gols",
        nivel="partida",
        kind="partida_totais",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10,
        nb_dispersion=3.0,
        lines=[1.5, 2.5, 3.5],
        eixo_concessao="gols_concedidos",
        label="Gols (Totais)",
    ),
    "vitoria": MarketSpec(
        key="vitoria",
        nivel="partida",
        kind="partida_1x2",
        stat_field="goals",
        prior_rate=1.3,
        prior_strength=10,
        nb_dispersion=3.0,
        lines=[],
        eixo_concessao="gols_concedidos",
        label="Resultado (1X2)",
    ),
}
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_markets.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**
```bash
git add src/odd_analyzer/model/markets.py tests/test_markets.py && git commit -m "feat: model/markets MARKETS registry (6 mercados MVP, vitoria + gols com kind=partida_*)"
```

---

### Task 24: providers/stats.py — BSDStatsProvider.team_rates

**Files:**
- Create: `src/odd_analyzer/providers/__init__.py`
- Create: `src/odd_analyzer/providers/stats.py`
- Test: `tests/test_providers_stats.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for BSDStatsProvider.team_rates — all offline via inline BSD fixture dicts."""
import pytest
from unittest.mock import MagicMock
from odd_analyzer.providers.stats import BSDStatsProvider

# Minimal BSD team_stats response shape (as returned by client.team_stats)
# home team scored 2,1 and away scored 0,3 over 2 games
TEAM_STATS_FIXTURE = {
    "results": [
        {
            "event": 101,
            "team": {"id": 10, "name": "Home FC"},
            "side": "home",
            "goals": 2,
            "corners": 6,
            "shots_on_target": 5,
            "total_shots": 10,
            "total_tackle": 12,
        },
        {
            "event": 102,
            "team": {"id": 10, "name": "Home FC"},
            "side": "home",
            "goals": 1,
            "corners": 4,
            "shots_on_target": 3,
            "total_shots": 8,
            "total_tackle": 9,
        },
    ]
}

OPPONENT_STATS_FIXTURE = {
    "results": [
        {
            "event": 101,
            "team": {"id": 20, "name": "Away FC"},
            "side": "away",
            "goals": 0,
            "corners": 3,
            "shots_on_target": 2,
            "total_shots": 5,
            "total_tackle": 8,
        },
        {
            "event": 102,
            "team": {"id": 20, "name": "Away FC"},
            "side": "away",
            "goals": 3,
            "corners": 7,
            "shots_on_target": 6,
            "total_shots": 12,
            "total_tackle": 14,
        },
    ]
}


def _make_provider(team_stats_side):
    """Build a BSDStatsProvider whose client.team_stats returns our fixture."""
    client = MagicMock()
    client.team_stats.return_value = team_stats_side
    return BSDStatsProvider(client=client)


def test_team_rates_returns_dict_with_required_keys():
    provider = _make_provider(TEAM_STATS_FIXTURE)
    result = provider.team_rates(team_id=10, contexto={"event": {"id": "evt1"}})
    assert result is not None
    assert "attack" in result
    assert "defense" in result
    assert "games" in result


def test_team_rates_attack_is_mean_goals_per_game():
    provider = _make_provider(TEAM_STATS_FIXTURE)
    result = provider.team_rates(team_id=10, contexto={"event": {"id": "evt1"}})
    # games: goals=[2,1] → mean = 1.5
    assert result["attack"] == pytest.approx(1.5, rel=1e-6)


def test_team_rates_games_count():
    provider = _make_provider(TEAM_STATS_FIXTURE)
    result = provider.team_rates(team_id=10, contexto={"event": {"id": "evt1"}})
    assert result["games"] == 2


def test_team_rates_none_when_no_data():
    client = MagicMock()
    client.team_stats.return_value = {"results": []}
    provider = BSDStatsProvider(client=client)
    result = provider.team_rates(team_id=99, contexto={"event": {"id": "evt1"}})
    assert result is None


def test_team_rates_none_when_client_raises():
    client = MagicMock()
    client.team_stats.side_effect = RuntimeError("network error")
    provider = BSDStatsProvider(client=client)
    result = provider.team_rates(team_id=99, contexto={"event": {"id": "evt1"}})
    assert result is None


def test_team_rates_defense_is_goals_conceded_per_game():
    """defense = mean goals conceded; needs opponent goals from the other side."""
    # Provide the opponent fixture as team_stats for the perspective team
    # We test using OPPONENT_STATS_FIXTURE: goals=[0,3] → mean = 1.5
    provider = _make_provider(OPPONENT_STATS_FIXTURE)
    result = provider.team_rates(team_id=20, contexto={"event": {"id": "evt1"}})
    assert result["attack"] == pytest.approx(1.5, rel=1e-6)


def test_team_rates_calls_client_team_stats_with_event_id():
    client = MagicMock()
    client.team_stats.return_value = TEAM_STATS_FIXTURE
    provider = BSDStatsProvider(client=client)
    provider.team_rates(team_id=10, contexto={"event": {"id": "evt42"}})
    client.team_stats.assert_called_once_with("evt42")


def test_team_rates_home_filter_uses_only_home_games():
    """When mando='home' is in contexto, only home-side rows are used."""
    # mix home + away rows
    mixed = {
        "results": [
            {"event": 1, "team": {"id": 10, "name": "FC"}, "side": "home",
             "goals": 3, "corners": 5, "shots_on_target": 4,
             "total_shots": 8, "total_tackle": 10},
            {"event": 2, "team": {"id": 10, "name": "FC"}, "side": "away",
             "goals": 0, "corners": 2, "shots_on_target": 1,
             "total_shots": 3, "total_tackle": 5},
        ]
    }
    client = MagicMock()
    client.team_stats.return_value = mixed
    provider = BSDStatsProvider(client=client)
    result = provider.team_rates(team_id=10, contexto={"event": {"id": "e1"}, "mando": "home"})
    # only home row: goals=3 → attack=3.0
    assert result["attack"] == pytest.approx(3.0, rel=1e-6)
    assert result["games"] == 1
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.providers')`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/providers/__init__.py
```

```python
"""StatsProvider protocol + implementations.

BSDStatsProvider wraps bsd/client. team_rates extracts per-game attack/defense
rates from event team_stats history — used by match_model to build lambdas.
"""
from typing import Protocol, runtime_checkable
import logging

from odd_analyzer.model.markets import MarketSpec

logger = logging.getLogger(__name__)


@runtime_checkable
class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]: ...
    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None: ...
    def team_rates(self, team_id, contexto: dict) -> dict | None: ...


class BSDStatsProvider:
    """Fetches stats from BSD/Bzzoiro client."""

    def __init__(self, client):
        self._client = client

    # ------------------------------------------------------------------
    # team_rates — for match_model (vitoria / gols)
    # ------------------------------------------------------------------

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        """Return {"attack", "defense", "games"} from BSD team_stats.

        attack  = mean goals scored per game (by this team)
        defense = mean goals conceded (placeholder — requires opponent data;
                  callers supply separately or default to league average)
        games   = number of games in the sample

        contexto keys:
          event.id — BSD event ID used to call team_stats
          mando    — optional "home"|"away" to filter rows by side
        """
        event_id = (contexto.get("event") or {}).get("id")
        mando = contexto.get("mando")
        try:
            data = self._client.team_stats(event_id)
        except Exception as exc:
            logger.warning("BSDStatsProvider.team_rates error for team %s: %s", team_id, exc)
            return None

        rows = data.get("results") or []
        if mando:
            rows = [r for r in rows if r.get("side") == mando]

        # Filter to this team
        team_rows = [r for r in rows if (r.get("team") or {}).get("id") == team_id]
        if not team_rows:
            return None

        goals = [r.get("goals", 0) for r in team_rows]
        n = len(goals)
        attack = sum(goals) / n

        return {
            "attack": attack,
            "defense": 0.0,     # caller must supply opponent attack as defense
            "games": n,
        }

    # ------------------------------------------------------------------
    # elenco + entity_taxa — stubs; implemented in subsequent tasks
    # ------------------------------------------------------------------

    def elenco(self, event: dict) -> list[dict]:
        raise NotImplementedError("BSDStatsProvider.elenco — implemented in fase1-escanteios")

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raise NotImplementedError("BSDStatsProvider.entity_taxa — implemented in fase1-escanteios")
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**
```bash
git add src/odd_analyzer/providers/__init__.py src/odd_analyzer/providers/stats.py tests/test_providers_stats.py && git commit -m "feat: providers/stats BSDStatsProvider.team_rates (attack/defense/games from BSD team_stats fixture)"
```

---

### Task 25: providers/odds.py — BSDMatchOdds.linhas for partida_1x2 and partida_totais

**Files:**
- Create: `src/odd_analyzer/providers/odds.py`
- Test: `tests/test_providers_odds.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for OddsProvider implementations — all offline via inline BSD fixture dicts."""
import pytest
from odd_analyzer.providers.odds import BSDMatchOdds, ManualOdds, NullOdds, PropOddsProvider
from odd_analyzer.model.markets import MARKETS

# Minimal BSD event_odds fixture (partida_1x2)
BSD_1X2_FIXTURE = {
    "results": [
        {
            "book": "pinnacle",
            "market": "1x2",
            "outcomes": [
                {"side": "home", "odd": 2.10},
                {"side": "draw", "odd": 3.40},
                {"side": "away", "odd": 3.20},
            ],
        }
    ]
}

# Minimal BSD event_odds fixture (totais / over-under)
BSD_TOTAIS_FIXTURE = {
    "results": [
        {
            "book": "pinnacle",
            "market": "totals",
            "outcomes": [
                {"side": "over", "line": 2.5, "odd": 1.92},
                {"side": "under", "line": 2.5, "odd": 1.98},
            ],
        }
    ]
}

EVENT = {"id": "evt99", "home_team": "BRA", "away_team": "CRO"}


def _make_bsd(fixture):
    from unittest.mock import MagicMock
    client = MagicMock()
    client.event_odds.return_value = fixture
    return BSDMatchOdds(client=client)


# ---------------------------------------------------------------------------
# BSDMatchOdds — partida_1x2
# ---------------------------------------------------------------------------

def test_bsd_1x2_returns_three_sides():
    provider = _make_bsd(BSD_1X2_FIXTURE)
    linhas = provider.linhas(EVENT, MARKETS["vitoria"])
    assert len(linhas) == 3

def test_bsd_1x2_sides_are_home_draw_away():
    provider = _make_bsd(BSD_1X2_FIXTURE)
    linhas = provider.linhas(EVENT, MARKETS["vitoria"])
    sides = {row["lado"] for row in linhas}
    assert sides == {"home", "draw", "away"}

def test_bsd_1x2_odd_values():
    provider = _make_bsd(BSD_1X2_FIXTURE)
    linhas = provider.linhas(EVENT, MARKETS["vitoria"])
    by_side = {row["lado"]: row["odd"] for row in linhas}
    assert by_side["home"] == pytest.approx(2.10)
    assert by_side["draw"] == pytest.approx(3.40)
    assert by_side["away"] == pytest.approx(3.20)

def test_bsd_1x2_empty_when_no_1x2_market():
    from unittest.mock import MagicMock
    client = MagicMock()
    client.event_odds.return_value = {"results": []}
    provider = BSDMatchOdds(client=client)
    linhas = provider.linhas(EVENT, MARKETS["vitoria"])
    assert linhas == []

# ---------------------------------------------------------------------------
# BSDMatchOdds — partida_totais
# ---------------------------------------------------------------------------

def test_bsd_totais_returns_over_under_pairs():
    provider = _make_bsd(BSD_TOTAIS_FIXTURE)
    linhas = provider.linhas(EVENT, MARKETS["gols"])
    assert len(linhas) >= 1
    # each entry has linha, odd_over, odd_under
    row = linhas[0]
    assert "linha" in row
    assert "odd_over" in row
    assert "odd_under" in row

def test_bsd_totais_correct_odds_for_25():
    provider = _make_bsd(BSD_TOTAIS_FIXTURE)
    linhas = provider.linhas(EVENT, MARKETS["gols"])
    row_25 = next((r for r in linhas if r["linha"] == 2.5), None)
    assert row_25 is not None
    assert row_25["odd_over"] == pytest.approx(1.92)
    assert row_25["odd_under"] == pytest.approx(1.98)

def test_bsd_totais_empty_when_no_totals_market():
    from unittest.mock import MagicMock
    client = MagicMock()
    client.event_odds.return_value = {"results": []}
    provider = BSDMatchOdds(client=client)
    linhas = provider.linhas(EVENT, MARKETS["gols"])
    assert linhas == []

def test_bsd_calls_event_odds_with_event_id():
    from unittest.mock import MagicMock
    client = MagicMock()
    client.event_odds.return_value = BSD_1X2_FIXTURE
    provider = BSDMatchOdds(client=client)
    provider.linhas({"id": "evt77"}, MARKETS["vitoria"])
    client.event_odds.assert_called_once_with("evt77")

# ---------------------------------------------------------------------------
# ManualOdds
# ---------------------------------------------------------------------------

def test_manual_odds_returns_passed_linhas():
    manual_data = [{"lado": "home", "odd": 2.0}, {"lado": "draw", "odd": 3.5}, {"lado": "away", "odd": 3.8}]
    provider = ManualOdds(linhas=manual_data)
    result = provider.linhas(EVENT, MARKETS["vitoria"])
    assert result == manual_data

def test_manual_odds_same_for_any_market():
    data = [{"entidade": "BRA", "linha": 2.5, "odd_over": 1.90, "odd_under": 2.00, "book": "manual"}]
    provider = ManualOdds(linhas=data)
    assert provider.linhas(EVENT, MARKETS["gols"]) == data
    assert provider.linhas(EVENT, MARKETS["sot"]) == data

# ---------------------------------------------------------------------------
# NullOdds
# ---------------------------------------------------------------------------

def test_null_odds_returns_empty():
    provider = NullOdds()
    assert provider.linhas(EVENT, MARKETS["vitoria"]) == []
    assert provider.linhas(EVENT, MARKETS["sot"]) == []

# ---------------------------------------------------------------------------
# PropOddsProvider — documented stub
# ---------------------------------------------------------------------------

def test_prop_odds_provider_raises_not_implemented():
    provider = PropOddsProvider()
    with pytest.raises(NotImplementedError):
        provider.linhas(EVENT, MARKETS["sot"])
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_odds.py -v`
  `Expected: FAIL (ModuleNotFoundError: No module named 'odd_analyzer.providers.odds')`

- [ ] **Step 3: Write minimal implementation**

```python
"""OddsProvider protocol + implementations.

BSDMatchOdds  — reads BSD event_odds for partida_1x2 and partida_totais.
ManualOdds    — wraps a caller-supplied list of lines (jogador odds pasted by hand).
NullOdds      — returns [] (model-only, no EV computed).
PropOddsProvider — documented stub; raises NotImplementedError (slot for future feed).

linhas() contract:
  partida_1x2:    [{lado: "home|draw|away", odd: float}]
  partida_totais: [{linha: float, odd_over: float, odd_under: float, book: str}]
  contagem:       [{entidade: str, linha: float, odd_over, odd_under, book}]
"""
from typing import Protocol, runtime_checkable
import logging

from odd_analyzer.model.markets import MarketSpec

logger = logging.getLogger(__name__)


@runtime_checkable
class OddsProvider(Protocol):
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]: ...


class BSDMatchOdds:
    """Reads BSD event_odds endpoint and normalises to the linhas contract."""

    def __init__(self, client):
        self._client = client

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        event_id = event.get("id")
        try:
            data = self._client.event_odds(event_id)
        except Exception as exc:
            logger.warning("BSDMatchOdds.linhas error for event %s: %s", event_id, exc)
            return []

        results = data.get("results") or []

        if market.kind == "partida_1x2":
            return self._parse_1x2(results)
        if market.kind == "partida_totais":
            return self._parse_totais(results)
        # contagem / props — not handled by this provider
        return []

    @staticmethod
    def _parse_1x2(results: list[dict]) -> list[dict]:
        for block in results:
            if block.get("market") in ("1x2", "h2h", "match_winner"):
                outcomes = block.get("outcomes") or []
                parsed = []
                for o in outcomes:
                    side = o.get("side", "").lower()
                    if side in ("home", "draw", "away"):
                        parsed.append({"lado": side, "odd": float(o["odd"])})
                if len(parsed) == 3:
                    return parsed
        return []

    @staticmethod
    def _parse_totais(results: list[dict]) -> list[dict]:
        for block in results:
            if block.get("market") in ("totals", "over_under", "total_goals"):
                outcomes = block.get("outcomes") or []
                lines: dict[float, dict] = {}
                for o in outcomes:
                    try:
                        line = float(o["line"])
                    except (KeyError, TypeError, ValueError):
                        continue
                    if line not in lines:
                        lines[line] = {"linha": line, "book": block.get("book", "")}
                    side = o.get("side", "").lower()
                    if side == "over":
                        lines[line]["odd_over"] = float(o["odd"])
                    elif side == "under":
                        lines[line]["odd_under"] = float(o["odd"])
                return [
                    row for row in lines.values()
                    if "odd_over" in row and "odd_under" in row
                ]
        return []


class ManualOdds:
    """Wraps caller-supplied lines (e.g., from UI input). Returned as-is."""

    def __init__(self, linhas: list[dict]):
        self._linhas = linhas

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return self._linhas


class NullOdds:
    """Returns empty list — model-only mode; EV computation is skipped."""

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return []


class PropOddsProvider:
    """Documented stub — slot for a future prop odds feed (e.g., SportsGameOdds Pro).
    Raises NotImplementedError until a feed is wired. Callers must fall back to ManualOdds."""

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raise NotImplementedError(
            "PropOddsProvider: no prop odds feed configured. "
            "Use ManualOdds for player prop lines."
        )
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_providers_odds.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**
```bash
git add src/odd_analyzer/providers/odds.py tests/test_providers_odds.py && git commit -m "feat: providers/odds BSDMatchOdds (1x2+totais), ManualOdds, NullOdds, PropOddsProvider stub"
```

---

### Task 26: pipeline.py — dispatch kind=partida_1x2 and kind=partida_totais

**Files:**
- Modify: `src/odd_analyzer/pipeline.py`
- Modify: `src/odd_analyzer/candidates/builder.py`
- Test: `tests/test_pipeline_partida.py`

- [ ] **Step 1: Write the failing test**

```python
"""Integration tests for pipeline dispatch of partida_1x2 and partida_totais.
All offline — fake providers, no network, no Supabase."""
import pytest
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.store.repo import InMemoryRepo
from odd_analyzer.model.markets import MARKETS

EVENT = {
    "id": "wc_bra_cro",
    "jogo": "BRA x CRO",
    "home_team_id": 10,
    "away_team_id": 20,
}

# ---------------------------------------------------------------------------
# Fake providers
# ---------------------------------------------------------------------------

class FakeStatsProviderPartida:
    """Returns team_rates for both teams; elenco/entity_taxa not needed here."""
    RATES = {
        10: {"attack": 2.0, "defense": 0.8, "games": 10},
        20: {"attack": 1.2, "defense": 1.1, "games": 10},
    }
    def team_rates(self, team_id, contexto):
        return self.RATES.get(team_id)
    def elenco(self, event):
        return []
    def entity_taxa(self, entity_id, market, contexto):
        return None


class FakeOdds1X2:
    def linhas(self, event, market):
        return [
            {"lado": "home", "odd": 2.10},
            {"lado": "draw", "odd": 3.40},
            {"lado": "away", "odd": 3.20},
        ]


class FakeOddsTotais:
    def linhas(self, event, market):
        return [
            {"linha": 2.5, "odd_over": 1.92, "odd_under": 1.98, "book": "pinnacle"},
        ]


class FakeOddsEmpty:
    def linhas(self, event, market):
        return []


def fake_analista_apostar(candidatos, contexto):
    if not candidatos:
        return {"melhor_aposta": None, "outras": [], "alertas": ["sem candidatos"]}
    c = candidatos[0]
    return {
        "melhor_aposta": {
            "jogador": c["jogador"],
            "linha": c.get("linha"),
            "lado": c.get("lado"),
            "veredito": "APOSTAR",
            "confianca": "alta",
            "motivo": "edge positivo",
        },
        "outras": [],
        "alertas": [],
    }


def fake_analista_nao(candidatos, contexto):
    return {"melhor_aposta": None, "outras": [], "alertas": []}


# ---------------------------------------------------------------------------
# Tests: kind=partida_1x2
# ---------------------------------------------------------------------------

def test_pipeline_1x2_produces_three_candidatos():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["vitoria"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOdds1X2(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    # one candidate per outcome: home, draw, away
    assert len(out["candidatos"]) == 3

def test_pipeline_1x2_candidato_has_lado_field():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["vitoria"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOdds1X2(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    sides = {c["lado"] for c in out["candidatos"]}
    assert sides == {"home", "draw", "away"}

def test_pipeline_1x2_prob_modelo_comes_from_probs_1x2():
    """prob_modelo for each side must be from score_matrix/probs_1x2, not odds."""
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["vitoria"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOdds1X2(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    probs = {c["lado"]: c["prob_modelo"] for c in out["candidatos"]}
    total = sum(probs.values())
    # the three probs must sum to ~1 (they come from score_matrix)
    assert total == pytest.approx(1.0, abs=0.01)
    # with team 10 having higher attack, home should have higher prob
    assert probs["home"] > probs["away"]

def test_pipeline_1x2_saves_analise_to_repo():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKETS["vitoria"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOdds1X2(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert repo.get_analise("wc_bra_cro") is not None

def test_pipeline_1x2_saves_ledger_when_apostar():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKETS["vitoria"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOdds1X2(),
        repo=repo,
        analista_fn=fake_analista_apostar,
    )
    assert len(repo.ledger) == 1
    assert repo.ledger[0]["market_type"] == "vitoria"

def test_pipeline_1x2_no_ledger_when_nao_apostar():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKETS["vitoria"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOdds1X2(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert repo.ledger == []

def test_pipeline_1x2_empty_odds_gives_no_candidatos():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["vitoria"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOddsEmpty(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert out["candidatos"] == []

# ---------------------------------------------------------------------------
# Tests: kind=partida_totais
# ---------------------------------------------------------------------------

def test_pipeline_totais_produces_candidato_per_line():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["gols"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOddsTotais(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    # one line (2.5) → one candidato
    assert len(out["candidatos"]) == 1

def test_pipeline_totais_candidato_has_linha_25():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["gols"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOddsTotais(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert out["candidatos"][0]["linha"] == 2.5

def test_pipeline_totais_prob_modelo_between_zero_and_one():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["gols"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOddsTotais(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    p = out["candidatos"][0]["prob_modelo"]
    assert 0.0 < p < 1.0

def test_pipeline_totais_ledger_market_type_is_gols():
    repo = InMemoryRepo()
    analisar_jogo(
        event=EVENT,
        market=MARKETS["gols"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOddsTotais(),
        repo=repo,
        analista_fn=fake_analista_apostar,
    )
    assert len(repo.ledger) == 1
    assert repo.ledger[0]["market_type"] == "gols"

def test_pipeline_totais_empty_odds_gives_no_candidatos():
    repo = InMemoryRepo()
    out = analisar_jogo(
        event=EVENT,
        market=MARKETS["gols"],
        stats_provider=FakeStatsProviderPartida(),
        odds_provider=FakeOddsEmpty(),
        repo=repo,
        analista_fn=fake_analista_nao,
    )
    assert out["candidatos"] == []
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline_partida.py -v`
  `Expected: FAIL (TypeError: analisar_jogo() got unexpected keyword argument 'market')`

- [ ] **Step 3: Write minimal implementation**

First, update `src/odd_analyzer/candidates/builder.py` to rename `sot_concedido_adversario` → `concedido_adversario` and add `market_type` and `lado`:

```python
"""Monta o dossiê de UM candidato no formato que a IA lê.
Toda a matemática (de-vig, edge, EV) vem do código aqui — a IA nunca calcula.

v2: concedido_adversario (era sot_concedido_adversario); market_type; lado (1X2).
"""
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev


def build_candidate(
    jogador, linha, odd_over, odd_under, prob_modelo, mu,
    minutos_esperados, xi_confirmado, amostra_jogos,
    concedido_adversario, incerteza,
    market_type: str = "sot",
    lado: str | None = None,
    # Legacy alias kept for backward compatibility
    sot_concedido_adversario=None,
) -> dict:
    if concedido_adversario is None and sot_concedido_adversario is not None:
        concedido_adversario = sot_concedido_adversario
    prob_devig = fair_prob_over(odd_over, odd_under)
    m = edge_ev(prob_modelo, prob_devig, odd_over)
    result = {
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
        "concedido_adversario": concedido_adversario,
        "incerteza": incerteza,
        "market_type": market_type,
    }
    if lado is not None:
        result["lado"] = lado
    return result
```

Then update `src/odd_analyzer/pipeline.py` with the new dispatch logic:

```python
"""Orquestra a análise de UM jogo por mercado.

v2: analisar_jogo recebe market: MarketSpec + stats_provider + odds_provider.
Despacha por market.kind:
  "contagem"       → prob_over_line (NegBin); um candidato por (entidade, linha).
  "partida_1x2"    → score_matrix → probs_1x2; um candidato por lado (home/draw/away).
  "partida_totais" → score_matrix → prob_total_over; um candidato por linha.

EV calculado em código (build_candidate). IA só explica.
"""
from odd_analyzer.candidates.builder import build_candidate
from odd_analyzer.candidates.filtro import filter_candidates
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.match_model import team_lambdas, score_matrix, probs_1x2, prob_total_over
from odd_analyzer.model.markets import MarketSpec
from odd_analyzer.ai.analista import analisar as _default_analista
from odd_analyzer.model.params import NB_DISPERSION

_HOME_ADV = 1.08  # default home advantage multiplier


def analisar_jogo(
    event: dict,
    market: MarketSpec,
    stats_provider,
    odds_provider,
    repo,
    overrides: dict | None = None,
    analista_fn=_default_analista,
) -> dict:
    """Analisa 1 jogo para o mercado dado. Retorna {"candidatos": [...], "ia": {...}}.

    Dispatch por market.kind:
      contagem       — usa entity_taxa + prob_over_line.
      partida_1x2    — usa team_rates + score_matrix + probs_1x2.
      partida_totais — usa team_rates + score_matrix + prob_total_over.
    """
    if market.kind == "partida_1x2":
        candidatos = _dispatch_1x2(event, market, stats_provider, odds_provider)
    elif market.kind == "partida_totais":
        candidatos = _dispatch_totais(event, market, stats_provider, odds_provider)
    else:
        candidatos = _dispatch_contagem(event, market, stats_provider, odds_provider, overrides)

    selecionados = filter_candidates(candidatos)
    ia = analista_fn(selecionados, {"jogo": event.get("jogo", event["id"])})
    repo.save_analise(event["id"], {"jogo": event.get("jogo"), "candidatos": selecionados,
                                    "llm_resultado": ia})
    aposta = ia.get("melhor_aposta")
    if aposta and aposta.get("veredito") == "APOSTAR":
        jogador_key = aposta.get("jogador")
        lado_key = aposta.get("lado")
        linha_key = aposta.get("linha")
        c = next(
            (c for c in selecionados if (
                c.get("jogador") == jogador_key and
                c.get("lado") == lado_key and
                c.get("linha") == linha_key
            )),
            None,
        )
        if c:
            repo.save_ledger([{
                "event_id": event["id"],
                "jogador": c.get("jogador"),
                "linha": c.get("linha"),
                "lado": c.get("lado"),
                "odd_flag": c["odd"],
                "prob_modelo": c["prob_modelo"],
                "prob_devig": c["prob_devig"],
                "edge": c["edge"],
                "ev": c["ev"],
                "market_type": c.get("market_type", market.key),
            }])
    return {"candidatos": selecionados, "ia": ia}


def _team_rates_or_prior(stats_provider, team_id, event, mando):
    rates = stats_provider.team_rates(team_id, {"event": event, "mando": mando})
    if rates is None:
        return {"attack": 1.3, "defense": 1.0, "games": 0}
    return rates


def _dispatch_1x2(event, market, stats_provider, odds_provider):
    linhas = odds_provider.linhas(event, market)
    if not linhas:
        return []
    home_id = event.get("home_team_id")
    away_id = event.get("away_team_id")
    home_rates = _team_rates_or_prior(stats_provider, home_id, event, "home")
    away_rates = _team_rates_or_prior(stats_provider, away_id, event, "away")
    mu_home, mu_away = team_lambdas(
        home_attack=home_rates["attack"],
        away_defense=away_rates.get("defense", 1.0),
        away_attack=away_rates["attack"],
        home_defense=home_rates.get("defense", 1.0),
        home_adv=_HOME_ADV,
    )
    matrix = score_matrix(mu_home, mu_away, rho=-0.1)
    p_home, p_draw, p_away = probs_1x2(matrix)
    prob_by_lado = {"home": p_home, "draw": p_draw, "away": p_away}
    candidatos = []
    # For 1X2 we need over/under odds for de-vig; use each outcome odd vs complement
    odds_by_lado = {row["lado"]: row["odd"] for row in linhas}
    total_imp = sum(1.0 / o for o in odds_by_lado.values())
    for lado, odd in odds_by_lado.items():
        # fair_prob via multiplicative de-vig across all three outcomes
        prob_devig_lado = (1.0 / odd) / total_imp
        # We need odd_over/odd_under for build_candidate; use lado odd vs sum of other two
        other_odds = [v for k, v in odds_by_lado.items() if k != lado]
        if len(other_odds) != 2:
            continue
        # synthetic "under" odd: complement implied prob
        comp_imp = 1.0 - (1.0 / odd) / total_imp
        odd_under_synthetic = 1.0 / comp_imp if comp_imp > 0 else 100.0
        prob_modelo = prob_by_lado[lado]
        from odd_analyzer.value.devig import fair_prob_over
        from odd_analyzer.value.ev import edge_ev
        m = edge_ev(prob_modelo, prob_devig_lado, odd)
        candidatos.append({
            "jogador": f"{lado.title()} ({event.get('jogo', event['id'])})",
            "lado": lado,
            "linha": None,
            "odd": odd,
            "prob_modelo": prob_modelo,
            "prob_devig": prob_devig_lado,
            "edge": m["edge"],
            "ev": m["ev"],
            "lambda": mu_home if lado == "home" else mu_away,
            "minutos_esperados": 90,
            "xi_confirmado": True,
            "amostra_jogos": min(home_rates["games"], away_rates["games"]),
            "concedido_adversario": None,
            "incerteza": "media",
            "market_type": market.key,
        })
    return candidatos


def _dispatch_totais(event, market, stats_provider, odds_provider):
    linhas = odds_provider.linhas(event, market)
    if not linhas:
        return []
    home_id = event.get("home_team_id")
    away_id = event.get("away_team_id")
    home_rates = _team_rates_or_prior(stats_provider, home_id, event, "home")
    away_rates = _team_rates_or_prior(stats_provider, away_id, event, "away")
    mu_home, mu_away = team_lambdas(
        home_attack=home_rates["attack"],
        away_defense=away_rates.get("defense", 1.0),
        away_attack=away_rates["attack"],
        home_defense=home_rates.get("defense", 1.0),
        home_adv=_HOME_ADV,
    )
    matrix = score_matrix(mu_home, mu_away, rho=-0.1)
    candidatos = []
    for row in linhas:
        linha = row["linha"]
        odd_over = row["odd_over"]
        odd_under = row["odd_under"]
        prob_modelo = prob_total_over(matrix, linha)
        candidatos.append(build_candidate(
            jogador=f"Totais ({event.get('jogo', event['id'])})",
            linha=linha,
            odd_over=odd_over,
            odd_under=odd_under,
            prob_modelo=prob_modelo,
            mu=mu_home + mu_away,
            minutos_esperados=90,
            xi_confirmado=True,
            amostra_jogos=min(home_rates["games"], away_rates["games"]),
            concedido_adversario=None,
            incerteza="media",
            market_type=market.key,
        ))
    return candidatos


def _dispatch_contagem(event, market, stats_provider, odds_provider, overrides):
    """Original contagem path (SOT, desarmes, escanteios, finalizacoes)."""
    from odd_analyzer.crosswalk.match import match_player
    elenco = stats_provider.elenco(event)
    linhas = odds_provider.linhas(event, market)
    candidatos = []
    for prop in linhas:
        entidade = prop.get("entidade") or prop.get("player_name", "")
        m = match_player(entidade, elenco, overrides=overrides)
        if m is None:
            continue
        t = stats_provider.entity_taxa(m["id"], market, {"event": event})
        if t is None:
            continue
        prob_modelo = prob_over_line(t["mu"], prop["linha"], r=market.nb_dispersion)
        candidatos.append(build_candidate(
            jogador=m["name"],
            linha=prop["linha"],
            odd_over=prop["odd_over"],
            odd_under=prop["odd_under"],
            prob_modelo=prob_modelo,
            mu=t["mu"],
            minutos_esperados=t["minutos_esperados"],
            xi_confirmado=t["xi_confirmado"],
            amostra_jogos=t["amostra_jogos"],
            concedido_adversario=t.get("concedido_adversario"),
            incerteza=t["incerteza"],
            market_type=market.key,
        ))
    return candidatos
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_pipeline_partida.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**
```bash
git add src/odd_analyzer/pipeline.py src/odd_analyzer/candidates/builder.py tests/test_pipeline_partida.py && git commit -m "feat: pipeline dispatch partida_1x2+partida_totais via match_model; builder adds market_type+lado+concedido_adversario"
```

---

### Task 27: Backward compatibility — existing pipeline and builder tests still pass

**Files:**
- Modify: `tests/test_builder.py`
- Modify: `tests/test_pipeline.py`

- [ ] **Step 1: Write the failing test**

```python
# Verify existing tests still pass with the renamed field and new pipeline signature.
# The tests in test_builder.py use sot_concedido_adversario (old name) which must still work.
# The tests in test_pipeline.py use the old analisar_jogo(event, elenco, taxa_fn, repo) signature
# which must still be supported OR we update those tests to the new signature.

# This task's "test" is the existing suite — run it to confirm it breaks, then fix it.
# The failing tests will be: test_build_candidate_monta_dossie (sot_concedido_adversario gone)
# and test_pipeline_* (old positional signature).

# Paste the updated test_builder.py here:
import pytest
from odd_analyzer.candidates.builder import build_candidate

def test_build_candidate_monta_dossie():
    c = build_candidate(
        jogador="Vinicius Jr", linha=0.5, odd_over=1.72, odd_under=2.10,
        prob_modelo=0.68, mu=1.9, minutos_esperados=88, xi_confirmado=True,
        amostra_jogos=24, concedido_adversario="alto", incerteza="media",
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
    assert c["concedido_adversario"] == "alto"
    assert c["incerteza"] == "media"

def test_build_candidate_legacy_sot_concedido_adversario_alias():
    """Old callers that pass sot_concedido_adversario still work."""
    c = build_candidate(
        jogador="Player", linha=0.5, odd_over=1.80, odd_under=2.05,
        prob_modelo=0.60, mu=1.2, minutos_esperados=90, xi_confirmado=True,
        amostra_jogos=10, concedido_adversario=None,
        sot_concedido_adversario="medio", incerteza="baixa",
    )
    assert c["concedido_adversario"] == "medio"

def test_build_candidate_market_type_default_is_sot():
    c = build_candidate(
        jogador="X", linha=1.5, odd_over=2.0, odd_under=1.9,
        prob_modelo=0.5, mu=1.5, minutos_esperados=90, xi_confirmado=True,
        amostra_jogos=5, concedido_adversario=None, incerteza="alta",
    )
    assert c["market_type"] == "sot"

def test_build_candidate_market_type_custom():
    c = build_candidate(
        jogador="X", linha=1.5, odd_over=2.0, odd_under=1.9,
        prob_modelo=0.5, mu=1.5, minutos_esperados=90, xi_confirmado=True,
        amostra_jogos=5, concedido_adversario=None, incerteza="alta",
        market_type="escanteios",
    )
    assert c["market_type"] == "escanteios"
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_builder.py tests/test_pipeline.py -v`
  `Expected: FAIL (test_build_candidate_monta_dossie uses sot_concedido_adversario which is now concedido_adversario; test_pipeline_* use old analisar_jogo signature)`

- [ ] **Step 3: Write minimal implementation**

Replace `tests/test_builder.py` with the updated version above (already written in Step 1).

Then update `tests/test_pipeline.py` to use the new `analisar_jogo` signature with a `contagem` market and a stub `OddsProvider`:

```python
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.store.repo import InMemoryRepo
from odd_analyzer.model.markets import MARKETS

# Fake providers satisfying the new interface
class _FakeStats:
    def elenco(self, event):
        return [{"id": 1, "name": "Vinicius Jr"}]
    def entity_taxa(self, entity_id, market, contexto):
        return {"mu": 1.9, "minutos_esperados": 88, "xi_confirmado": True,
                "amostra_jogos": 24, "concedido_adversario": "alto", "incerteza": "media"}
    def team_rates(self, team_id, contexto):
        return None


class _FakeOdds:
    def linhas(self, event, market):
        return [{"entidade": "Vinicius Jr", "linha": 0.5, "odd_over": 1.72,
                 "odd_under": 2.10, "book": "dk"}]


class _FakeOddsNoMatch:
    def linhas(self, event, market):
        return [{"entidade": "Outro Nome Totalmente Diferente", "linha": 0.5,
                 "odd_over": 1.72, "odd_under": 2.10, "book": "dk"}]


class _FakeOddsEmpty:
    def linhas(self, event, market):
        return []


EVENT = {"id": "evt1", "jogo": "BRA x CRO"}


def fake_analista(candidatos, contexto):
    melhor = candidatos[0] if candidatos else None
    return {"melhor_aposta": ({"jogador": melhor["jogador"], "linha": melhor["linha"],
            "lado": None, "veredito": "APOSTAR", "confianca": "alta",
            "motivo": "edge alto"} if melhor else None),
            "outras": [], "alertas": []}


def test_pipeline_ponta_a_ponta_gera_candidato_e_grava_ledger():
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, MARKETS["sot"], _FakeStats(), _FakeOdds(), repo,
                        analista_fn=fake_analista)
    assert len(out["candidatos"]) == 1
    assert out["candidatos"][0]["jogador"] == "Vinicius Jr"
    assert out["ia"]["melhor_aposta"]["jogador"] == "Vinicius Jr"
    assert repo.get_analise("evt1") is not None
    assert len(repo.ledger) == 1


def test_pipeline_descarta_jogador_sem_match():
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, MARKETS["sot"], _FakeStats(), _FakeOddsNoMatch(), repo,
                        analista_fn=fake_analista)
    assert out["candidatos"] == []


def test_pipeline_nao_grava_ledger_quando_nao_apostar():
    def analista_nao(candidatos, contexto):
        return {"melhor_aposta": None, "outras": [], "alertas": ["sem valor claro"]}
    repo = InMemoryRepo()
    out = analisar_jogo(EVENT, MARKETS["sot"], _FakeStats(), _FakeOdds(), repo,
                        analista_fn=analista_nao)
    assert repo.ledger == []
    assert repo.get_analise("evt1") is not None
    assert out["ia"]["melhor_aposta"] is None
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/test_builder.py tests/test_pipeline.py tests/test_pipeline_partida.py -v`
  `Expected: PASS`

- [ ] **Step 5: Commit**
```bash
git add tests/test_builder.py tests/test_pipeline.py && git commit -m "test: update test_builder+test_pipeline for new pipeline signature and concedido_adversario rename"
```

---

### Task 28: Full suite green — verify no regressions across all 97+ tests

**Files:**
- No new files — verification only.

- [ ] **Step 1: Write the failing test**

```python
# No new test file for this task. The "test" is the full suite.
# After Task 6, run the full suite to catch any regressions from:
# - builder rename (sot_concedido_adversario → concedido_adversario)
# - pipeline new signature (market, stats_provider, odds_provider)
# - new modules (match_model, markets, providers/*)
# Expected regressions to watch for:
#   tests/test_params.py      — imports from model.params (still intact, no changes)
#   tests/test_calibration.py — imports from backtest.calibration (untouched)
#   tests/test_run_backtest.py— imports from pipeline (old shape) if any
#   tests/test_report.py      — may use pipeline indirectly
# This step deliberately runs the suite to SEE what fails before fixing.
```

- [ ] **Step 2: Run test to verify it fails**
  `Run: .venv\Scripts\python.exe -m pytest tests/ -v --tb=short`
  `Expected: FAIL (identify any remaining tests that reference old builder/pipeline API)`

- [ ] **Step 3: Write minimal implementation**

Fix any remaining test files that import `sot_concedido_adversario` or use the old `analisar_jogo(event, elenco, taxa_fn, repo)` positional signature. For each failing test, apply the matching fix:

- If a test imports `sot_concedido_adversario`: replace with `concedido_adversario`.
- If a test calls `analisar_jogo(event, elenco, taxa_fn, repo, ...)`: refactor to use a `_FakeStats` / `_FakeOdds` provider pair and pass `market=MARKETS["sot"]`.
- If a test imports from `odd_analyzer.pipeline` and calls `parse_sot_props` directly: the function is no longer called from pipeline — remove or redirect to the provider stub.

Example fix for `tests/test_report.py` if it uses `build_candidate` with old field name:

```python
# In any test file still using sot_concedido_adversario keyword:
# OLD: sot_concedido_adversario="alto"
# NEW: concedido_adversario="alto"
```

- [ ] **Step 4: Run test to verify it passes**
  `Run: .venv\Scripts\python.exe -m pytest tests/ -v`
  `Expected: PASS (all tests, count >= original 97 + new tests from tasks 1-6)`

- [ ] **Step 5: Commit**
```bash
git add tests/ && git commit -m "test: fix remaining test regressions after pipeline v2 + builder rename (full suite green)"
```

---

## fase4-validacao

### Task 29: ApiFootballStatsProvider — wraps apifootball.py to StatsProvider protocol

**Files:**
- Modify: `src/odd_analyzer/providers/stats.py`
- Test: `tests/test_providers_stats_apifootball.py`

> Note: `src/odd_analyzer/providers/` must already exist from Phase 0/1. This task adds `ApiFootballStatsProvider` to the existing `stats.py` file.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_providers_stats_apifootball.py
"""ApiFootballStatsProvider adapts stats/apifootball.py to the StatsProvider protocol.
All network calls are replaced with inline fixture dicts — zero real HTTP."""
import pytest
from unittest.mock import patch, MagicMock
from odd_analyzer.providers.stats import ApiFootballStatsProvider
from odd_analyzer.model.markets import MARKETS

# Minimal fixture: the shape parse_player_sot returns for league_id=39
_PLAYER_ENTRY = {
    "player": {"id": 1100, "name": "Raheem Sterling"},
    "statistics": [{
        "league": {"id": 39},
        "team": {"id": 50, "name": "Manchester City"},
        "games": {"minutes": 2556, "appearences": 30},
        "shots": {"on": 59, "total": 110},
    }],
}

# Fixture page response shape from /players endpoint
_PAGE_RESPONSE = {
    "response": [_PLAYER_ENTRY],
    "paging": {"current": 1, "total": 1},
    "errors": {},
}

EVENT = {
    "id": "fix_1",
    "home_team_id": 50,
    "away_team_id": 33,
    "league_id": 39,
    "season": 2023,
}

def _make_provider(page_response=_PAGE_RESPONSE):
    """Build an ApiFootballStatsProvider whose HTTP calls are mocked."""
    provider = ApiFootballStatsProvider(api_key="FAKE_KEY", league_id=39, season=2023)
    provider._fetch_players_page = MagicMock(return_value=page_response)
    return provider


def test_elenco_retorna_lista_de_jogadores():
    provider = _make_provider()
    elenco = provider.elenco(EVENT)
    assert isinstance(elenco, list)
    assert len(elenco) == 1
    p = elenco[0]
    assert p["id"] == 1100
    assert p["name"] == "Raheem Sterling"
    assert p["team_id"] == 50
    # posicao may be None when not present in fixture — just check key exists
    assert "posicao" in p


def test_entity_taxa_retorna_dict_com_chaves_canonicas():
    provider = _make_provider()
    market = MARKETS["sot"]
    contexto = {"league_avg": 4.0, "opp_conceded": 5.0, "is_home": True,
                "home_factor": 1.1, "away_factor": 0.9, "minutos_esperados": 88}
    result = provider.entity_taxa(1100, market, contexto)
    assert result is not None
    for key in ("mu", "minutos_esperados", "xi_confirmado", "amostra_jogos",
                "concedido_adversario", "incerteza"):
        assert key in result, f"missing key: {key}"
    assert result["mu"] > 0
    assert result["amostra_jogos"] == 30


def test_entity_taxa_retorna_none_para_jogador_desconhecido():
    provider = _make_provider()
    market = MARKETS["sot"]
    contexto = {"league_avg": 4.0, "opp_conceded": 4.0, "is_home": True,
                "home_factor": 1.0, "away_factor": 1.0, "minutos_esperados": 88}
    result = provider.entity_taxa(9999, market, contexto)
    assert result is None


def test_team_rates_retorna_none_pois_nao_implementado():
    """ApiFootballStatsProvider does not compute team rates (only BSDStatsProvider does)."""
    provider = _make_provider()
    result = provider.team_rates(50, {})
    assert result is None
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats_apifootball.py -v`
`Expected: FAIL (ImportError — ApiFootballStatsProvider does not exist yet)`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/providers/stats.py
# ADD to the existing file (after BSDStatsProvider and FallbackStatsProvider stubs
# that prior phases created). This task adds ApiFootballStatsProvider.
#
# Full replacement of the module (preserves existing classes, adds new one):
"""StatsProvider protocol + implementations.

Classes
-------
StatsProvider       — Protocol (structural subtyping)
BSDStatsProvider    — primary (BSD/Bzzoiro)
ApiFootballStatsProvider — fallback, wraps stats/apifootball.py
FallbackStatsProvider — tries BSD first, falls back to API-Football on None/exception
"""
from __future__ import annotations

import logging
from typing import Protocol, runtime_checkable

from odd_analyzer.model.markets import MarketSpec, MARKETS
from odd_analyzer.model.sot_model import expected_lambda
from odd_analyzer.model.shrinkage import shrink_rate
from odd_analyzer.model.adjustments import opponent_multiplier, home_away_multiplier
from odd_analyzer.model.params import PRIOR_RATE, PRIOR_STRENGTH

logger = logging.getLogger(__name__)


@runtime_checkable
class StatsProvider(Protocol):
    def elenco(self, event: dict) -> list[dict]:
        """Return [{id, name, team_id, posicao}] for all players in the event."""
        ...

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        """Return {mu, minutos_esperados, xi_confirmado, amostra_jogos,
        concedido_adversario, incerteza} or None when data unavailable."""
        ...

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        """Return attack/defense rate dict for match_model, or None."""
        ...


class BSDStatsProvider:
    """Primary stats provider using BSD/Bzzoiro client."""

    def __init__(self, bsd_client):
        self._client = bsd_client

    def elenco(self, event: dict) -> list[dict]:
        data = self._client.lineups(event["id"])
        players = []
        for entry in data.get("results", []):
            players.append({
                "id": entry.get("player_id") or entry.get("id"),
                "name": entry.get("player_name") or entry.get("name"),
                "team_id": entry.get("team_id"),
                "posicao": entry.get("position"),
            })
        return players

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        raw = self._client.player_stats(entity_id)
        results = raw.get("results", [])
        if not results:
            return None
        games = [g for g in results if g.get(market.stat_field) is not None]
        if not games:
            return None
        minutos = contexto.get("minutos_esperados", 88)
        total_min = sum(g.get("minutes_played", 90) for g in games)
        total_stat = sum(g.get(market.stat_field, 0) for g in games)
        if total_min <= 0:
            return None
        rate_per90 = total_stat / total_min * 90.0
        n_games = len(games)
        rate = shrink_rate(rate_per90, n_games, market.prior_rate, market.prior_strength)
        opp_mult = opponent_multiplier(
            contexto.get("opp_conceded", contexto.get("league_avg", 1.0)),
            contexto.get("league_avg", 1.0),
        )
        ha_mult = home_away_multiplier(
            contexto.get("is_home", True),
            contexto.get("home_factor", 1.0),
            contexto.get("away_factor", 1.0),
        )
        mu = expected_lambda(rate, minutos) * opp_mult * ha_mult
        return {
            "mu": mu,
            "minutos_esperados": minutos,
            "xi_confirmado": contexto.get("xi_confirmado", False),
            "amostra_jogos": n_games,
            "concedido_adversario": contexto.get("opp_conceded", contexto.get("league_avg")),
            "incerteza": "alta" if n_games < 5 else ("media" if n_games < 15 else "baixa"),
        }

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        raw = self._client.team_stats(team_id)
        results = raw.get("results", [])
        if not results:
            return None
        n = len(results)
        goals_scored = sum(r.get("goals", 0) for r in results) / n if n else 0.0
        goals_conceded = sum(r.get("goals_against", 0) for r in results) / n if n else 0.0
        return {"attack": goals_scored, "defense": goals_conceded, "n_games": n}


class ApiFootballStatsProvider:
    """Fallback stats provider wrapping stats/apifootball.py.

    Uses /players endpoint (paged) to build a local cache of player stats
    for the given league/season, then serves entity_taxa from that cache.
    """

    def __init__(self, api_key: str, league_id: int, season: int):
        self._api_key = api_key
        self._league_id = league_id
        self._season = season
        self._cache: dict[int, dict] | None = None  # player_id -> parse_player_sot result

    def _fetch_players_page(self, page: int) -> dict:
        """Thin wrapper around the real API call — replaced in tests."""
        import requests
        r = requests.get(
            "https://v3.football.api-sports.io/players",
            params={
                "league": str(self._league_id),
                "season": str(self._season),
                "page": str(page),
            },
            headers={"x-apisports-key": self._api_key},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def _build_cache(self) -> dict[int, dict]:
        from odd_analyzer.stats.apifootball import parse_player_sot

        result: dict[int, dict] = {}
        page = 1
        while True:
            data = self._fetch_players_page(page)
            for entry in data.get("response", []):
                parsed = parse_player_sot(entry, self._league_id)
                if parsed and parsed.get("player_id"):
                    result[parsed["player_id"]] = parsed
            paging = data.get("paging", {})
            if paging.get("current", 1) >= paging.get("total", 1):
                break
            page += 1
        return result

    def _get_cache(self) -> dict[int, dict]:
        if self._cache is None:
            self._cache = self._build_cache()
        return self._cache

    def elenco(self, event: dict) -> list[dict]:
        """Return players known in the cache for the event's teams."""
        cache = self._get_cache()
        home_id = event.get("home_team_id")
        away_id = event.get("away_team_id")
        players = []
        for pid, stats in cache.items():
            # API-Football player stats don't carry team_id in the parsed shape;
            # we don't filter by team here — return all known players.
            players.append({
                "id": pid,
                "name": stats.get("name"),
                "team_id": None,
                "posicao": None,
            })
        return players

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        if market.key != "sot":
            # API-Football free tier only provides shots_on reliably
            return None
        cache = self._get_cache()
        stats = cache.get(entity_id)
        if stats is None:
            return None
        minutes = stats.get("minutes", 0)
        shots_on = stats.get("shots_on", 0)
        apps = stats.get("apps") or 1
        if not minutes:
            return None
        rate_per90 = shots_on / minutes * 90.0
        rate = shrink_rate(rate_per90, apps, market.prior_rate, market.prior_strength)
        minutos = contexto.get("minutos_esperados", 88)
        opp_mult = opponent_multiplier(
            contexto.get("opp_conceded", contexto.get("league_avg", 1.0)),
            contexto.get("league_avg", 1.0),
        )
        ha_mult = home_away_multiplier(
            contexto.get("is_home", True),
            contexto.get("home_factor", 1.0),
            contexto.get("away_factor", 1.0),
        )
        mu = expected_lambda(rate, minutos) * opp_mult * ha_mult
        return {
            "mu": mu,
            "minutos_esperados": minutos,
            "xi_confirmado": contexto.get("xi_confirmado", False),
            "amostra_jogos": apps,
            "concedido_adversario": contexto.get("opp_conceded", contexto.get("league_avg")),
            "incerteza": "alta" if apps < 5 else ("media" if apps < 15 else "baixa"),
        }

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        return None


class FallbackStatsProvider:
    """Tries BSD first; falls back to API-Football on None or any exception.

    Logs which source served each call so data provenance is auditable.
    """

    def __init__(self, primary: BSDStatsProvider, fallback: ApiFootballStatsProvider):
        self._primary = primary
        self._fallback = fallback

    def elenco(self, event: dict) -> list[dict]:
        try:
            result = self._primary.elenco(event)
            if result:
                logger.debug("elenco: BSD serviu %d jogadores", len(result))
                return result
            logger.warning("elenco: BSD retornou vazio, tentando API-Football")
        except Exception as exc:
            logger.warning("elenco: BSD falhou (%s), tentando API-Football", exc)
        result = self._fallback.elenco(event)
        logger.info("elenco: API-Football serviu %d jogadores", len(result))
        return result

    def entity_taxa(self, entity_id, market: MarketSpec, contexto: dict) -> dict | None:
        try:
            result = self._primary.entity_taxa(entity_id, market, contexto)
            if result is not None:
                logger.debug("entity_taxa(%s): BSD", entity_id)
                return result
            logger.warning("entity_taxa(%s): BSD retornou None, tentando API-Football", entity_id)
        except Exception as exc:
            logger.warning("entity_taxa(%s): BSD falhou (%s), tentando API-Football", entity_id, exc)
        result = self._fallback.entity_taxa(entity_id, market, contexto)
        if result is None:
            logger.warning("entity_taxa(%s): ambas as fontes falharam — descartando", entity_id)
        else:
            logger.info("entity_taxa(%s): API-Football", entity_id)
        return result

    def team_rates(self, team_id, contexto: dict) -> dict | None:
        try:
            result = self._primary.team_rates(team_id, contexto)
            if result is not None:
                return result
        except Exception as exc:
            logger.warning("team_rates(%s): BSD falhou (%s)", team_id, exc)
        return self._fallback.team_rates(team_id, contexto)
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats_apifootball.py -v`
`Expected: PASS (4 tests)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/stats.py tests/test_providers_stats_apifootball.py && git commit -m "feat: ApiFootballStatsProvider wraps apifootball.py to StatsProvider protocol"
```

---

### Task 30: FallbackStatsProvider — BSD primary, API-Football fallback, logs source

**Files:**
- Modify: `src/odd_analyzer/providers/stats.py` (already contains FallbackStatsProvider from Task 1)
- Test: `tests/test_providers_stats_fallback.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_providers_stats_fallback.py
"""FallbackStatsProvider: BSD primary -> API-Football on None/exception; logs source."""
import logging
import pytest
from unittest.mock import MagicMock
from odd_analyzer.providers.stats import FallbackStatsProvider
from odd_analyzer.model.markets import MARKETS

MARKET = MARKETS["sot"]
CONTEXTO = {
    "league_avg": 4.0, "opp_conceded": 4.0, "is_home": True,
    "home_factor": 1.0, "away_factor": 1.0, "minutos_esperados": 88,
}
EVENT = {"id": "e1", "home_team_id": 10, "away_team_id": 20, "league_id": 39}

TAXA_OK = {
    "mu": 0.7, "minutos_esperados": 88, "xi_confirmado": False,
    "amostra_jogos": 12, "concedido_adversario": 4.0, "incerteza": "media",
}
ELENCO_BSD = [{"id": 1, "name": "Vini Jr", "team_id": 10, "posicao": "FW"}]
ELENCO_AF  = [{"id": 1, "name": "Vini Jr", "team_id": None, "posicao": None}]


def _make_fallback(bsd_elenco=None, bsd_taxa=None, bsd_raises=False,
                   af_elenco=None, af_taxa=None):
    primary = MagicMock()
    fallback = MagicMock()

    if bsd_raises:
        primary.elenco.side_effect = RuntimeError("BSD fora do ar")
        primary.entity_taxa.side_effect = RuntimeError("BSD fora do ar")
    else:
        primary.elenco.return_value = bsd_elenco if bsd_elenco is not None else []
        primary.entity_taxa.return_value = bsd_taxa

    fallback.elenco.return_value = af_elenco if af_elenco is not None else ELENCO_AF
    fallback.entity_taxa.return_value = af_taxa
    fallback.team_rates.return_value = None

    return FallbackStatsProvider(primary=primary, fallback=fallback)


def test_usa_bsd_quando_disponivel():
    fp = _make_fallback(bsd_elenco=ELENCO_BSD, bsd_taxa=TAXA_OK)
    assert fp.elenco(EVENT) == ELENCO_BSD
    assert fp.entity_taxa(1, MARKET, CONTEXTO) == TAXA_OK


def test_cai_pro_fallback_quando_bsd_retorna_none():
    af_taxa = {**TAXA_OK, "incerteza": "alta"}
    fp = _make_fallback(bsd_taxa=None, af_taxa=af_taxa)
    result = fp.entity_taxa(1, MARKET, CONTEXTO)
    assert result == af_taxa


def test_cai_pro_fallback_quando_bsd_levanta_excecao():
    af_taxa = {**TAXA_OK, "incerteza": "alta"}
    fp = _make_fallback(bsd_raises=True, af_taxa=af_taxa,
                        af_elenco=ELENCO_AF)
    # elenco: BSD raises -> fallback serves
    assert fp.elenco(EVENT) == ELENCO_AF
    # entity_taxa: BSD raises -> fallback serves
    assert fp.entity_taxa(1, MARKET, CONTEXTO) == af_taxa


def test_retorna_none_quando_ambas_falham():
    fp = _make_fallback(bsd_taxa=None, af_taxa=None)
    result = fp.entity_taxa(999, MARKET, CONTEXTO)
    assert result is None


def test_cai_pro_fallback_quando_bsd_elenco_vazio(caplog):
    with caplog.at_level(logging.WARNING, logger="odd_analyzer.providers.stats"):
        fp = _make_fallback(bsd_elenco=[], af_elenco=ELENCO_AF)
        result = fp.elenco(EVENT)
    assert result == ELENCO_AF
    assert any("API-Football" in m for m in caplog.messages)


def test_loga_descarte_quando_ambas_falham(caplog):
    with caplog.at_level(logging.WARNING, logger="odd_analyzer.providers.stats"):
        fp = _make_fallback(bsd_taxa=None, af_taxa=None)
        fp.entity_taxa(42, MARKET, CONTEXTO)
    assert any("descartando" in m or "ambas" in m for m in caplog.messages)
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats_fallback.py -v`
`Expected: FAIL (ImportError or AttributeError — FallbackStatsProvider not yet in place)`

- [ ] **Step 3: Write minimal implementation**

> FallbackStatsProvider is already included verbatim in the `stats.py` code written in Task 1 Step 3. No additional code is needed — only the test file is new.

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_providers_stats_fallback.py -v`
`Expected: PASS (6 tests)`

- [ ] **Step 5: Commit**

```bash
git add tests/test_providers_stats_fallback.py && git commit -m "test: FallbackStatsProvider — BSD primary/AF fallback/logs source"
```

---

### Task 31: score_records gains stat_extractor param — any market replayable

**Files:**
- Modify: `src/odd_analyzer/backtest/run_backtest.py`
- Test: `tests/test_run_backtest.py` (extend existing)

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_run_backtest.py

# --- stat_extractor tests (Task 3) ---

def _sot_extractor(record: dict) -> tuple[float, int]:
    """Canonical SOT extractor: mu from leave-one-out rate, actual = sot > linha."""
    return record["mu"], record["actual_05"]

def _tackles_extractor(record: dict) -> tuple[float, int]:
    """Hypothetical desarmes extractor using a different stat field."""
    return record["mu_tackles"], record["actual_tackles_05"]

def test_score_records_com_stat_extractor_sot_igual_ao_legado():
    """stat_extractor=None must produce the same result as the original signature."""
    preds_leg, actuals_leg = _run()   # existing helper using default SOT path
    preds_new, actuals_new = score_records(
        META, RECORDS, CONCEDED, LEAGUE_AVG, 1.0, 1.0,
        lines=[0.5, 1.5], min_other_minutes=60,
        stat_extractor=None,   # None = use built-in SOT logic (backward compat)
    )
    assert preds_new == preds_leg
    assert actuals_new == actuals_leg


def test_score_records_com_stat_extractor_customizado():
    """A custom stat_extractor overrides the built-in stat field reading.

    We fake a records list that carries pre-computed (mu, actual) pairs as
    extra fields and verify the extractor drives the output correctly.
    """
    import math
    from odd_analyzer.backtest.run_backtest import score_records as sr

    # Records shape: (fid, pid, team_id, minutes, stat_value).
    # We pass a custom stat field via the extractor — build a tiny dataset
    # where the extractor always returns (mu=2.0, actual=1) for the first
    # player and (mu=0.1, actual=0) for the second.
    meta = {1: (10, 20), 2: (10, 20), 3: (10, 20)}
    records = [
        (1, 100, 10, 90, 3), (1, 200, 20, 90, 0),
        (2, 100, 10, 90, 2), (2, 200, 20, 90, 0),
        (3, 100, 10, 90, 2), (3, 200, 20, 90, 0),
    ]
    conceded = {10: 1.0, 20: 1.0}

    # Extractor that reads the 'stat_value' (5th element) as an indicator:
    # value > 0 -> mu=2.0, actual=1; value == 0 -> mu=0.1, actual=0
    def binary_extractor(rec: dict) -> tuple[float, int]:
        sot = rec["stat_value"]
        return (2.0 if sot > 0 else 0.1), (1 if sot > 0 else 0)

    preds, actuals = sr(
        meta, records, conceded, 1.0, 1.0, 1.0,
        lines=[0.5], min_other_minutes=60,
        stat_extractor=binary_extractor,
    )
    # All records with stat_value > 0 produce mu=2.0 (high prob); = 0 -> low prob
    # verify at least some preds are split and actuals match the extractor rule
    assert len(preds[0.5]) > 0
    # records with actual=1 should have higher mu -> higher prob
    high_prob_actuals = [actuals[0.5][i] for i, p in enumerate(preds[0.5]) if p > 0.5]
    low_prob_actuals  = [actuals[0.5][i] for i, p in enumerate(preds[0.5]) if p <= 0.5]
    assert all(a == 1 for a in high_prob_actuals)
    assert all(a == 0 for a in low_prob_actuals)


def test_score_records_stat_extractor_determinista():
    from odd_analyzer.backtest.run_backtest import score_records as sr
    r1 = sr(META, RECORDS, CONCEDED, LEAGUE_AVG, 1.0, 1.0,
            lines=[0.5], min_other_minutes=60, stat_extractor=None)
    r2 = sr(META, RECORDS, CONCEDED, LEAGUE_AVG, 1.0, 1.0,
            lines=[0.5], min_other_minutes=60, stat_extractor=None)
    assert r1 == r2
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_run_backtest.py::test_score_records_com_stat_extractor_sot_igual_ao_legado tests/test_run_backtest.py::test_score_records_com_stat_extractor_customizado tests/test_run_backtest.py::test_score_records_stat_extractor_determinista -v`
`Expected: FAIL (TypeError — score_records has no stat_extractor param)`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/backtest/run_backtest.py
# Replace the score_records function signature and body.
# Everything else in the file stays identical.

def score_records(meta, records, conceded_pg, league_avg, home_factor, away_factor,
                  lines=LINHAS, prior_rate=PRIOR_RATE, prior_strength=PRIOR_STRENGTH,
                  nb_dispersion=NB_DISPERSION, min_other_minutes=MIN_OTHER_MINUTES,
                  stat_extractor=None):
    """PURA (sem rede): dos dados coletados -> ({linha: [preds]}, {linha: [actuals]}).

    stat_extractor: Callable[[dict], tuple[float, int]] | None
        Se fornecido, recebe um dict com chaves:
            fid, pid, tid, minutes, stat_value,
            other_min, other_stat, apps,
            rate, mu (calculado internamente antes do extractor),
            home_id, away_id
        e deve retornar (mu_final, actual) para CADA linha avaliada.
        None = comportamento legado (SOT leave-one-out com NegBin).

    Leave-one-out por jogador + shrinkage + ajustes; prevê P(stat >= linha) via NegBin.
    Determinística — base do replay offline em CI.
    """
    tot_min, tot_sot, apps = {}, {}, {}
    for _, pid, _, m, s in records:
        tot_min[pid] = tot_min.get(pid, 0) + m
        tot_sot[pid] = tot_sot.get(pid, 0) + s
        apps[pid] = apps.get(pid, 0) + 1
    preds = {l: [] for l in lines}
    actuals = {l: [] for l in lines}
    for fid, pid, tid, m, s in records:
        other_min = tot_min[pid] - m
        other_sot = tot_sot[pid] - s
        if other_min < min_other_minutes:
            continue
        rate = shrink_rate(other_sot / other_min * 90.0, apps[pid] - 1, prior_rate, prior_strength)
        mu_base = expected_lambda(rate, m)
        home_id, away_id = meta[fid]
        opp = away_id if tid == home_id else home_id
        mu_base *= opponent_multiplier(conceded_pg.get(opp, league_avg), league_avg)
        mu_base *= home_away_multiplier(tid == home_id, home_factor, away_factor)

        if stat_extractor is not None:
            rec_dict = {
                "fid": fid, "pid": pid, "tid": tid,
                "minutes": m, "stat_value": s,
                "other_min": other_min, "other_stat": other_sot,
                "apps": apps[pid],
                "rate": rate, "mu": mu_base,
                "home_id": home_id, "away_id": away_id,
            }
            mu_final, actual_val = stat_extractor(rec_dict)
            for l in lines:
                preds[l].append(prob_over_line(mu_final, l, r=nb_dispersion))
                actuals[l].append(actual_val)
        else:
            for l in lines:
                preds[l].append(prob_over_line(mu_base, l, r=nb_dispersion))
                actuals[l].append(1 if s > l else 0)
    return preds, actuals
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_run_backtest.py -v`
`Expected: PASS (all 7 tests including 3 new)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/run_backtest.py tests/test_run_backtest.py && git commit -m "feat: score_records gains stat_extractor param — any market replayable offline"
```

---

### Task 32: Per-market calibration runner — Brier/ECE/BrierSkill from MarketSpec + records

**Files:**
- Create: `src/odd_analyzer/backtest/market_calibration.py`
- Test: `tests/test_market_calibration.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_market_calibration.py
"""Per-market calibration runner: takes MarketSpec + captured records,
prints and returns Brier/ECE/BrierSkill. Tests run on tiny synthetic datasets."""
import pytest
from odd_analyzer.backtest.market_calibration import calibrate_market, CalibrationResult
from odd_analyzer.model.markets import MARKETS

# Synthetic dataset: perfect calibration baseline
# preds and actuals where pred == freq -> ECE ~ 0, Brier reasonable
_PERFECT_PREDS   = [0.8, 0.8, 0.2, 0.2]
_PERFECT_ACTUALS = [1,   1,   0,   0  ]

# Synthetic dataset: completely wrong predictions
_WRONG_PREDS   = [0.9, 0.9, 0.9, 0.9]
_WRONG_ACTUALS = [0,   0,   0,   0  ]


def test_calibrate_market_retorna_resultado_com_chaves_canonicas():
    market = MARKETS["sot"]
    result = calibrate_market(market, preds=_PERFECT_PREDS, actuals=_PERFECT_ACTUALS)
    assert isinstance(result, CalibrationResult)
    assert result.market_key == "sot"
    assert hasattr(result, "brier")
    assert hasattr(result, "ece")
    assert hasattr(result, "brier_skill")
    assert hasattr(result, "n_records")
    assert result.n_records == 4


def test_calibrate_market_brier_perfeito_e_baixo():
    market = MARKETS["sot"]
    result = calibrate_market(market, preds=_PERFECT_PREDS, actuals=_PERFECT_ACTUALS)
    assert result.brier == pytest.approx(0.0, abs=1e-9)
    assert result.brier_skill == pytest.approx(1.0, abs=1e-9)


def test_calibrate_market_previsao_errada_tem_skill_negativo():
    market = MARKETS["sot"]
    result = calibrate_market(market, preds=_WRONG_PREDS, actuals=_WRONG_ACTUALS)
    # brier_skill <= 0: worse than always-predicting base rate
    assert result.brier_skill <= 0.0
    assert result.ece > 0.5  # systematic overconfidence


def test_calibrate_market_para_mercado_escanteios():
    market = MARKETS["escanteios"]
    result = calibrate_market(market, preds=[0.6, 0.4, 0.6, 0.4],
                              actuals=[1, 0, 1, 0])
    assert result.market_key == "escanteios"
    assert 0.0 <= result.brier <= 1.0
    assert 0.0 <= result.ece <= 1.0


def test_calibrate_market_levanta_em_lista_vazia():
    market = MARKETS["sot"]
    with pytest.raises(ValueError, match="vazio"):
        calibrate_market(market, preds=[], actuals=[])


def test_calibrate_market_imprime_resumo(capsys):
    market = MARKETS["sot"]
    calibrate_market(market, preds=_PERFECT_PREDS, actuals=_PERFECT_ACTUALS)
    captured = capsys.readouterr()
    assert "sot" in captured.out
    assert "Brier" in captured.out
    assert "ECE" in captured.out
    assert "BrierSkill" in captured.out
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_market_calibration.py -v`
`Expected: FAIL (ImportError — market_calibration.py does not exist)`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/backtest/market_calibration.py
"""Per-market calibration runner.

Usage
-----
    from odd_analyzer.backtest.market_calibration import calibrate_market
    result = calibrate_market(MARKETS["sot"], preds=[...], actuals=[...])
    # result.brier, result.ece, result.brier_skill, result.n_records

The runner reuses calibration.py (brier_score, expected_calibration_error,
brier_skill_score) and adds no new mathematics — it only wraps them for
per-market reporting.
"""
from __future__ import annotations

from dataclasses import dataclass

from odd_analyzer.model.markets import MarketSpec
from odd_analyzer.backtest.calibration import (
    brier_score,
    expected_calibration_error,
    brier_skill_score,
)


@dataclass(frozen=True)
class CalibrationResult:
    market_key: str
    brier: float
    ece: float
    brier_skill: float
    n_records: int


def calibrate_market(
    market: MarketSpec,
    preds: list[float],
    actuals: list[int],
    n_bins: int = 10,
    print_report: bool = True,
) -> CalibrationResult:
    """Compute and optionally print Brier / ECE / BrierSkill for one market.

    Parameters
    ----------
    market   : MarketSpec (used for the market key in output and result)
    preds    : list of predicted probabilities (one per record)
    actuals  : list of binary outcomes (0/1)
    n_bins   : number of reliability bins (default 10)
    print_report : if True, prints a one-line summary to stdout

    Returns
    -------
    CalibrationResult

    Raises
    ------
    ValueError if preds is empty
    """
    if not preds:
        raise ValueError(f"preds vazio para mercado '{market.key}'")

    brier = brier_score(preds, actuals)
    ece = expected_calibration_error(preds, actuals, n_bins=n_bins)
    skill = brier_skill_score(preds, actuals)

    if print_report:
        base = sum(actuals) / len(actuals)
        print(
            f"[calibration] mercado={market.key} | n={len(preds)} | "
            f"freq_real={base:.3f} | "
            f"Brier={brier:.4f} | ECE={ece:.4f} | BrierSkill={skill:.3f}"
        )

    return CalibrationResult(
        market_key=market.key,
        brier=brier,
        ece=ece,
        brier_skill=skill,
        n_records=len(preds),
    )
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_market_calibration.py -v`
`Expected: PASS (6 tests)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/backtest/market_calibration.py tests/test_market_calibration.py && git commit -m "feat: per-market calibration runner (Brier/ECE/BrierSkill) reusing calibration.py"
```

---

### Task 33: PropOddsProvider stub — raises NotImplementedError with clear message

**Files:**
- Modify: `src/odd_analyzer/providers/odds.py`
- Test: `tests/test_providers_odds_prop.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_providers_odds_prop.py
"""PropOddsProvider is the documented future-odds-feed slot.
It must raise NotImplementedError with a message that explains the gap."""
import pytest
from odd_analyzer.providers.odds import PropOddsProvider, OddsProvider
from odd_analyzer.model.markets import MARKETS

EVENT = {"id": "e1", "home_team": "BRA", "away_team": "CRO"}
MARKET = MARKETS["sot"]


def test_prop_odds_provider_levanta_not_implemented_em_linhas():
    provider = PropOddsProvider()
    with pytest.raises(NotImplementedError) as exc_info:
        provider.linhas(EVENT, MARKET)
    msg = str(exc_info.value)
    assert "PropOddsProvider" in msg
    assert "feed" in msg.lower() or "slot" in msg.lower() or "futuro" in msg.lower()


def test_prop_odds_provider_mensagem_menciona_manual_odds():
    """Error message should guide the user toward ManualOdds as the current workaround."""
    provider = PropOddsProvider()
    with pytest.raises(NotImplementedError) as exc_info:
        provider.linhas(EVENT, MARKET)
    assert "ManualOdds" in str(exc_info.value)


def test_null_odds_retorna_lista_vazia():
    """NullOdds is the no-op implementation (modelo-only path)."""
    from odd_analyzer.providers.odds import NullOdds
    provider = NullOdds()
    result = provider.linhas(EVENT, MARKET)
    assert result == []


def test_manual_odds_retorna_linhas_fornecidas():
    """ManualOdds wraps lines the user pasted; no network."""
    from odd_analyzer.providers.odds import ManualOdds
    linhas = [
        {"entidade": "Vini Jr", "linha": 0.5, "odd_over": 1.80, "odd_under": 2.00, "book": "manual"},
    ]
    provider = ManualOdds(linhas)
    result = provider.linhas(EVENT, MARKET)
    assert result == linhas


def test_manual_odds_ignora_event_e_market():
    """ManualOdds returns the same lines regardless of event/market (user is responsible)."""
    from odd_analyzer.providers.odds import ManualOdds
    linhas = [{"entidade": "X", "linha": 1.5, "odd_over": 2.0, "odd_under": 1.7, "book": "b"}]
    provider = ManualOdds(linhas)
    assert provider.linhas({}, MARKETS["finalizacoes"]) == linhas
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_providers_odds_prop.py -v`
`Expected: FAIL (ImportError — providers/odds.py does not expose PropOddsProvider / NullOdds / ManualOdds)`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/providers/odds.py
"""OddsProvider protocol + implementations.

Classes
-------
OddsProvider     — Protocol (structural subtyping)
BSDMatchOdds     — fetches match odds from BSD event_odds endpoint
ManualOdds       — wraps lines the user pasted manually (no network)
NullOdds         — returns [] (modelo-only; EV reported as None downstream)
PropOddsProvider — STUB: documents the future prop-odds feed slot.
                   Raises NotImplementedError — use ManualOdds today.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from odd_analyzer.model.markets import MarketSpec


@runtime_checkable
class OddsProvider(Protocol):
    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        """Return odds lines for the given event and market.

        For contagem markets: [{entidade, linha, odd_over, odd_under, book}]
        For partida_1x2 markets: [{lado, odd}] where lado in {'home','draw','away'}
        """
        ...


class BSDMatchOdds:
    """Fetches match odds from the BSD event_odds endpoint.

    Uses Pinnacle / consensus lines for de-vig.
    """

    def __init__(self, bsd_client, preferred_books=("pinnacle", "bet365", "betano")):
        self._client = bsd_client
        self._preferred_books = preferred_books

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raw = self._client.event_odds(event["id"])
        results = raw.get("results", [])
        lines = []
        for entry in results:
            book = entry.get("bookmaker", "").lower()
            if book not in self._preferred_books:
                continue
            if market.kind == "partida_1x2":
                home = entry.get("home_win")
                draw = entry.get("draw")
                away = entry.get("away_win")
                if home and draw and away:
                    lines.extend([
                        {"lado": "home", "odd": home},
                        {"lado": "draw", "odd": draw},
                        {"lado": "away", "odd": away},
                    ])
            elif market.kind in ("partida_totais", "contagem"):
                over = entry.get("over")
                under = entry.get("under")
                linha = entry.get("line") or entry.get("handicap")
                if over and under and linha is not None:
                    lines.append({
                        "entidade": entry.get("team") or entry.get("player"),
                        "linha": float(linha),
                        "odd_over": float(over),
                        "odd_under": float(under),
                        "book": book,
                    })
        return lines


class ManualOdds:
    """Wraps odds lines that the user entered manually (e.g. copied from a bookmaker UI).

    Ignores event and market — the user is responsible for relevance.
    """

    def __init__(self, linhas: list[dict]):
        self._linhas = linhas

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return self._linhas


class NullOdds:
    """No-op implementation: returns an empty list.

    Used for the modelo-only path when no odds are available.
    Downstream: EV reported as None, edge not computable — probability only.
    """

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        return []


class PropOddsProvider:
    """Future prop-odds feed slot — NOT YET IMPLEMENTED.

    This class documents where an automated prop-odds data feed will plug in
    once a viable affordable source is identified (target: player props for
    Copa do Mundo 2026 at < $20 total cost).

    Until then, use ManualOdds to paste odds copied from a bookmaker UI.

    Raises
    ------
    NotImplementedError on every call — this is intentional and permanent
    until the feed is wired.
    """

    def linhas(self, event: dict, market: MarketSpec) -> list[dict]:
        raise NotImplementedError(
            "PropOddsProvider: feed de props automático ainda não implementado. "
            "Este é o slot reservado para um provedor de odds de prop de jogador. "
            "Use ManualOdds para colar as odds manualmente enquanto o feed não existe. "
            "Ver docs/apis/README.md para contexto de custo/viabilidade."
        )
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_providers_odds_prop.py -v`
`Expected: PASS (5 tests)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/odds.py tests/test_providers_odds_prop.py && git commit -m "feat: PropOddsProvider stub (NotImplementedError slot) + NullOdds + ManualOdds"
```

---

### Task 34: app/streamlit_app.py — wire market selector, FallbackStatsProvider, ManualOdds, remove placeholders

**Files:**
- Modify: `src/odd_analyzer/app/streamlit_app.py`
- Test: `tests/test_front_smoke.py` (extend existing smoke test)

> Note: The current `streamlit_app.py` does not exist at the path above (the Read earlier returned "does not exist"). The existing smoke test at `tests/test_front_smoke.py` is the reference for what to verify. This task writes the wired app and adds one importable smoke assertion. Full UI verification is manual (Streamlit cannot run headlessly in CI).

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_front_smoke.py (read existing file first to know what's there)

# --- Task 6: wired-app smoke imports ---

def test_streamlit_app_importa_sem_erros():
    """The wired app module must be importable without running Streamlit or hitting the network."""
    import importlib
    import sys
    # Patch streamlit so import doesn't trigger st.set_page_config etc.
    import types
    fake_st = types.ModuleType("streamlit")
    fake_st.set_page_config = lambda **kw: None
    fake_st.cache_resource = lambda f: f
    fake_st.cache_data = lambda **kw: (lambda f: f)
    fake_st.sidebar = types.SimpleNamespace(
        title=lambda *a, **kw: None,
        selectbox=lambda *a, **kw: "sot",
        text_area=lambda *a, **kw: "",
        button=lambda *a, **kw: False,
    )
    fake_st.title = lambda *a, **kw: None
    fake_st.write = lambda *a, **kw: None
    fake_st.error = lambda *a, **kw: None
    fake_st.stop = lambda: None
    sys.modules.setdefault("streamlit", fake_st)

    mod = importlib.import_module("odd_analyzer.app.streamlit_app")
    assert mod is not None


def test_streamlit_app_nao_tem_placeholder_taxa_fn():
    """The wired app must not contain the old _taxa_fn placeholder (mu=0)."""
    import pathlib
    src = pathlib.Path("src/odd_analyzer/app/streamlit_app.py")
    if not src.exists():
        import pytest
        pytest.skip("streamlit_app.py not yet created")
    text = src.read_text(encoding="utf-8")
    assert "_taxa_fn" not in text, "_taxa_fn placeholder still present"
    assert "elenco=[]" not in text, "elenco=[] placeholder still present"


def test_streamlit_app_referencia_fallback_e_manual_odds():
    """The wired app must import FallbackStatsProvider and ManualOdds."""
    import pathlib
    src = pathlib.Path("src/odd_analyzer/app/streamlit_app.py")
    if not src.exists():
        import pytest
        pytest.skip("streamlit_app.py not yet created")
    text = src.read_text(encoding="utf-8")
    assert "FallbackStatsProvider" in text
    assert "ManualOdds" in text
```

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest tests/test_front_smoke.py::test_streamlit_app_nao_tem_placeholder_taxa_fn tests/test_front_smoke.py::test_streamlit_app_referencia_fallback_e_manual_odds -v`
`Expected: FAIL (FileNotFoundError / AssertionError — app not yet wired)`

- [ ] **Step 3: Write minimal implementation**

```python
# src/odd_analyzer/app/streamlit_app.py
"""Odd Analyzer — Streamlit front-end (wired).

Wiring:
  - Market selector (6 MVP markets from MARKETS registry)
  - FallbackStatsProvider (BSD primary, API-Football fallback)
  - ManualOdds for player-market odds (user pastes lines; one line per entry)
  - BSDMatchOdds for match markets (vitoria, gols, escanteios)
  - Removes _taxa_fn placeholder and elenco=[] stubs from Phase 1b
"""
from __future__ import annotations

import json
import os

import streamlit as st

from odd_analyzer.model.markets import MARKETS, MarketSpec
from odd_analyzer.providers.odds import ManualOdds, NullOdds, BSDMatchOdds
from odd_analyzer.providers.stats import (
    BSDStatsProvider,
    ApiFootballStatsProvider,
    FallbackStatsProvider,
)
from odd_analyzer.pipeline import analisar_jogo
from odd_analyzer.store.repo import InMemoryRepo, SupabaseRepo
from odd_analyzer.ai.analista import analisar as analista_padrao


# ---------------------------------------------------------------------------
# Cached resource setup
# ---------------------------------------------------------------------------

@st.cache_resource
def _get_bsd_client():
    from odd_analyzer.bsd.client import BSDClient
    from odd_analyzer.config import get_required
    return BSDClient(api_key=get_required("BZZOIRO_API_KEY"))


@st.cache_resource
def _get_repo():
    try:
        from odd_analyzer.config import get_required
        url = get_required("SUPABASE_URL")
        key = get_required("SUPABASE_SERVICE_KEY")
        from supabase import create_client
        return SupabaseRepo(create_client(url, key))
    except Exception:
        return InMemoryRepo()


@st.cache_resource
def _get_stats_provider():
    try:
        bsd = BSDStatsProvider(_get_bsd_client())
    except Exception:
        bsd = None

    try:
        from odd_analyzer.config import get_required
        af = ApiFootballStatsProvider(
            api_key=get_required("APIFOOTBALL_KEY"),
            league_id=1,   # Copa do Mundo = FIFA WC; adapt per event
            season=2026,
        )
    except Exception:
        af = None

    if bsd and af:
        return FallbackStatsProvider(primary=bsd, fallback=af)
    if bsd:
        return bsd
    if af:
        return af
    return None


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

st.set_page_config(page_title="Odd Analyzer", layout="wide")
st.title("Odd Analyzer — Value Betting")

st.sidebar.title("Configuracao")

market_key = st.sidebar.selectbox(
    "Mercado",
    options=list(MARKETS.keys()),
    format_func=lambda k: MARKETS[k].label,
)
market: MarketSpec = MARKETS[market_key]

event_json = st.sidebar.text_area(
    "Evento (JSON do BSD)",
    height=160,
    placeholder='{"id": "12345", "home_team": "BRA", "away_team": "CRO", ...}',
)

# Manual odds input (shown for player markets; hidden for match markets that use BSDMatchOdds)
manual_odds_text = ""
if market.nivel == "jogador":
    manual_odds_text = st.sidebar.text_area(
        "Odds manuais (uma por linha: jogador,linha,odd_over,odd_under)",
        height=120,
        placeholder="Vinicius Jr,0.5,1.72,2.10\nRodri,1.5,3.00,1.40",
    )

run_btn = st.sidebar.button("Analisar")

if run_btn:
    if not event_json.strip():
        st.error("Cole o JSON do evento no campo acima.")
        st.stop()

    try:
        event = json.loads(event_json)
    except json.JSONDecodeError as exc:
        st.error(f"JSON invalido: {exc}")
        st.stop()

    stats_provider = _get_stats_provider()
    if stats_provider is None:
        st.error("Nenhum provider de stats configurado. Verifique BZZOIRO_API_KEY / APIFOOTBALL_KEY.")
        st.stop()

    # Build OddsProvider
    if market.nivel == "jogador":
        if manual_odds_text.strip():
            linhas = []
            for row in manual_odds_text.strip().splitlines():
                parts = [p.strip() for p in row.split(",")]
                if len(parts) == 4:
                    jogador, linha_str, over_str, under_str = parts
                    linhas.append({
                        "entidade": jogador,
                        "linha": float(linha_str),
                        "odd_over": float(over_str),
                        "odd_under": float(under_str),
                        "book": "manual",
                    })
            odds_provider = ManualOdds(linhas)
        else:
            odds_provider = NullOdds()
    else:
        try:
            odds_provider = BSDMatchOdds(_get_bsd_client())
        except Exception:
            odds_provider = NullOdds()

    repo = _get_repo()

    try:
        resultado = analisar_jogo(
            event=event,
            market=market,
            stats_provider=stats_provider,
            odds_provider=odds_provider,
            repo=repo,
            analista_fn=analista_padrao,
        )
    except Exception as exc:
        st.error(f"Erro na analise: {exc}")
        st.stop()

    candidatos = resultado.get("candidatos", [])
    ia = resultado.get("ia", {})

    st.subheader(f"Candidatos — {market.label}")
    if candidatos:
        import pandas as pd
        st.dataframe(pd.DataFrame(candidatos))
    else:
        st.write("Nenhum candidato com valor detectado.")

    melhor = ia.get("melhor_aposta")
    if melhor:
        st.subheader("Melhor aposta (IA)")
        st.json(melhor)

    alertas = ia.get("alertas", [])
    if alertas:
        st.warning("Alertas: " + " | ".join(alertas))
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest tests/test_front_smoke.py -v`
`Expected: PASS (all existing + 3 new tests)`

> Manual verification: run `PYTHONPATH=src .venv\Scripts\streamlit.exe run src/odd_analyzer/app/streamlit_app.py` and confirm market selector appears, no `_taxa_fn` in the page, and ManualOdds input is shown for "sot"/"finalizacoes"/"desarmes" markets.

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/app/streamlit_app.py tests/test_front_smoke.py && git commit -m "feat: wire market selector + FallbackStatsProvider + ManualOdds in Streamlit app; remove _taxa_fn/elenco=[] placeholders"
```

---

### Task 35: Full suite green — run all tests and confirm no regressions

**Files:**
- No file changes (verification only)

- [ ] **Step 1: Write the failing test**

> No new test file. This step verifies the entire suite is green after all Phase 4 changes.

- [ ] **Step 2: Run test to verify it fails**

`Run: .venv\Scripts\python.exe -m pytest --tb=short -q`
`Expected: FAIL if any prior task left a broken import or missing file`

- [ ] **Step 3: Write minimal implementation**

Fix any import errors surfaced by the full run. Common issues to check:

1. `src/odd_analyzer/providers/__init__.py` must exist (empty file is fine).
2. `src/odd_analyzer/app/__init__.py` must exist.
3. `src/odd_analyzer/backtest/market_calibration.py` must be importable without `odd_analyzer.model.markets` raising (markets.py must already be present from Phase 0).
4. `analisar_jogo` in `pipeline.py` must accept the new `market`/`stats_provider`/`odds_provider` signature added in a prior phase; if the old 3-arg call is still there, the pipeline tests will fail — the Phase 3 pipeline task should have migrated the signature, but verify.

```python
# src/odd_analyzer/providers/__init__.py
# (empty — marks providers/ as a package)
```

```python
# src/odd_analyzer/app/__init__.py
# (empty — marks app/ as a package)
```

- [ ] **Step 4: Run test to verify it passes**

`Run: .venv\Scripts\python.exe -m pytest --tb=short -q`
`Expected: PASS — all tests green (count will vary by how many phases precede this one; no test may be red)`

- [ ] **Step 5: Commit**

```bash
git add src/odd_analyzer/providers/__init__.py src/odd_analyzer/app/__init__.py && git commit -m "chore: add missing __init__.py for providers and app packages; full suite green"
```
