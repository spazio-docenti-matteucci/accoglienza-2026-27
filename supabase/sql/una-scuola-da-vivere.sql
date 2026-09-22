-- Catalogo operativo ricavato dall'elenco referenti del 23/07/2026.
-- I nomi delle scuole/sedi sono da verificare per la campagna 2026/27.
-- Non inserire in questo schema nominativi o recapiti dei referenti scolastici.

create table if not exists public.orientamento_scuole (
  id text primary key,
  comune text not null,
  etichetta text not null,
  area text not null check (area in ('bacino', 'esterno')),
  ordine integer not null,
  attiva boolean not null default true,
  verificata boolean not null default false
);

create table if not exists public.orientamento_disponibilita (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 80),
  cognome text not null check (char_length(cognome) between 2 and 80),
  scuole text[] not null check (cardinality(scuole) between 1 and 5),
  nota text not null default '' check (char_length(nota) <= 600),
  stato text not null default 'ricevuta' check (stato in ('ricevuta', 'assegnata', 'archiviata')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orientamento_proposte (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 80),
  cognome text not null check (char_length(cognome) between 2 and 80),
  titolo text not null check (char_length(titolo) between 3 and 160),
  area text not null check (char_length(area) between 2 and 120),
  tipologia text not null check (tipologia in ('laboratorio', 'lezione_aperta', 'esperienza_pratica', 'dimostrazione', 'interdisciplinare', 'altro')),
  descrizione text not null check (char_length(descrizione) between 10 and 1200),
  durata_minuti integer not null check (durata_minuti in (30, 45, 60, 90)),
  partecipanti integer check (partecipanti between 1 and 200),
  esigenze text not null default '' check (char_length(esigenze) <= 600),
  nota text not null default '' check (char_length(nota) <= 600),
  stato text not null default 'ricevuta' check (stato in ('ricevuta', 'in_valutazione', 'approvata', 'archiviata')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La chiave è un hash giornaliero dell'indirizzo di rete: nessun IP in chiaro.
create table if not exists public.orientamento_quote (
  fingerprint text primary key,
  richieste integer not null default 1,
  ultima_richiesta timestamptz not null default now()
);

create index if not exists orientamento_disponibilita_created_idx on public.orientamento_disponibilita (created_at desc);
create index if not exists orientamento_proposte_created_idx on public.orientamento_proposte (created_at desc);

alter table public.orientamento_scuole enable row level security;
alter table public.orientamento_disponibilita enable row level security;
alter table public.orientamento_proposte enable row level security;
alter table public.orientamento_quote enable row level security;

revoke all on public.orientamento_scuole, public.orientamento_disponibilita,
  public.orientamento_proposte, public.orientamento_quote from public, anon, authenticated;
grant select, insert, update on public.orientamento_scuole,
  public.orientamento_disponibilita, public.orientamento_proposte,
  public.orientamento_quote to service_role;
grant delete on public.orientamento_quote to service_role;

create or replace function public.orientamento_consuma_quota(p_fingerprint text, p_limite integer)
returns boolean language plpgsql security invoker set search_path = public as $$
declare v_richieste integer;
begin
  if char_length(p_fingerprint) <> 64 or p_limite < 1 or p_limite > 20 then
    return false;
  end if;
  delete from public.orientamento_quote where ultima_richiesta < now() - interval '3 days';
  insert into public.orientamento_quote (fingerprint, richieste, ultima_richiesta)
  values (p_fingerprint, 1, now())
  on conflict (fingerprint) do update
    set richieste = public.orientamento_quote.richieste + 1,
        ultima_richiesta = now()
  returning richieste into v_richieste;
  return v_richieste <= p_limite;
end;
$$;
revoke all on function public.orientamento_consuma_quota(text, integer) from public, anon, authenticated;
grant execute on function public.orientamento_consuma_quota(text, integer) to service_role;

insert into public.orientamento_scuole (id, comune, etichetta, area, ordine) values
  ('assemini-nivola', 'Assemini', 'Nivola', 'bacino', 10),
  ('assemini-pascoli', 'Assemini', 'Pascoli', 'bacino', 20),
  ('decimomannu-da-vinci', 'Decimomannu', 'L. Da Vinci', 'bacino', 30),
  ('decimoputzu-gramsci', 'Decimoputzu', 'A. Gramsci', 'bacino', 40),
  ('elmas-saba', 'Elmas', 'Monsignor Saba', 'bacino', 50),
  ('samassi-fermi', 'Samassi', 'E. Fermi', 'bacino', 60),
  ('san-sperate-deledda', 'San Sperate', 'G. Deledda', 'bacino', 70),
  ('serramanna-sede', 'Serramanna', 'Scuola secondaria di I grado', 'bacino', 80),
  ('siliqua-sede', 'Siliqua', 'Scuola secondaria di I grado', 'bacino', 90),
  ('uta-sede', 'Uta', 'Scuola secondaria di I grado', 'bacino', 100),
  ('vallermosa-sede', 'Vallermosa', 'Scuola secondaria di I grado', 'bacino', 110),
  ('villasor-pusceddu', 'Villasor', 'Pusceddu', 'bacino', 120),
  ('villaspeciosa-sede', 'Villaspeciosa', 'Scuola secondaria di I grado', 'bacino', 130),
  ('ussana-sede', 'Ussana', 'Scuola secondaria di I grado', 'bacino', 140),
  ('monastir-sede', 'Monastir', 'Scuola secondaria di I grado', 'bacino', 150),
  ('capoterra-sede', 'Capoterra', 'Scuola secondaria di I grado', 'bacino', 160),
  ('sestu-gramsci-rodari', 'Sestu', 'I.C. Gramsci-Rodari', 'bacino', 170),
  ('villamassargia-meloni', 'Villamassargia', 'I.C. F. Meloni', 'esterno', 180),
  ('san-gavino-arborea', 'San Gavino', 'E. D’Arborea', 'esterno', 190),
  ('sardara-sede', 'Sardara', 'Scuola secondaria di I grado', 'esterno', 200),
  ('sinnai-ic-1-2', 'Sinnai', 'I.C. Sinnai 1–2', 'esterno', 210),
  ('villacidro-sede', 'Villacidro', 'Scuola secondaria di I grado', 'esterno', 220),
  ('sanluri-calasanzio', 'Sanluri', 'Calasanzio', 'esterno', 230),
  ('gonnosfanadiga-sede', 'Gonnosfanadiga', 'Scuola secondaria di I grado', 'esterno', 240)
on conflict (id) do nothing;
