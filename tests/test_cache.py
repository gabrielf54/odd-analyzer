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
