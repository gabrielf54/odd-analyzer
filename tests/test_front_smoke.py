import importlib
import pytest


def test_app_importa():
    pytest.importorskip("streamlit")
    # import não deve executar a UI nem exigir env vars
    mod = importlib.import_module("app.streamlit_app")
    assert hasattr(mod, "render")
