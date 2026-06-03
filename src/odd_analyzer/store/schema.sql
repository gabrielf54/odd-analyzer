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
  primary key (event_id, market_type)
);

create table if not exists paper_ledger (
  id bigint generated always as identity primary key,
  event_id text not null,
  jogador text not null,
  linha numeric not null,
  market_type text not null default 'sot',
  odd_flag numeric not null,
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

create table if not exists jogadores_crosswalk (
  id_canonico bigint primary key,  -- id canonico do jogador, fornecido pelo caller (ex.: ID API-Football)
  nome_normalizado text,
  fontes_ids jsonb,
  confianca numeric,
  verificado_manual boolean default false
);
