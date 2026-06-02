# CLAUDE.md — odd-analyzer

Guia para o Claude trabalhar neste projeto. **Leia a seção "Produto" primeiro** — ela define a mentalidade que todo trabalho aqui deve ter. Depois: boas práticas de banco (**MCP do Supabase**).

## Produto — o que é e como pensa

**Em uma frase:** para um jogo escolhido, o sistema compara a **probabilidade do nosso modelo** (calculada em **código**) com a **odd da casa sem a margem** (de-vig) e **só sinaliza quando o modelo está claramente à frente**. A IA escreve a explicação em linguagem natural — **nunca inventa o número**.

**Princípio inegociável — o que é "valor":**
- Valor = `prob_modelo > prob_justa_da_casa_sem_margem`. Filtra-se por **EV/edge positivo**.
- **NUNCA** se filtra por "probabilidade alta". Selecionar favoritos (prob ≥ 0.75) escolhe odds eficientemente precificadas = **−EV sistemático**. Isso é erro de categoria e está proibido.
- A IA/LLM **não calcula** probabilidade. O número vem de cálculo estatístico no código. A IA entra só no fim para (a) aplicar o filtro de decisão e (b) explicar. Threshold é proposital e **rígido**: poucas oportunidades fortes > muitas fracas.

**Mentalidade de entrega da análise — o diferencial (TODO prompt futuro deve ter isto):**
O modelo **não olha média bruta — olha o CONFRONTO**. Todo sinal nasce do encaixe **oferta × concessão no mesmo eixo**: quem *produz* a ação encontra quem *permite* aquela ação.

> `μ_base(quem produz a ação) × multiplicador_concessão(adversário no mesmo eixo) → P(evento) → compara com odd de-vig`

Exemplos canônicos que o produto deve conseguir entregar:
- **Time A ataca muito pela esquerda** + **lateral-direito do Time B desarma muito** → o volume defensivo daquele lateral sobe → **over desarmes do lateral-direito** tem valor.
- **Time A cruza muito / gera muitos escanteios** + **Time B sofre muitos escanteios** → **over escanteios do Time A** tem valor.

Quando for analisar/gerar candidatos, **raciocine sempre nesse formato confronto** (produção de um lado × vulnerabilidade específica do outro), não em médias isoladas.

**Mercados (MVP):**
- **Jogador:** chutes a gol (Shots on Target) · finalizações totais · **desarmes**.
- **Partida:** gols · vitória (resultado) · escanteios.
- Mercados de contagem (SOT, finalizações, desarmes, escanteios) usam o modelo de contagem (NB2/Poisson sobre rate × multiplicadores de matchup). Gols/vitória usam um modelo de partida (Poisson de gols do time → deriva 1X2/totais).

**Inteligência de matchup — dois níveis (não prometer o que o dado free não dá):**
- **Por-mercado (base):** multiplicador de concessão do adversário por mercado (o `model/adjustments.py::opponent_multiplier` já faz isso para SOT; replicar para desarmes/escanteios/gols).
- **Direcional/zonal (alvo):** lado de ataque (esquerda/direita) × posição específica do defensor. Precisa de dado posicional rico (zonas Opta/StatsBomb/SofaScore). **Depende de um spike de viabilidade de dado free antes de implementar**; se o dado não existir de graça, cai para o nível por-mercado. Documentado como norte, condicionado a dado.

**Arena & validação:**
- Alvo: **Copa do Mundo 2026** (validação forward, ao vivo) → depois **top ligas europeias de clube**.
- **Validação-primeiro, sem auto-engano:** calibração offline (Brier/log-loss/ECE em replay de jogos passados) → CLV (Closing Line Value) → só então dinheiro real. Bater a bet365 em props é difícil (margem 7-10%, settlement Opta) — assumido e mitigado, não ignorado.

**Restrição de custo (atual):** orçamento ~$20. **Não** pagar SportsGameOdds Pro ($299). Não existe fonte confirmada de odds de SOT da Copa por <$20 — o plano valida o motor offline ($0) e gasta no máximo **API-Football Pro $19** (stats, ~1 semana antes da Copa). Detalhes em [docs/apis/README.md](docs/apis/README.md).

**Estado (2026-06-02):** motor (modelo+de-vig+EV+filtro+IA) e backtest de calibração existem e rodam offline (97 testes). **Mas a produção entrega zero** porque `app/streamlit_app.py::_taxa_fn` é placeholder (`mu=0`) e `elenco=[]` mata o crosswalk. Roadmap e raciocínio completo: [docs/superpowers/specs/2026-06-02-produto-doutrina-roadmap-wc2026.md](docs/superpowers/specs/2026-06-02-produto-doutrina-roadmap-wc2026.md).

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
