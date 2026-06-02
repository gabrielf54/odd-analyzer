-- Rodar uma vez no SQL editor do Supabase. Tabelas da Fase 1b (design v1 §8).
create table if not exists analises (
  event_id text primary key,
  jogo text,
  data timestamptz default now(),
  ttl int,
  candidatos jsonb,
  llm_resultado jsonb
);

create table if not exists paper_ledger (
  id bigint generated always as identity primary key,
  event_id text not null,
  jogador text not null,
  linha numeric not null,
  odd_flag numeric not null,
  prob_modelo numeric,
  prob_devig numeric,
  edge numeric,
  ev numeric,
  odd_fechamento numeric,
  prob_devig_fechamento numeric,
  resultado int,
  clv numeric,
  criado_em timestamptz default now()
);

create table if not exists jogadores_crosswalk (
  id_canonico bigint primary key,
  nome_normalizado text,
  fontes_ids jsonb,
  confianca numeric,
  verificado_manual boolean default false
);
