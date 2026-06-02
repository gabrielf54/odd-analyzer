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
