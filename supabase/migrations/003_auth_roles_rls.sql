-- UrbanGrid 003: accounts, roles, and Row Level Security.
--
-- Run AFTER 001_duplicate_sla.sql and 002_ward_hierarchy.sql. Idempotent.
--
-- Security model:
--   * Role is stored in public.profiles.role and can only be changed by an
--     administrator (trigger-enforced). It is never read from the client.
--   * Citizens can read only their own complaints; officers only complaints in
--     their ward scope; administrators everything.
--   * Public map data comes from the public_issues view, which exposes
--     non-personal columns only (no user_id, no account data).
--   * Officer accounts are provisioned by administrators (officer_profiles),
--     never by self-registration.
--
-- Demo data notice: ward/officer records in this project are illustrative
-- examples, not official municipal records.

-- ---------------------------------------------------------------------------
-- 1) Roles reference table
-- ---------------------------------------------------------------------------

create table if not exists public.app_roles (
  role_key text primary key,
  label text not null,
  description text,
  rank integer not null default 0
);

insert into public.app_roles (role_key, label, description, rank) values
  ('citizen', 'Citizen', 'Public user who reports and tracks civic issues.', 1),
  ('officer', 'Municipal Officer', 'Ward-scoped staff who update complaint progress.', 2),
  ('admin', 'Administrator', 'Maintains the ward directory and provisions officer accounts.', 3)
on conflict (role_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Profiles — one row per auth user; role lives here (never in user metadata)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'citizen' references public.app_roles (role_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every signup creates a citizen profile server-side. The role is fixed to
-- 'citizen' here, so a user can never self-assign officer access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'citizen'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3) Officer profiles — links an auth user to a roster officer + ward scope
-- ---------------------------------------------------------------------------

create table if not exists public.officer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  officer_id text references public.officers (officer_id) on delete set null,
  ward_id text references public.wards (ward_id) on delete set null,
  department text,
  zone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4) Trusted role helpers (SECURITY DEFINER — read profiles without RLS loops)
-- ---------------------------------------------------------------------------

create or replace function public.current_role_name()
returns text
language sql stable security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_officer()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.current_role_name() in ('officer', 'admin') $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.current_role_name() = 'admin' $$;

-- The ward an officer is scoped to, from their administrator-provisioned
-- officer_profiles row.
create or replace function public.current_officer_ward()
returns text
language sql stable security definer
set search_path = public
as $$ select ward_id from public.officer_profiles where user_id = auth.uid() and active $$;

-- Strict, deny-by-default ward scope: administrators cover every ward;
-- officers cover exactly their assigned ward. An officer account without an
-- assigned ward sees nothing until an administrator assigns one.
create or replace function public.can_access_ward(p_ward text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_admin()
      or (public.is_officer()
          and public.current_officer_ward() is not null
          and p_ward = public.current_officer_ward())
$$;

-- ---------------------------------------------------------------------------
-- 5) Complaints (tickets) — link reports to their author
-- ---------------------------------------------------------------------------

alter table if exists public.tickets
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists tickets_user_id_idx on public.tickets (user_id);

-- The application uses human-readable ticket ids (UG-2026-00101). Legacy
-- installs declared tickets.id as uuid, which rejects those ids on insert.
-- Normalise the column to text (no-op when it already is text).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tickets'
      and column_name = 'id'
      and data_type <> 'text'
  ) then
    alter table public.tickets alter column id type text using id::text;
    alter table public.tickets alter column id set default gen_random_uuid()::text;
  end if;
end $$;

-- Legacy 'submissions' tables from the original app may lack these columns.
alter table if exists public.submissions
  add column if not exists image_url text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists category text;

-- ---------------------------------------------------------------------------
-- 6) Status history, assignments, notifications, audit logs
-- ---------------------------------------------------------------------------

create table if not exists public.ticket_status_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null,
  from_status text,
  to_status text not null,
  note text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_status_history_ticket_idx
  on public.ticket_status_history (ticket_id, created_at desc);

create table if not exists public.ticket_assignments (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null,
  officer_id text,
  officer_name text,
  ward_id text,
  assigned_by uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ticket_assignments_ticket_idx on public.ticket_assignments (ticket_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticket_id text,
  kind text not null default 'status',
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- 7) Guard triggers
-- ---------------------------------------------------------------------------

-- 7a) Nobody (except administrators, service role, or the SQL editor) may
--     change a profile's role. Users also may not move a profile to someone
--     else's id.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- SQL editor / service role (trusted server-side path)
  end if;
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators can change account roles';
  end if;
  if new.id is distinct from old.id and not public.is_admin() then
    raise exception 'Profile id cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 7b) Citizens and guests may file complaints, but dispatch-controlled fields
--     are forced to safe defaults on insert. Only officers (scoped by RLS)
--     can set status, priority, assignments or resolution details directly.
create or replace function public.guard_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_officer() then
    return new;
  end if;
  if coalesce(auth.role(), '') in ('service_role', '') then
    return new; -- SQL editor / trusted server-side path
  end if;

  new.status := 'Open';
  new.report_count := 1;
  new.escalation_level := 0;
  new.satisfaction := null;
  new.rating := null;
  new.feedback_at := null;
  new.resolved_at := null;
  new.resolution_note := null;
  new.assigned_officer := null;
  new.assigned_officer_id := null;
  return new;
end;
$$;

drop trigger if exists tickets_guard_insert on public.tickets;
create trigger tickets_guard_insert
  before insert on public.tickets
  for each row execute function public.guard_ticket_insert();

-- 7c) Citizens may update their own complaint only for citizen-feedback
--     columns. Reopening via 👎 (Resolved → In Progress with satisfaction
--     'down') is the single allowed status change. Everything else —
--     status changes, assignments, deadlines, report counts — is reserved
--     for officers. Officers themselves are scoped by RLS, not by this guard.
--     The support_complaint() RPC sets a transaction-local marker
--     (app.support_merge) because its merge update is server-controlled:
--     PostgREST clients cannot set custom settings, so citizens have no way
--     to reach this branch.
create or replace function public.guard_ticket_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  citizen_payload_old jsonb;
  citizen_payload_new jsonb;
begin
  if auth.uid() is null then
    return new; -- SQL editor / service role / scheduled jobs
  end if;
  if public.is_officer() then
    return new;
  end if;
  if coalesce(current_setting('app.support_merge', true), '') = 'on' then
    return new; -- trusted merge inside support_complaint()
  end if;
  if old.user_id is distinct from auth.uid() then
    raise exception 'Not allowed to update this complaint';
  end if;

  citizen_payload_old := to_jsonb(old) - 'satisfaction' - 'rating' - 'feedback_at'
                         - 'timeline' - 'status' - 'latest_update' - 'updated_at';
  citizen_payload_new := to_jsonb(new) - 'satisfaction' - 'rating' - 'feedback_at'
                         - 'timeline' - 'status' - 'latest_update' - 'updated_at';
  if citizen_payload_old is distinct from citizen_payload_new then
    raise exception 'Citizens cannot change dispatch-controlled complaint fields';
  end if;

  if new.status is distinct from old.status then
    if not (old.status = 'Resolved' and new.status = 'In Progress' and new.satisfaction = 'down') then
      raise exception 'Only officers can change the complaint status';
    end if;
  end if;

  if new.latest_update is distinct from old.latest_update then
    if not (old.status = 'Resolved' and new.status = 'In Progress') then
      raise exception 'Only officers can rewrite status updates';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tickets_guard_update on public.tickets;
create trigger tickets_guard_update
  before update on public.tickets
  for each row execute function public.guard_ticket_update();

-- 7c) Status changes are recorded in ticket_status_history and notify the
--     reporting citizen (when the complaint is linked to an account).
create or replace function public.record_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_ticket_ref text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_ticket_ref := coalesce(new.ticket_id, new.id::text);
  select coalesce(p.full_name, 'Municipal officer') into v_actor
    from public.profiles p where p.id = auth.uid();

  insert into public.ticket_status_history (ticket_id, from_status, to_status, note, actor_id, actor_name)
  values (v_ticket_ref, old.status, new.status, new.latest_update, auth.uid(), v_actor);

  if new.user_id is not null then
    insert into public.notifications (user_id, ticket_id, kind, title, body)
    values (
      new.user_id,
      v_ticket_ref,
      'status',
      'Complaint ' || v_ticket_ref || ' is now ' || new.status,
      coalesce(new.latest_update, 'Status updated by the municipal office.')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_status_history on public.tickets;
create trigger tickets_status_history
  after update on public.tickets
  for each row execute function public.record_ticket_status_change();

-- 7d) Officer actions on complaints are recorded in the audit log.
create or replace function public.audit_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_officer() then
    insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
    values (
      auth.uid(),
      public.current_role_name(),
      'ticket.update',
      'tickets',
      new.id::text,
      jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status,
        'ward_id', new.ward_id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_audit on public.tickets;
create trigger tickets_audit
  after update on public.tickets
  for each row execute function public.audit_ticket_change();

-- 7e) Directory changes (wards, areas, places, officers) are audited.
create or replace function public.audit_directory_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
  values (
    auth.uid(),
    public.current_role_name(),
    'directory.' || lower(tg_op),
    tg_table_name,
    coalesce(payload ->> 'ward_id', payload ->> 'place_id', payload ->> 'area_id', payload ->> 'officer_id'),
    '{}'::jsonb
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['wards', 'areas', 'places', 'officers'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
         for each row execute function public.audit_directory_change()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8) Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.officer_profiles enable row level security;
alter table public.app_roles enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ticket_status_history enable row level security;
alter table public.ticket_assignments enable row level security;
alter table if exists public.tickets enable row level security;
alter table if exists public.wards enable row level security;
alter table if exists public.areas enable row level security;
alter table if exists public.places enable row level security;
alter table if exists public.officers enable row level security;
alter table if exists public.submissions enable row level security;

-- 8a) Profiles: users read/update only their own row; admins manage all.
--     Role changes are additionally blocked by the guard trigger.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- 8b) Officer profiles: officers read their own scope row; admins manage all.
drop policy if exists officer_profiles_select on public.officer_profiles;
create policy officer_profiles_select on public.officer_profiles
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists officer_profiles_admin on public.officer_profiles;
create policy officer_profiles_admin on public.officer_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- 8c) Roles reference table is readable by everyone, writable by admins only.
drop policy if exists app_roles_select on public.app_roles;
create policy app_roles_select on public.app_roles
  for select using (true);

drop policy if exists app_roles_admin on public.app_roles;
create policy app_roles_admin on public.app_roles
  for all using (public.is_admin()) with check (public.is_admin());

-- 8d) Complaints: citizens see their own; officers see their ward scope;
--     admins see everything. Guests may file anonymously (user_id is null).
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.is_officer() and public.can_access_ward(ward_id))
  );

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets
  for insert with check (user_id is null or user_id = auth.uid());

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.is_officer() and public.can_access_ward(ward_id))
  )
  with check (
    user_id = auth.uid()
    or public.is_admin()
    or (public.is_officer() and public.can_access_ward(ward_id))
  );

-- 8e) Submissions carry no personal data: guests may attach evidence to a
--     ticket and everyone may read the public record of merged reports.
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select using (true);

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
  for insert with check (true);

-- 8f) Status history: visible to the complaint owner, officers and admins.
drop policy if exists ticket_status_history_select on public.ticket_status_history;
create policy ticket_status_history_select on public.ticket_status_history
  for select using (
    public.is_officer()
    or public.is_admin()
    or exists (
      select 1 from public.tickets t
      where coalesce(t.ticket_id, t.id::text) = ticket_id
        and t.user_id = auth.uid()
    )
  );

-- 8g) Assignments and audit logs: admin-read; assignments admin-managed.
drop policy if exists ticket_assignments_select on public.ticket_assignments;
create policy ticket_assignments_select on public.ticket_assignments
  for select using (public.is_officer() or public.is_admin());

drop policy if exists ticket_assignments_admin on public.ticket_assignments;
create policy ticket_assignments_admin on public.ticket_assignments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (public.is_admin());

-- 8h) Notifications: users read and mark their own; officers/admins may send
--     notifications for complaints in their scope.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (public.is_officer() or public.is_admin());

-- 8i) Directory tables are public reference data. Only admins may write
--     (uniqueness constraints on ward/place ids are in 002).
drop policy if exists wards_select on public.wards;
create policy wards_select on public.wards for select using (true);
drop policy if exists wards_admin on public.wards;
create policy wards_admin on public.wards
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists areas_select on public.areas;
create policy areas_select on public.areas for select using (true);
drop policy if exists areas_admin on public.areas;
create policy areas_admin on public.areas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists places_select on public.places;
create policy places_select on public.places for select using (true);
drop policy if exists places_admin on public.places;
create policy places_admin on public.places
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists officers_select on public.officers;
create policy officers_select on public.officers for select using (true);
drop policy if exists officers_admin on public.officers;
create policy officers_admin on public.officers
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 9) Public issue feed — non-personal columns only, readable by everyone
-- ---------------------------------------------------------------------------

drop view if exists public.public_issues;
create view public.public_issues as
select
  id,
  ticket_id,
  description,
  image_url,
  category,
  status,
  place_id,
  place_name,
  street,
  area_id,
  area,
  ward_id,
  ward_number,
  ward_name,
  zone,
  latitude,
  longitude,
  report_count,
  priority_score,
  latest_reported_at,
  created_at,
  deadline,
  response_deadline,
  sla_status,
  assigned_officer,
  officer_name,
  department,
  resolved_at,
  resolution_note,
  latest_update,
  escalation_level,
  timeline,
  satisfaction,
  updated_at
from public.tickets;

grant select on public.public_issues to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) Support an existing report — the server-side twin of duplicate merging.
--     Anyone (guest or citizen) may add one more report to an existing open
--     ticket; the count/priority math stays server-controlled so citizens
--     never gain arbitrary update rights.
-- ---------------------------------------------------------------------------

create or replace function public.support_complaint(
  p_ticket_id text,
  p_description text default null,
  p_image_url text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_category text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tickets;
  new_count integer;
begin
  select * into t from public.tickets
    where id::text = p_ticket_id or ticket_id = p_ticket_id
    limit 1;

  if t.id is null then
    raise exception 'Complaint not found';
  end if;
  if t.status = 'Resolved' then
    raise exception 'This complaint is already resolved';
  end if;

  new_count := coalesce(t.report_count, t.priority_score::integer, 1) + 1;

  -- Transaction-local marker read by guard_ticket_update(): this merge is a
  -- server-controlled path and must be able to touch report_count / priority /
  -- timeline even when the caller is the citizen who reported it. Custom
  -- settings cannot be set through PostgREST, and the marker expires with
  -- the transaction.
  perform set_config('app.support_merge', 'on', true);

  update public.tickets
     set report_count = new_count,
         latest_reported_at = now(),
         updated_at = now(),
         priority_score = least(5, greatest(
           coalesce(priority_score, 1),
           case
             when new_count >= 11 then 4
             when new_count >= 6 then 3
             when new_count >= 3 then 2
             else 1
           end
           + case when now() - created_at > interval '48 hours' then 0.5 else 0 end
           + case when sla_status = 'overdue' then 1 else 0 end
         )),
         timeline = coalesce(timeline, '[]'::jsonb)
           || jsonb_build_array(jsonb_build_object(
                'stage', 'duplicate_check',
                'at', now(),
                'note', 'Another citizen reported the same problem at this location — merged into this ticket (ONE problem = ONE ticket).'
              ))
   where id = t.id
   returning * into t;

  insert into public.submissions (ticket_id, description, image_url, latitude, longitude, category, created_at)
  values (coalesce(t.ticket_id, t.id::text), p_description, p_image_url, p_latitude, p_longitude, p_category, now());

  if t.user_id is not null then
    insert into public.notifications (user_id, ticket_id, kind, title, body)
    values (
      t.user_id,
      coalesce(t.ticket_id, t.id::text),
      'support',
      new_count || ' citizens have now reported this issue',
      'A neighbour added their report to ' || coalesce(t.ticket_id, t.id::text) || '.'
    );
  end if;

  return t;
end;
$$;

revoke all on function public.support_complaint(text, text, text, double precision, double precision, text) from public;
grant execute on function public.support_complaint(text, text, text, double precision, double precision, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11) Refresh PostgREST schema cache so new tables/views appear immediately.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
