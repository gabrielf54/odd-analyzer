import time
import json
import hashlib
from pathlib import Path
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

def test_should_cache_falso_nao_grava(tmp_path):
    # resposta de erro/limite nao deve poluir o cache -> refaz na proxima
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"errors": {"requests": "limit"}}
    a = cached_get("k", fetch, cache_dir=tmp_path, should_cache=lambda d: not d.get("errors"))
    b = cached_get("k", fetch, cache_dir=tmp_path, should_cache=lambda d: not d.get("errors"))
    assert a == b == {"errors": {"requests": "limit"}}
    assert chamadas["n"] == 2  # nao cacheou; buscou de novo


def test_ttl_expirado_refaz_fetch(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"t": chamadas["n"]}
    a = cached_get("ttl-key", fetch, cache_dir=tmp_path, ttl_seconds=0)
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
    assert chamadas["n"] == 1

def test_source_namespace_separa_caches(tmp_path):
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
    assert chamadas["n"] == 1

def test_retrocompat_default_source_nao_quebra(tmp_path):
    chamadas = {"n": 0}
    def fetch():
        chamadas["n"] += 1
        return {"v": chamadas["n"]}
    cached_get("compat-key", fetch, cache_dir=tmp_path)
    cached_get("compat-key", fetch, cache_dir=tmp_path)
    assert chamadas["n"] == 1
