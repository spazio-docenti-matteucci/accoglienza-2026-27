-- Una scuola da vivere · classifica a punti dei docenti.
-- Da applicare dopo una-scuola-da-vivere.sql.
-- Il nome compare nella classifica pubblica solo con il consenso del docente
-- (in_classifica). Le attività svolte sono registrate dalla Commissione.

alter table public.orientamento_disponibilita
  add column if not exists in_classifica boolean not null default false;
alter table public.orientamento_proposte
  add column if not exists in_classifica boolean not null default false;

create table if not exists public.orientamento_attivita (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 80),
  cognome text not null check (char_length(cognome) between 2 and 80),
  tipo text not null check (tipo in ('visita', 'mattinee')),
  scuola_id text references public.orientamento_scuole (id),
  titolo text not null default '' check (char_length(titolo) <= 160),
  data date not null,
  nota text not null default '' check (char_length(nota) <= 600),
  in_classifica boolean not null default false,
  archiviata boolean not null default false,
  created_at timestamptz not null default now(),
  check (tipo <> 'visita' or scuola_id is not null)
);

create index if not exists orientamento_attivita_data_idx on public.orientamento_attivita (data desc, created_at desc);

alter table public.orientamento_attivita enable row level security;
revoke all on public.orientamento_attivita from public, anon, authenticated;
grant select, insert, update on public.orientamento_attivita to service_role;
