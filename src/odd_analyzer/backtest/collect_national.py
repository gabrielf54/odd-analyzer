"""Coletor de calibração na população de SELEÇÃO (Copa).

Replica a produção em jogos de seleção JÁ JOGADOS, com recorte anti-espiada
(só jogos mais antigos que o alvo) e pool de várias ligas de seleção.
Formas reais do BSD em docs/apis/bsd-bzzoiro/examples/ (wc_*.json).
"""

NATIONAL_LEAGUES = (58, 59, 60, 61, 62, 64, 65, 66, 67, 31)
FRIENDLY_LEAGUE = 31


def games_before_target(history_desc: list[dict], target_event_id) -> list[dict]:
    """history_desc: histórico do jogador em ordem DECRESCENTE (BSD: recente primeiro),
    cada linha com 'event_id'. Devolve só os jogos ESTRITAMENTE mais antigos que o alvo,
    em ordem CRESCENTE (mais antigo primeiro) para alimentar a conta pura.
    Se o alvo não está no histórico → [] (não dá pra estabelecer 'antes' com segurança)."""
    ids = [str(r.get("event_id")) for r in history_desc]
    alvo = str(target_event_id)
    if alvo not in ids:
        return []
    idx = ids.index(alvo)
    older_desc = history_desc[idx + 1:]   # depois do alvo no DESC = mais antigos
    return list(reversed(older_desc))      # crescente
