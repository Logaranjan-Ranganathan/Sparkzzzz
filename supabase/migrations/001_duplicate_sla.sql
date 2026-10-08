-- UrbanGrid: one civic problem → one ticket → many citizen submissions + SLA.

alter table if exists public.tickets
  add column if not exists ticket_id text,
  add column if not exists category text,
  add column if not exists place_name text,
  add column if not exists address text,
  add column if not exists area text,
  add column if not exists ward_id text,
  add column if not exists report_count integer default 1,
  add column if not exists priority_score numeric default 1,
  add column if not exists latest_reported_at timestamptz,
  add column if not exists deadline timestamptz,
  add column if not exists response_deadline timestamptz,
  add column if not exists sla_status text default 'on_track',
  add column if not exists assigned_officer text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text,
  add column if not exists after_photo_url text,
  add column if not exists latest_update text,
  add column if not exists escalation_level integer default 0,
  add column if not exists updated_at timestamptz default now();

update public.tickets
set
  ticket_id = coalesce(ticket_id, id::text),
  report_count = coalesce(report_count, greatest(1, round(coalesce(priority_score, 1)))),
  latest_reported_at = coalesce(latest_reported_at, created_at),
  sla_status = coalesce(sla_status, 'on_track')
where true;

create table if not exists public.submissions (
  submission_id uuid primary key default gen_random_uuid(),
  ticket_id text not null,
  description text,
  image_url text,
  latitude double precision,
  longitude double precision,
  category text,
  created_at timestamptz default now()
);

create index if not exists submissions_ticket_id_idx on public.submissions (ticket_id);
create index if not exists tickets_sla_status_idx on public.tickets (sla_status);
create index if not exists tickets_status_idx on public.tickets (status);
