# Persistência de odds — design

**Data:** 2026-06-10
**Repo:** odd-analyzer (backend Node/TS) + odd-analyzer-frontend (wiring posterior).

## Objetivo

Hoje as odds são dado órfão: vêm de um JSON colado a cada análise (`/analise/manual`) ou de input manual, e são salvas à mão em `odds/*.json` para não re-extrair. A dor é re-colar o JSON toda vez que se reabre um jogo.

Tornar **odds um dado interno persistido**. Ao abrir um jogo, as odds já coletadas carregam da tabela — sem re-colar. Colar JSON passa a **gravar** na tabela; a análise **lê** da tabela por `event_id`. A tabela vira a fonte de verdade das odds.

## Escopo (decisões do dono)

- **Só odds** ganham tabela. Liga, jogo e jogador continuam vindo **vivos da BSD** — não duplicar a fonte de verdade da API, não assumir staleness/sync. (Espelho completo foi considerado e descartado por custo de coerência sem ganho.)
- **Sem tabela de ligas/jogos/jogadores.** A linha de odd carrega o `event_id`, e isso já a amarra ao jogo da BSD. "Jogos que já tenho odds" = `event_id` distintos da tabela odds, com nomes buscados vivos na BSD.
- **Sobrescrever por linha**, sem versão/histórico. Upsert na PK. (CLV continua via `paper_ledger` em fluxo separado — fora deste escopo.)
- **Tabela = fonte de verdade:** colar → salva; abrir → carrega; analisar → lê a tabela por `event_id`.
- **Acúmulo por upsert, não wipe.** Cada "adicionar ao lote" faz upsert das linhas daquele paste; pastes de mercados diferentes (SOT, depois desarmes) coexistem. Remover é ação explícita (DELETE). Não apaga o resto do jogo a cada paste.

## Schema

Nova tabela em `src/store/schema.sql`, aplicada via `apply_migration` no MCP Supabase (nome: `create_odds_table`).

```sql
create table if not exists odds (
  event_id     text not null,        -- amarra ao jogo BSD (não há FK; BSD é externo)
  entidade     text not null,        -- nome do jogador, ou "partida" p/ mercados de partida
  market_type  text not null,        -- sot | finalizacoes | desarmes | gols | vitoria | escanteios
  linha        numeric not null,     -- 0 quando o mercado não usa linha (ex.: vitoria)
  odd_over     numeric not null,
  odd_under    numeric,              -- null quando o paste não trouxe o under
  book         text not null default 'manual',
  coletado_em  timestamptz not null default now(),
  primary key (event_id, entidade, market_type, linha, book)
);

create index if not exists odds_event_idx on odds (event_id);
```

**Notas de modelagem:**
- `escopo_historico` **não** entra na tabela. É um botão da análise (per-evento, escolhido na UI), não um dado de odd. Continua viajando como parâmetro de análise (estado da UI / corpo do `/analise/manual`).
- A PK inclui `book` para suportar múltiplas casas na mesma linha no futuro; hoje quase tudo é `bet365`/`manual`. Sobrescrever = upsert nessa PK.
- Sem RLS por enquanto (mesma postura das tabelas atuais — backend usa service key). Rodar `get_advisors` após a migração e tratar o que aparecer.

## Camada de persistência — port `Repo`

Estender a interface `Repo` (`src/store/repo.ts`) e implementar nos dois adapters (`InMemoryRepo`, `SupabaseRepo`):

```ts
saveOdds(eventId: string, lines: OddsRow[]): Promise<void> | void;   // upsert por PK
getOdds(eventId: string): Promise<OddsRow[]> | OddsRow[];            // todas as linhas do jogo
deleteOdds(eventId: string, filter?: Partial<OddsRow>): Promise<void> | void; // limpa jogo ou 1 linha
listOddsEvents(): Promise<OddsEventSummary[]> | OddsEventSummary[];  // event_ids distintos + contagem + último coletado_em
```

`OddsRow` = espelho das colunas da tabela (snake_case PT no fio, conforme convenção: `event_id`, `entidade`, `market_type`, `linha`, `odd_over`, `odd_under`, `book`, `coletado_em`). `OddsEventSummary` = `{ event_id, total_linhas, ultimo_coletado_em }`.

- **InMemoryRepo:** um `Map<eventId, OddsRow[]>`, upsert por chave composta. Mantém os testes offline.
- **SupabaseRepo:** `upsert` com `onConflict` na PK; `select().eq("event_id", …)`; delete filtrado; agregação para o summary.

## Endpoints (API Express)

| Método | Rota | O que faz |
|--------|------|-----------|
| `POST` | `/odds` | **Colar = salvar.** Recebe o mesmo corpo de hoje (`event_id`, `coletado_em`, `odds[]`). Valida via `parseManualOdds` (reuso), faz upsert das linhas válidas, devolve `{ salvas, linhas_rejeitadas }`. |
| `GET`  | `/jogos/:eventId/odds` | **Abrir = carregar.** Devolve as odds salvas do jogo (hidrata o lote no front). |
| `DELETE` | `/jogos/:eventId/odds` | Limpa as odds do jogo (ou uma linha, via query). Para o botão "limpar". |
| `POST` | `/analise/manual` | **Analisar = ler a tabela.** Passa a receber `{ event_id, escopo_historico?, diagnostico? }`. O serviço **carrega as odds do repo** por `event_id`, monta o `ManualOddsInput` e chama `analyzeManual` **sem alterar o motor**. (Não recebe mais `odds[]` no corpo.) |
| `GET`  | `/odds/jogos` | (opcional) Lista resumida de jogos com odds coletadas — base para uma vitrine "meus jogos" futura. |

**Validação:** schema Zod novo para `/odds` (reaproveita `parseManualOdds` para a semântica por-linha) e para o `/analise/manual` reduzido. Bordas só com Zod, como manda o CLAUDE.md.

## Serviço

- `saveOddsService(repo, body)`: `parseManualOdds(body)` → `repo.saveOdds(event_id, linhas)` → retorna `{ salvas, linhas_rejeitadas }`.
- `getOddsService(repo, eventId)`: `repo.getOdds(eventId)`.
- `analyzeManualService` muda: em vez de `parseManualOdds(body)` sobre odds do corpo, lê `repo.getOdds(event_id)`, monta o `ManualOddsInput` (com `escopo_historico` do corpo) e chama `analyzeManual(client, input, …)`. O `analyzeManual` e todo o motor (`model/`, `value/`, `candidates/`) **não mudam** — o gate de paridade segue intacto.

## Seed dos `odds/*.json` existentes

Os arquivos em `odds/` são arrays de linhas **sem** `event_id`/`coletado_em` (o wrapper). Para semeá-los na tabela é preciso o `event_id` BSD de cada arquivo.

- Script único `npm run seed:odds` lendo um manifesto `odds/manifest.json` (`{ "england-10-06-26.json": "<event_id>", … }`) que mapeia arquivo → `event_id`.
- Para cada arquivo: monta o corpo (`event_id`, `coletado_em` = mtime/hoje, `odds`), passa por `parseManualOdds`, `repo.saveOdds`.
- Itens sem `event_id` no manifesto são pulados com aviso (sem silenciar). É um utilitário de migração, roda uma vez.

## Frontend (wiring posterior — coordenação)

> **Coordenação:** outra sessão está colapsando o front para tela única (`/coletar` → `/`, spec `2026-06-10-coletar-tela-unica`). Para **não conflitar**, este trabalho entrega **backend + contrato de API primeiro** (mergeável sozinho, sem tocar no front). O wiring do front entra **depois** que a tela única mergear, mirando o novo `app/page.tsx`.

Mudanças de front (follow-up):
- Ao abrir um jogo: `GET /jogos/:eventId/odds` hidrata o lote (substitui a hidratação só-localStorage).
- "Adicionar ao lote" / colar: `POST /odds` (persiste) → re-GET para refletir.
- Botão analisar: `POST /analise/manual` com `{ event_id, escopo_historico, diagnostico }` (sem `odds[]`).
- `localStorage` (`oa:coletar:lote`) vira cache de rascunho/offline; o banco é a fonte na carga.
- (Opcional) badge "tem odds salva" na lista de jogos via `GET /odds/jogos`.

## Testes

- `InMemoryRepo`: upsert/get/delete/list de odds (incluindo sobrescrita na PK e coexistência de mercados).
- Endpoints: `POST /odds` (salva + rejeita linha torta), `GET /jogos/:id/odds`, `DELETE`, `POST /analise/manual` lendo do repo.
- `analyzeManualService` lendo odds do repo produz o mesmo resultado que produzia recebendo as mesmas odds no corpo (teste de equivalência — protege o motor).
- Gate de paridade (`test/parity/`) **inalterado** — o motor não muda.

## Fora de escopo

- Tabelas de ligas/jogos/jogadores; botão "sincronizar BSD→banco"; qualquer espelho da API.
- Histórico/versão de odds; CLV (segue em `paper_ledger`).
- Redesign visual; a migração de tela única (outra sessão).
- Scraping/API de odds automática (futuro; hoje a entrada continua sendo o JSON colado).

## Estado a atualizar (ROADMAP/PITCH)

Ao implementar: registrar no ROADMAP que odds passaram a ser persistidas (nova tabela `odds`, schema.sql + migração), e no PITCH em linguagem leiga ("as cotações que você cola ficam guardadas; abriu o jogo, elas já estão lá"). Atualizar contagem de testes e data no cabeçalho do ROADMAP.
