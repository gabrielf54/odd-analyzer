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
