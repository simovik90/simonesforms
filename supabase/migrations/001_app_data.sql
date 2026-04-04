-- Esegui in Supabase → SQL Editor (una volta).
-- Chiavi: forms (array), responses (oggetto), crm (oggetto).

create table if not exists public.app_data (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_data_updated_at_idx on public.app_data (updated_at desc);

alter table public.app_data enable row level security;

-- Nessuna policy per anon/authenticated: solo la service role (backend) bypassa RLS.
comment on table public.app_data is 'KV store per Simone Forms (forms, responses, crm come JSON).';
