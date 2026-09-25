-- Le visite segnalate dai docenti arrivano "da_confermare" e contano solo dopo la conferma
-- della Funzione Strumentale. Applicato su Supabase il 2026-09-25.
alter table public.orientamento_attivita
  add column if not exists stato text not null default 'confermata'
  check (stato in ('da_confermare', 'confermata'));
