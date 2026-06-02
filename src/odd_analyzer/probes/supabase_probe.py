from odd_analyzer.config import get_required


def check_connection() -> bool:
    """Tenta conectar no Supabase. Retorna True se o cliente inicializa com as creds."""
    from supabase import create_client
    url = get_required("SUPABASE_URL")
    key = get_required("SUPABASE_SERVICE_KEY")
    client = create_client(url, key)
    return client is not None
