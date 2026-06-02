import json
from odd_analyzer.ai.analista import analisar

CANDS = [{"jogador": "Vinicius Jr", "linha": 0.5, "odd": 1.72, "prob_modelo": 0.68,
          "prob_devig": 0.62, "edge": 0.06, "ev": 0.17, "lambda": 1.9,
          "minutos_esperados": 88, "xi_confirmado": True, "amostra_jogos": 24,
          "sot_concedido_adversario": "alto", "incerteza": "media"}]

def _saida_ok():
    return json.dumps({
        "melhor_aposta": {"jogador": "Vinicius Jr", "linha": 0.5, "veredito": "APOSTAR",
                          "confianca": "alta", "motivo": "edge +6pp, EV +17%"},
        "outras": [], "alertas": []})

def test_analisar_saida_valida():
    out = analisar(CANDS, {"jogo": "BRA x CRO"}, _chat=lambda msgs, **kw: _saida_ok())
    assert out["melhor_aposta"]["jogador"] == "Vinicius Jr"

def test_retry_em_json_quebrado_depois_ok():
    chamadas = [" not json ", _saida_ok()]
    def fake_chat(msgs, **kw): return chamadas.pop(0)
    out = analisar(CANDS, {"jogo": "x"}, _chat=fake_chat)
    assert out["melhor_aposta"]["jogador"] == "Vinicius Jr"

def test_fail_closed_se_invalido_duas_vezes():
    def fake_chat(msgs, **kw): return "{ ainda quebrado"
    out = analisar(CANDS, {"jogo": "x"}, _chat=fake_chat)
    assert out["melhor_aposta"] is None
    assert out["alertas"]  # tem alerta de falha

def test_fail_closed_se_jogador_inventado():
    saida = json.dumps({"melhor_aposta": {"jogador": "Neymar", "linha": 0.5,
        "veredito": "APOSTAR", "confianca": "alta", "motivo": "x"}, "outras": [], "alertas": []})
    out = analisar(CANDS, {"jogo": "x"}, _chat=lambda m, **kw: saida)
    assert out["melhor_aposta"] is None

def test_passa_candidatos_no_prompt():
    capt = {}
    def fake_chat(msgs, **kw):
        capt["msgs"] = msgs; return _saida_ok()
    analisar(CANDS, {"jogo": "BRA x CRO"}, _chat=fake_chat)
    user_msg = capt["msgs"][-1]["content"]
    assert "Vinicius Jr" in user_msg and "BRA x CRO" in user_msg
