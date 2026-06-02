# CLAUDE.md — odd-analyzer

Guia para o Claude trabalhar neste projeto. Foco: uso do **MCP do Supabase** e boas práticas de banco.

## Supabase — contexto

- **Project ref:** `pepizcpowzhtawzjnzui` · região `us-east-1`
- **URL:** `https://pepizcpowzhtawzjnzui.supabase.co`
- Persistência fica em [src/odd_analyzer/store/repo.py](src/odd_analyzer/store/repo.py) (`SupabaseRepo`). Fonte de verdade do schema: [src/odd_analyzer/store/schema.sql](src/odd_analyzer/store/schema.sql).
- Tabelas: `analises` (cache de análise por `event_id`), `paper_ledger` (registro de apostas-papel + CLV), `jogadores_crosswalk` (mapeamento de IDs de jogador entre fontes).

## Duas chaves diferentes — não confundir

| Onde | Variável / campo | Formato | Para quê |
|------|------------------|---------|----------|
| `.env` | `SUPABASE_SERVICE_KEY` | **JWT legado** `eyJ...` (3 segmentos) | App Python (`supabase-py`) |
| `.mcp.json` | `SUPABASE_ACCESS_TOKEN` | **PAT** `sbp_...` | MCP server (Management API) |

- `supabase-py` **2.9.1** valida a key contra regex de JWT. A chave de API nova (`sb_secret_...` / `sb_publishable_...`) é rejeitada com `SupabaseException: Invalid API key`. Use o **service_role legado** (`eyJ...`, aba "Legacy API keys" do dashboard) no `.env`. (Alternativa: atualizar `supabase-py`.)
- O MCP **não** usa o service_role; usa um **Personal Access Token** (`sbp_...`, em Account → Access Tokens).

## MCP do Supabase

- Configurado em `.mcp.json` (server `supabase`, pacote `@supabase/mcp-server-supabase`), escopo do projeto.
- **Modo read-write** (sem `--read-only`): expõe escrita — `apply_migration`, `execute_sql`, `deploy_edge_function`, `create_branch`/`merge_branch`/`reset_branch`/`rebase_branch`.
- Windows: roda via `cmd /c npx`.
- Para carregar/aprovar na sessão: `/mcp`.

### Boas práticas de uso

1. **Olhe antes de mexer.** Antes de qualquer mudança, use `list_tables`, `list_migrations`, `get_advisors`, `get_logs` para entender o estado atual.
2. **DDL via `apply_migration`, não `execute_sql`.** `apply_migration` registra a migration (nome descritivo, ex.: `create_analises_table`). Use `execute_sql` só para leitura/consulta ad-hoc.
3. **`schema.sql` é a fonte de verdade.** Toda mudança de schema aplicada no banco deve ser refletida em [schema.sql](src/odd_analyzer/store/schema.sql) no mesmo commit — não deixe o arquivo divergir do banco.
4. **Rode `get_advisors` depois de mudar schema** (lints de segurança e performance — RLS faltando, índices, etc.) e trate o que aparecer.
5. **Confirme antes de destrutivo.** `DROP`, `DELETE`, `TRUNCATE`, `reset_branch` — pare e confirme com o usuário antes. Prefira `create_branch` para mudanças arriscadas e só faça `merge_branch` após validar.
6. **Não exponha segredos.** `.env` e `.mcp.json` estão no `.gitignore` — mantenha assim. Nunca cole PAT/service_role em commits, logs ou mensagens.

## Geral

- Python: ambiente em `.venv`. Código em `src/odd_analyzer/`, testes em `tests/`. Rode `.venv\Scripts\python.exe -m pytest`.
- Config/segredos via `odd_analyzer.config.get_required(NOME)` (lê `.env` com `python-dotenv`); levanta erro se ausente.
- O projeto tem `InMemoryRepo` para testes offline — não precisa de Supabase para a suíte de testes.
