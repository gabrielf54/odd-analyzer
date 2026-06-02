import os
from dotenv import load_dotenv

load_dotenv()

def get_required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value
