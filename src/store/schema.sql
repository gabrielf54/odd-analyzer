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

-- Última migração do ledger: add_player_id (2026-06-11) — stats-id casa com
-- /events/{id}/player-stats/ no settle (eventPlayerStats não traz nome).
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

-- lido/escrito por SupabaseRepo.save_crosswalk/get_crosswalk
create table if not exists jogadores_crosswalk (
  id_canonico bigint primary key,  -- id canonico do jogador, fornecido pelo caller (ex.: ID API-Football)
  nome_normalizado text,
  fontes_ids jsonb,
  confianca numeric,
  verificado_manual boolean default false
);
