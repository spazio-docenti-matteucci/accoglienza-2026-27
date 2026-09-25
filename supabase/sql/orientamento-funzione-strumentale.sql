-- Livello di accesso personale della Funzione Strumentale: unico che apre gestione.html.
-- Applicato su Supabase il 2026-09-25.
alter table private.orientamento_accessi drop constraint orientamento_accessi_access_level_check;
alter table private.orientamento_accessi add constraint orientamento_accessi_access_level_check
  check (access_level in ('orientatore', 'supporter', 'funzione_strumentale'));
alter table public.orientamento_sessioni drop constraint orientamento_sessioni_access_level_check;
alter table public.orientamento_sessioni add constraint orientamento_sessioni_access_level_check
  check (access_level in ('orientatore', 'supporter', 'funzione_strumentale'));

-- La password si imposta a mano dall'editor SQL, sostituendo il segnaposto:
-- insert into private.orientamento_accessi (access_level, password_hash)
-- values ('funzione_strumentale', extensions.crypt('SCRIVI-QUI-LA-PASSWORD', extensions.gen_salt('bf')));
