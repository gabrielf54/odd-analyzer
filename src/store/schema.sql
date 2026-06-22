-- Fonte de verdade do schema. Aplicar via apply_migration no MCP Supabase.
-- Última migração: add_market_type (2026-06-03)

create table if not exists analises (
  event_id text not null,
  market_type text not null default 'sot',
  jogo text,
  data timestamptz default now(),
  ttl int,
  candidatos jsonb,
  llm_resultado jsonb,
  resultado jsonb,  -- resultado COMPLETO da análise manual (market_type='manual_todos'); fonte de verdade do front
  primary key (event_id, market_type)
);

-- Última migração do ledger: drop_stale_paper_ledger_unique_3col (2026-06-15) — removeu a unique
-- ANTIGA (event_id,jogador,linha) que sobrou de add_market_type_to_analises_and_paper_ledger e
-- barrava o caso normal de um jogador ter vários mercados na MESMA linha (sot/finalizacoes/desarmes/
-- faltas em 0.5). Fica só a 4-col (com market_type), que o saveLedger usa no onConflict.
-- (add_player_id, 2026-06-11: stats-id casa com /events/{id}/player-stats/ no settle.)
create table if not exists paper_ledger (
  id bigint generated always as identity primary key,
  event_id text not null,
  jogador text not null,
  player_id text,          -- stats-id (mesmo namespace do /player-stats/); usado no settle
  linha numeric not null,
  market_type text not null default 'sot',
  odd_flag numeric,        -- nullable: linha de calibração forward (forwardLog) loga só prob_modelo, sem odd (CLV vem na fase 2)
  -- FUTURO (go-live do coletor): `book text` p/ provenance da odd do line shopping —
  -- migração add_book_to_paper_ledger, aplicar COM o dono. Aditiva/nullable, fora da unique.
  prob_modelo numeric,
  prob_devig numeric,
  edge numeric,
  ev numeric,
  odd_fechamento numeric,
  prob_devig_fechamento numeric,
  resultado int,
  clv numeric,
  criado_em timestamptz default now(),
  -- CLV automático (Rec 2, add_fechamento_em_to_paper_ledger 2026-06-22): quando o
  -- fechamento foi capturado (re-coleta de odds perto do kickoff). criado_em = entrada.
  fechamento_em timestamptz,
  unique (event_id, jogador, linha, market_type)
);

-- odds coletadas (fonte de verdade das odds; liga/jogo/jogador seguem vivos da BSD).
-- Última migração: create_odds_table (2026-06-10)
create table if not exists odds (
  event_id     text not null,
  entidade     text not null,        -- nome do jogador, ou "partida" p/ mercados de partida
  market_type  text not null,
  linha        numeric not null,
  odd_over     numeric not null,
  odd_under    numeric,
  book         text not null default 'manual',
  coletado_em  timestamptz not null default now(),
  primary key (event_id, entidade, market_type, linha, book)
);
create index if not exists odds_event_idx on odds (event_id);

-- odds_unificadas: ESPELHO canônico das odds (1 linha por aposta após line shopping).
-- NUNCA editada à mão — re-gerada a cada escrita em `odds` (reprojectUnifiedOdds). É o que
-- a ANÁLISE consome e o que a tela única mostra; `odds` segue como LOG cru. PK por
-- IDENTIDADE normalizada → colapsa grafias da mesma aposta ("Llorente, Marcos" + "Marcos
-- Llorente"). Migração: create_odds_unificadas (2026-06-15).
create table if not exists odds_unificadas (
  event_id          text not null,
  entidade_norm     text not null,        -- identidade normalizada (chave do agrupamento)
  market_type       text not null,
  linha             numeric not null,
  entidade          text not null,        -- nome de exibição da casa vencedora
  odd_over          numeric not null,     -- MELHOR preço (maior odd_over entre as casas)
  odd_under         numeric,              -- da MESMA casa vencedora (coerência de de-vig)
  book              text not null,        -- casa vencedora
  casas_comparadas  jsonb not null default '[]'::jsonb,  -- [{book, odd_over}] de todas as casas
  divergencia       boolean not null default false,      -- grupo divergente (≥ limiar)?
  spread_pp         numeric,              -- tamanho da divergência em pontos %, se houver
  coletado_em       timestamptz not null default now(),
  primary key (event_id, entidade_norm, market_type, linha)
);
create index if not exists odds_unificadas_event_idx on odds_unificadas (event_id);

-- odds_snapshots: histórico IMUTÁVEL de odds p/ CLV / movimento de linha (append-only,
-- NUNCA update/delete). Cada (re)coleta fotografa as odds unificadas com o `lineup_status`
-- do momento (marca a fronteira pré/pós-escalação no tempo). O CLV é DERIVADO daqui na
-- leitura (não mais capturado por gatilho). Migração: create_odds_snapshots (2026-06-22).
create table if not exists odds_snapshots (
  id bigint generated always as identity primary key,
  event_id text not null,
  entidade_norm text not null,        -- identidade normalizada (casa com a aposta)
  entidade text not null,             -- nome de exibição
  market_type text not null,
  linha numeric not null,
  odd_over numeric not null,
  odd_under numeric,
  book text not null,
  lineup_status text not null default 'unknown',  -- 'predicted'|'confirmed'|'unknown' no retrato
  coletado_em timestamptz not null default now()
);
create index if not exists odds_snapshots_lookup_idx
  on odds_snapshots (event_id, entidade_norm, market_type, linha, coletado_em);

-- lido/escrito por SupabaseRepo.save_crosswalk/get_crosswalk
create table if not exists jogadores_crosswalk (
  id_canonico bigint primary key,  -- id canonico do jogador, fornecido pelo caller (ex.: ID API-Football)
  nome_normalizado text,
  fontes_ids jsonb,
  confianca numeric,
  verificado_manual boolean default false
);
