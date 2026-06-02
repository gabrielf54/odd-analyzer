"""IA analista: lê o dossiê pronto e recomenda a melhor aposta. NUNCA calcula
número nem inventa fato. Saída validada por schema; inválida -> 1 retry ->
fail-closed (sem recomendação)."""
import json
from odd_analyzer.ai.openrouter import chat as _default_chat
from odd_analyzer.ai.schema import validate_ia_output

PROMPT_SISTEMA = (
    "Você é um analista de apostas conservador. Recebe um JSON com candidatos já "
    "calculados em código (prob_modelo, prob_devig, edge, ev, etc.). REGRAS: "
    "use SOMENTE os números fornecidos; NUNCA invente número, estatística ou lesão; "
    "só marque veredito 'APOSTAR' quando edge>0 E ev for claramente positivo E "
    "xi_confirmado=true E amostra_jogos suficiente; compare e escolha a MELHOR aposta; "
    "na dúvida, não recomende (melhor_aposta=null); explique em 1-2 frases ancoradas "
    "SÓ nos campos recebidos. Responda APENAS JSON no formato: "
    '{"melhor_aposta": {"jogador","linha","veredito","confianca","motivo"} ou null, '
    '"outras": [], "alertas": []}. veredito ∈ {APOSTAR,NAO_APOSTAR,PASSAR}; '
    "confianca ∈ {alta,media,baixa}."
)

def _parse(texto: str):
    try:
        return json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        return None

def analisar(candidatos: list[dict], contexto: dict, _chat=_default_chat) -> dict:
    user = json.dumps({"contexto": contexto, "candidatos": candidatos}, ensure_ascii=False)
    messages = [{"role": "system", "content": PROMPT_SISTEMA},
                {"role": "user", "content": user}]
    for _ in range(2):  # 1 tentativa + 1 retry
        obj = _parse(_chat(messages, temperature=0.0))
        if obj is not None and validate_ia_output(obj, candidatos):
            return obj
    return {"melhor_aposta": None, "outras": [],
            "alertas": ["IA não produziu saída válida (fail-closed)."]}
