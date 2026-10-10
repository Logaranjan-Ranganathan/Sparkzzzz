-- UrbanGrid: ward hierarchy CITY → ZONE → WARD → AREA → PLACE.
-- Wards, areas, places and officers get dedicated tables with unique IDs
-- (one ward = one Ward ID, one place = one Place ID). Tickets are extended
-- with hierarchy, officer, timeline and citizen-feedback columns.
--
-- Demo data notice: ward numbers/names in the app seed are illustrative and
-- do not represent official Chennai Corporation boundaries.

create table if not exists public.wards (
  id uuid primary key default gen_random_uuid(),
  ward_id text not null unique,
  ward_number text not null unique,
  ward_name text not null,
  zone text not null,
  area text,
  city text not null default 'Chennai',
  state text not null default 'Tamil Nadu',
  latitude double precision,
  longitude double precision,
  postal_code text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  area_id text not null unique,
  area_name text not null,
  ward_id text not null references public.wards (ward_id) on delete cascade,
  latitude double precision,
  longitude double precision,
  postal_code text,
  created_at timestamptz default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique,
  place_name text not null,
  street text,
  type text,
  area_id text references public.areas (area_id) on delete set null,
  ward_id text not null references public.wards (ward_id) on delete cascade,
  keywords text,
  latitude double precision,
  longitude double precision,
  postal_code text,
  created_at timestamptz default now()
);

create table if not exists public.officers (
  id uuid primary key default gen_random_uuid(),
  officer_id text not null unique,
  name text not null,
  department text not null,
  ward_id text references public.wards (ward_id) on delete set null,
  zone text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Ticket extensions: hierarchy, officer, timeline, citizen feedback.
-- image_url / postal_code / city / state are part of the app's ticket payload;
-- legacy installs lack them, and without them every online upsert would fail.
alter table if exists public.tickets
  add column if not exists image_url text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists place_id text,
  add column if not exists street text,
  add column if not exists area_id text,
  add column if not exists ward_number text,
  add column if not exists ward_name text,
  add column if not exists zone text,
  add column if not exists ward_detection text default 'auto',
  add column if not exists timeline jsonb default '[]'::jsonb,
  add column if not exists satisfaction text,
  add column if not exists rating integer,
  add column if not exists feedback_at timestamptz,
  add column if not exists assigned_officer_id text,
  add column if not exists officer_name text,
  add column if not exists department text;

create index if not exists tickets_ward_id_idx on public.tickets (ward_id);
create index if not exists tickets_place_id_idx on public.tickets (place_id);
create index if not exists tickets_area_id_idx on public.tickets (area_id);
create index if not exists places_ward_id_idx on public.places (ward_id);
create index if not exists areas_ward_id_idx on public.areas (ward_id);

-- tickets.ticket_id must be unique so submissions can reference it.
do $$
begin
  alter table public.tickets
    add constraint tickets_ticket_id_key unique (ticket_id);
exception
  when duplicate_object then null;
  when duplicate_table then null;
  when undefined_column then null;
end $$;

-- submissions → tickets (spec §21 foreign key chain).
-- Legacy installs may have declared submissions.ticket_id as uuid while the
-- application uses display ids (UG-2026-00101). Normalise it to text first so
-- the reference is comparable. If pre-existing orphan rows prevent the
-- constraint, the migration continues with a warning rather than aborting —
-- the security model does not depend on this FK.
do $$
declare
  v_type text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'submissions'
     and column_name = 'ticket_id';
  if v_type is not null and v_type not in ('text', 'character varying') then
    execute 'alter table public.submissions alter column ticket_id type text using ticket_id::text';
  end if;
end $$;

do $$
begin
  alter table public.submissions
    add constraint submissions_ticket_id_fkey
    foreign key (ticket_id) references public.tickets (ticket_id) on delete cascade;
exception
  when duplicate_object then null;
  when undefined_column then null;
  when others then
    raise warning 'submissions → tickets foreign key not added: %', sqlerrm;
end $$;

-- Soft references on tickets (place_id/area_id) are intentionally NOT hard
-- foreign keys: legacy tickets and off-catalog locations may lack directory
-- rows, and a hard FK would reject those reports. Ward/place integrity lives
-- in the wards → areas → places chain above.
