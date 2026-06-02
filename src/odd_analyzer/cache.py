import json
import hashlib
from pathlib import Path

_DEFAULT_DIR = Path(__file__).resolve().parents[2] / ".cache_api"

def cached_get(key: str, fetch, cache_dir: Path | None = None):
    """Retorna do cache local se existir; senão chama fetch(), grava e retorna.
    `key` identifica a chamada (ex.: a URL completa com params)."""
    d = Path(cache_dir) if cache_dir is not None else _DEFAULT_DIR
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    path = d / f"{h}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    data = fetch()
    d.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data
