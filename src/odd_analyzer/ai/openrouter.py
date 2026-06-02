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
