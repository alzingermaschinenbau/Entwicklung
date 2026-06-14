-- ====================================================================
-- Entwicklung – Supabase-Schema (EINFACHER MODUS, wie das CRM/Montage)
-- Zugriff über den anon-Schlüssel; der Login läuft in der App.
-- Im Supabase-Projekt unter  SQL Editor  einfügen und ausführen.
-- (Idempotent – kann gefahrlos erneut ausgeführt werden.)
-- ====================================================================

-- ---- Stammdaten ----
create table if not exists entwickler (
  id bigint generated always as identity primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists projekte (
  id bigint generated always as identity primary key,
  name text not null,
  sort int not null default 0,
  active boolean not null default true
);
-- falls die Tabelle schon existierte:
alter table projekte add column if not exists sort int not null default 0;
alter table projekte add column if not exists active boolean not null default true;

create table if not exists kacheln (
  id bigint generated always as identity primary key,
  artikelnummer text,
  name text not null,
  sort int not null default 0,
  active boolean not null default true,
  projekt_id bigint references projekte(id) on delete cascade
);
-- falls die Tabelle schon existierte:
alter table kacheln add column if not exists artikelnummer text;
alter table kacheln add column if not exists sort int not null default 0;
alter table kacheln add column if not exists active boolean not null default true;
-- Optionale Projekt-Zuordnung: ist projekt_id gesetzt, erscheint die Kachel
-- nur bei diesem Projekt (sonst „allgemein" bei allen Projekten).
alter table kacheln add column if not exists projekt_id bigint references projekte(id) on delete cascade;

-- ---- Zeiterfassung (start_ts/end_ts als Millisekunden seit 1970) ----
create table if not exists time_entries (
  id bigint generated always as identity primary key,
  entwickler_id bigint not null references entwickler(id) on delete cascade,
  projekt_id    bigint not null references projekte(id)   on delete cascade,
  kachel_id     bigint not null references kacheln(id)    on delete cascade,
  start_ts bigint not null,
  end_ts   bigint,
  note text
);
create unique index if not exists uq_running
  on time_entries(entwickler_id, projekt_id, kachel_id) where end_ts is null;
create index if not exists idx_entries_running on time_entries(end_ts);

create table if not exists settings (
  key text primary key,
  value text
);

-- ====================================================================
-- Zugriffsrechte: offen über den anon-Schlüssel (Login regelt die App)
-- Entfernt evtl. vorhandene strengere Policies und setzt offene.
-- ====================================================================
do $$
declare t text;
begin
  foreach t in array array['entwickler','projekte','kacheln','settings','time_entries'] loop
    execute format('alter table %1$s enable row level security', t);
    -- evtl. alte Policies aus einem frueheren Durchlauf entfernen
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('drop policy if exists %1$s_all on %1$s', t);
    -- offene Policy: voller Zugriff
    execute format('create policy %1$s_all on %1$s for all using (true) with check (true)', t);
  end loop;
end $$;
