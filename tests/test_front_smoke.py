"""Smoke: o módulo do app importa sem quebrar e expõe as funções de tela.
Streamlit não é testado pixel-a-pixel; a lógica está em service.py (testada)."""
import importlib.util
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app" / "streamlit_app.py"

def test_app_importa_sem_erro():
    spec = importlib.util.spec_from_file_location("streamlit_app", APP)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # não deve levantar; render() só roda sob runtime do streamlit
    assert hasattr(mod, "render")
    assert hasattr(mod, "tela_lista") and hasattr(mod, "tela_analise")
