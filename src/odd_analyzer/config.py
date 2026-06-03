import os
from pathlib import Path
from dotenv import load_dotenv

# Carrega o .env do ROOT do repo, não relativo ao CWD — senão, ao rodar
# `streamlit run app/...` (ou de qualquer outra pasta) o .env não é achado e
# BZZOIRO_API_KEY some. parents[2] de src/odd_analyzer/config.py = root do repo.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

def get_required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value
