"""Valida a saída da IA SEM biblioteca externa. Garante estrutura E que a IA
não inventou jogador/linha fora dos candidatos recebidos (anti-alucinação)."""

_VEREDITOS = {"APOSTAR", "NAO_APOSTAR", "PASSAR"}
_CONFIANCAS = {"alta", "media", "baixa"}

def _aposta_valida(ap: dict, chaves_validas: set) -> bool:
    obrig = {"jogador", "linha", "veredito", "confianca", "motivo"}
    if not isinstance(ap, dict) or not obrig.issubset(ap):
        return False
    if ap["veredito"] not in _VEREDITOS or ap["confianca"] not in _CONFIANCAS:
        return False
    return (ap["jogador"], ap["linha"]) in chaves_validas

def validate_ia_output(obj, candidatos: list[dict]) -> bool:
    if not isinstance(obj, dict):
        return False
    if not {"melhor_aposta", "outras", "alertas"}.issubset(obj):
        return False
    if not isinstance(obj["outras"], list) or not isinstance(obj["alertas"], list):
        return False
    chaves = {(c["jogador"], c["linha"]) for c in candidatos}
    if obj["melhor_aposta"] is not None and not _aposta_valida(obj["melhor_aposta"], chaves):
        return False
    return all(_aposta_valida(o, chaves) for o in obj["outras"])
