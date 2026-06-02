"""Camada de persistência. Interface Repo com duas implementações: InMemoryRepo
(testes offline) e SupabaseRepo (Postgres hospedado). CLV = odd_flag/odd_fech - 1."""
from abc import ABC, abstractmethod

def clv(odd_flag: float, odd_fechamento: float) -> float:
    """Closing Line Value: positivo = peguei preço melhor que o fechamento."""
    return odd_flag / odd_fechamento - 1.0

class Repo(ABC):
    @abstractmethod
    def save_analise(self, event_id: str, payload: dict) -> None: ...
    @abstractmethod
    def get_analise(self, event_id: str) -> dict | None: ...
    @abstractmethod
    def save_ledger(self, rows: list[dict]) -> None: ...
    @abstractmethod
    def update_fechamento(self, event_id: str, jogador: str, linha: float,
                          odd_fechamento: float, resultado: int) -> None: ...

class InMemoryRepo(Repo):
    def __init__(self):
        self.analises: dict[str, dict] = {}
        self.ledger: list[dict] = []
    def save_analise(self, event_id, payload):
        self.analises[event_id] = payload
    def get_analise(self, event_id):
        return self.analises.get(event_id)
    def save_ledger(self, rows):
        self.ledger.extend(rows)
    def update_fechamento(self, event_id, jogador, linha, odd_fechamento, resultado):
        for row in self.ledger:
            if (row["event_id"], row["jogador"], row["linha"]) == (event_id, jogador, linha):
                row["odd_fechamento"] = odd_fechamento
                row["resultado"] = resultado
                row["clv"] = clv(row["odd_flag"], odd_fechamento)
                break  # 1 registro por tripla (garantido pela constraint unique no schema)

class SupabaseRepo(Repo):
    """Persiste no Supabase. Tabelas em store/schema.sql (rodar uma vez no SQL editor)."""
    def __init__(self, client=None):
        if client is None:
            from supabase import create_client
            from odd_analyzer.config import get_required
            client = create_client(get_required("SUPABASE_URL"),
                                   get_required("SUPABASE_SERVICE_KEY"))
        self._client = client
    def save_analise(self, event_id, payload):
        self._client.table("analises").upsert({"event_id": event_id, **payload}).execute()
    def get_analise(self, event_id):
        r = self._client.table("analises").select("*").eq("event_id", event_id).execute()
        return r.data[0] if r.data else None
    def save_ledger(self, rows):
        if rows:
            self._client.table("paper_ledger").insert(rows).execute()
    def update_fechamento(self, event_id, jogador, linha, odd_fechamento, resultado):
        sel = (self._client.table("paper_ledger").select("odd_flag")
               .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha).execute())
        if not sel.data:
            return
        if len(sel.data) > 1:
            raise RuntimeError(f"paper_ledger com linhas duplicadas para ({event_id}, {jogador}, {linha})")
        c = clv(sel.data[0]["odd_flag"], odd_fechamento)
        (self._client.table("paper_ledger")
         .update({"odd_fechamento": odd_fechamento, "resultado": resultado, "clv": c})
         .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha).execute())
