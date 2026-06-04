"""The Odds API v4: lista de eventos (0 créditos), props de SOT por jogador e
mercados de PARTIDA (totals=gols, h2h=1X2 — confirmados na key free p/ a Copa).
parse_* agrupam Over/Under (ou outcomes 1X2) em registros prontos pro pipeline."""
import unicodedata
import requests
from odd_analyzer.config import get_required
from odd_analyzer.cache import cached_get

BASE = "https://api.the-odds-api.com/v4"
SOT_MARKET = "player_shots_on_target"
# market.key (nosso) → market key do The Odds API. Só mercados de PARTIDA: props de
# jogador NÃO existem barato (ver follow-up odds-prop-jogador). Escanteios voltam
# vazios na Copa (alternate_totals_corners sem casas) → fora por ora.
ODDSAPI_MATCH_MARKET = {"gols": "totals", "vitoria": "h2h"}

def _get(path: str, params: dict, should_cache=lambda d: bool(d)) -> object:
    key = get_required("THE_ODDS_API_KEY")
    p = dict(params, apiKey=key)
    keystr = f"{path}?{sorted((k, v) for k, v in p.items() if k != 'apiKey')}"
    def fetch():
        r = requests.get(f"{BASE}/{path}", params=p, timeout=30)
        r.raise_for_status()
        return r.json()
    return cached_get(keystr, fetch, should_cache=should_cache)

def _tem_props(odds: dict) -> bool:
    """Só vale cachear odds que já tenham casas/props. O cache local não tem TTL,
    então cravar uma resposta VAZIA (props ainda não postadas pré-kickoff) esconderia
    as props quando surgissem. Sem casas -> não cacheia, reconsulta na próxima."""
    return bool(odds.get("bookmakers"))

def fetch_events(sport_key: str) -> list[dict]:
    """Eventos do esporte (0 créditos). Ex.: sport_key='soccer_fifa_world_cup'."""
    return _get(f"sports/{sport_key}/events", {})

def fetch_event_odds(sport_key: str, event_id: str,
                     markets: str = SOT_MARKET, regions: str = "us") -> dict:
    return _get(f"sports/{sport_key}/events/{event_id}/odds",
                {"markets": markets, "regions": regions, "oddsFormat": "decimal"},
                should_cache=_tem_props)

def _norm_team(name: str) -> str:
    """Normaliza nome de time p/ casar entre fontes: minúsculo, sem acento, só alfanum.
    Ex.: 'Bosnia & Herzegovina' → 'bosniaherzegovina'; "Côte d'Ivoire" → 'cotedivoire'."""
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(c for c in s.lower() if c.isalnum())


def find_event(events: list[dict], home: str, away: str) -> dict | None:
    """Acha o evento do The Odds API que casa o par (home, away) por nome normalizado.
    Order-aware: mando importa (1X2). Retorna None se não houver casamento."""
    h, a = _norm_team(home), _norm_team(away)
    for ev in events:
        if _norm_team(ev.get("home_team")) == h and _norm_team(ev.get("away_team")) == a:
            return ev
    return None


def parse_totals(event: dict) -> list[dict]:
    """Mercado 'totals' (gols O/U) → [{entidade:'partida', linha, odd_over, odd_under, book}].
    Agrupa por (casa, linha); descarta linha sem os dois lados (não dá p/ de-vig)."""
    grouped: dict[tuple, dict] = {}
    for bm in event.get("bookmakers", []):
        book = bm.get("key")
        for mk in bm.get("markets", []):
            if mk.get("key") != "totals":
                continue
            for o in mk.get("outcomes", []):
                point, name, price = o.get("point"), (o.get("name") or "").lower(), o.get("price")
                if point is None or price is None:
                    continue
                e = grouped.setdefault((book, point),
                                       {"entidade": "partida", "linha": point, "book": book,
                                        "odd_over": None, "odd_under": None})
                if name == "over":
                    e["odd_over"] = price
                elif name == "under":
                    e["odd_under"] = price
    return [l for l in grouped.values() if l["odd_over"] and l["odd_under"]]


def parse_h2h(event: dict, home: str, away: str) -> list[dict]:
    """Mercado 'h2h' (1X2) → [{entidade:'partida', linha, odd_over=home, odd_under=away,
    odd_draw, book}], um por casa. odd_draw fica disponível p/ de-vig 3-way futuro
    (o pipeline de 1X2 hoje só lê over/under — ver follow-up partida-vitoria-lines)."""
    h, a = _norm_team(home), _norm_team(away)
    out = []
    for bm in event.get("bookmakers", []):
        book = bm.get("key")
        for mk in bm.get("markets", []):
            if mk.get("key") != "h2h":
                continue
            prices = {"home": None, "away": None, "draw": None}
            for o in mk.get("outcomes", []):
                nm, price = _norm_team(o.get("name")), o.get("price")
                if nm == h:
                    prices["home"] = price
                elif nm == a:
                    prices["away"] = price
                elif "draw" in (o.get("name") or "").lower():
                    prices["draw"] = price
            if prices["home"] and prices["away"]:
                out.append({"entidade": "partida", "linha": 0.0, "book": book,
                            "odd_over": prices["home"], "odd_under": prices["away"],
                            "odd_draw": prices["draw"]})
    return out


def parse_sot_props(event: dict) -> list[dict]:
    """Agrupa outcomes Over/Under em props {player_name, line, book, odd_over, odd_under}.
    Descarta jogador/linha sem os dois lados (não dá p/ de-vig)."""
    grouped: dict[tuple, dict] = {}
    for bm in event.get("bookmakers", []):
        book = bm.get("key")
        for mk in bm.get("markets", []):
            if mk.get("key") != SOT_MARKET:
                continue
            for o in mk.get("outcomes", []):
                player, line, name, price = (o.get("description"), o.get("point"),
                                             (o.get("name") or "").lower(), o.get("price"))
                if player is None or line is None or price is None:
                    continue
                e = grouped.setdefault((book, player, line),
                                       {"player_name": player, "line": line, "book": book,
                                        "odd_over": None, "odd_under": None})
                if name == "over":
                    e["odd_over"] = price
                elif name == "under":
                    e["odd_under"] = price
    return [p for p in grouped.values() if p["odd_over"] and p["odd_under"]]
