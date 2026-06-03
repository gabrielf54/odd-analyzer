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
                          market_type: str | None,
                          odd_fechamento: float, resultado: int) -> None: ...
    @abstractmethod
    def save_crosswalk(self, id_canonico: int, nome_normalizado: str,
                       fontes_ids: dict, confianca: float,
                       verificado_manual: bool = False) -> None: ...
    @abstractmethod
    def get_crosswalk(self, id_canonico: int) -> dict | None: ...
    @abstractmethod
    def snapshot_fechamento(self, event_id: str, jogador: str, linha: float,
                            market_type: str | None, odd_fechamento: float) -> None: ...

class InMemoryRepo(Repo):
    def __init__(self):
        self.analises: dict[str, dict] = {}
        self.ledger: list[dict] = []
        self.crosswalk: dict[int, dict] = {}

    def save_analise(self, event_id, payload):
        self.analises[event_id] = payload

    def get_analise(self, event_id):
        return self.analises.get(event_id)

    def save_ledger(self, rows):
        self.ledger.extend(rows)

    def update_fechamento(self, event_id, jogador, linha, market_type,
                          odd_fechamento, resultado):
        for row in self.ledger:
            base_match = (row["event_id"], row["jogador"], row["linha"]) == (event_id, jogador, linha)
            if not base_match:
                continue
            if market_type is not None and row.get("market_type") != market_type:
                continue
            row["odd_fechamento"] = odd_fechamento
            row["resultado"] = resultado
            row["clv"] = clv(row["odd_flag"], odd_fechamento)
            break

    def save_crosswalk(self, id_canonico, nome_normalizado, fontes_ids, confianca,
                       verificado_manual=False):
        self.crosswalk[id_canonico] = {
            "id_canonico": id_canonico, "nome_normalizado": nome_normalizado,
            "fontes_ids": fontes_ids, "confianca": confianca,
            "verificado_manual": verificado_manual,
        }

    def get_crosswalk(self, id_canonico):
        return self.crosswalk.get(id_canonico)

    def snapshot_fechamento(self, event_id, jogador, linha, market_type, odd_fechamento):
        for row in self.ledger:
            if (row["event_id"], row["jogador"], row["linha"]) != (event_id, jogador, linha):
                continue
            if market_type is not None and row.get("market_type") != market_type:
                continue
            row["odd_fechamento"] = odd_fechamento
            row["clv"] = clv(row["odd_flag"], odd_fechamento)
            break

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

    def update_fechamento(self, event_id, jogador, linha, market_type,
                          odd_fechamento, resultado):
        q = (self._client.table("paper_ledger").select("odd_flag")
             .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha))
        if market_type is not None:
            q = q.eq("market_type", market_type)
        sel = q.execute()
        if not sel.data:
            return
        if len(sel.data) > 1:
            raise RuntimeError(
                f"paper_ledger com linhas duplicadas para ({event_id}, {jogador}, {linha}, {market_type})"
            )
        c = clv(sel.data[0]["odd_flag"], odd_fechamento)
        upd = self._client.table("paper_ledger").update(
            {"odd_fechamento": odd_fechamento, "resultado": resultado, "clv": c}
        ).eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha)
        if market_type is not None:
            upd = upd.eq("market_type", market_type)
        upd.execute()

    def save_crosswalk(self, id_canonico, nome_normalizado, fontes_ids, confianca,
                       verificado_manual=False):
        self._client.table("jogadores_crosswalk").upsert({
            "id_canonico": id_canonico, "nome_normalizado": nome_normalizado,
            "fontes_ids": fontes_ids, "confianca": confianca,
            "verificado_manual": verificado_manual,
        }).execute()

    def get_crosswalk(self, id_canonico):
        r = (self._client.table("jogadores_crosswalk").select("*")
             .eq("id_canonico", id_canonico).execute())
        return r.data[0] if r.data else None

    def snapshot_fechamento(self, event_id, jogador, linha, market_type, odd_fechamento):
        sel = (self._client.table("paper_ledger").select("odd_flag")
               .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha))
        if market_type is not None:
            sel = sel.eq("market_type", market_type)
        data = sel.execute().data
        if not data:
            return
        c = clv(data[0]["odd_flag"], odd_fechamento)
        upd = (self._client.table("paper_ledger")
               .update({"odd_fechamento": odd_fechamento, "clv": c})
               .eq("event_id", event_id).eq("jogador", jogador).eq("linha", linha))
        if market_type is not None:
            upd = upd.eq("market_type", market_type)
        upd.execute()
