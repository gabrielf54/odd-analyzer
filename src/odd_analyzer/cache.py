import json
import time
import hashlib
from pathlib import Path

_DEFAULT_DIR = Path(__file__).resolve().parents[2] / ".cache_api"

def cached_get(key: str, fetch, cache_dir: Path | None = None,
               ttl_seconds: float | None = None, source: str = "default",
               should_cache=None):
    """Retorna do cache local se existir e válido; senão chama fetch(), grava e retorna.

    key          identifica a chamada (ex.: URL completa com params).
    ttl_seconds  None = eterno; 0 = sempre expira; > 0 = segundos de validade.
    source       namespace de subdiretório (ex.: 'bsd', 'apifootball', 'default').
    should_cache opcional: se retornar False, NAO grava (ex.: resposta de erro).
    Envelope em disco: {"data": <payload>, "cached_at": <unix timestamp float>}.
    """
    base = Path(cache_dir) if cache_dir is not None else _DEFAULT_DIR
    d = base / source
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    path = d / f"{h}.json"

    if path.exists():
        try:
            envelope = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(envelope, dict) and "data" in envelope and "cached_at" in envelope:
                cached_at = envelope["cached_at"]
                data = envelope["data"]
                if ttl_seconds is None or (time.time() - cached_at) < ttl_seconds:
                    return data
            else:
                # Backward-compat: arquivo no formato antigo (payload direto, sem envelope)
                if ttl_seconds is None:
                    return envelope
        except (json.JSONDecodeError, KeyError):
            pass

    data = fetch()
    if should_cache is None or should_cache(data):
        d.mkdir(parents=True, exist_ok=True)
        envelope = {"data": data, "cached_at": time.time()}
        path.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
    return data
