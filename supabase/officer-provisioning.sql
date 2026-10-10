-- UrbanGrid: officer account provisioning.
--
-- Officer accounts are NEVER self-service. A person registers a normal
-- citizen account (or an administrator creates one from the Supabase
-- dashboard), and an administrator then grants officer access here, from a
-- trusted database session (Supabase SQL editor or service role). The
-- application frontend cannot promote anyone: profiles_guard_update raises
-- an exception on any role change attempted by a non-administrator.
--
-- Role lives in public.profiles.role. Ward scope lives in
-- public.officer_profiles. Both must be set for an officer to see complaints
-- (deny by default: an officer without a ward scope sees nothing).

-- ---------------------------------------------------------------------------
-- 1) Find the account to provision
-- ---------------------------------------------------------------------------

select id, email, created_at
from auth.users
where email = 'officer@municipality.example';

-- ---------------------------------------------------------------------------
-- 2) Grant officer access scoped to one ward (run both statements)
--    Replace <USER-UUID> and W-047 with the real values.
--    ward_id must exist: select ward_id, ward_name, zone from public.wards;
--    officer_id is optional and references public.officers (officer_id).
-- ---------------------------------------------------------------------------

update public.profiles
   set role = 'officer'
 where id = '<USER-UUID>';

insert into public.officer_profiles (user_id, officer_id, ward_id, department, zone)
values ('<USER-UUID>', null, 'W-047', 'Public Works', 'Zone 5')
on conflict (user_id) do update
  set ward_id = excluded.ward_id,
      department = excluded.department,
      zone = excluded.zone,
      active = true;

-- ---------------------------------------------------------------------------
-- 3) Day-to-day administration
-- ---------------------------------------------------------------------------

-- Move an officer to another ward:
-- update public.officer_profiles set ward_id = 'W-052' where user_id = '<USER-UUID>';

-- Suspend officer access without deleting the account (sees nothing while inactive):
-- update public.officer_profiles set active = false where user_id = '<USER-UUID>';

-- Remove officer access entirely (back to a plain citizen):
-- update public.profiles set role = 'citizen' where id = '<USER-UUID>';
-- delete from public.officer_profiles where user_id = '<USER-UUID>';

-- Create an administrator (city-wide access to every ward + directory + audit):
-- update public.profiles set role = 'admin' where id = '<USER-UUID>';

-- ---------------------------------------------------------------------------
-- 4) Verification and audit
-- ---------------------------------------------------------------------------

-- Current officers with their scope:
select p.full_name, u.email, p.role, op.ward_id, op.zone, op.active
from public.profiles p
join auth.users u on u.id = p.id
left join public.officer_profiles op on op.user_id = p.id
where p.role in ('officer', 'admin')
order by p.full_name;

-- Recent dispatch activity (officer updates; directory changes by admins):
select created_at, actor_role, action, entity, entity_id, detail
from public.audit_logs
order by created_at desc
limit 50;

-- Status changes for one complaint:
select created_at, from_status, to_status, actor_name, note
from public.ticket_status_history
where ticket_id = 'UG-2026-00101'
order by created_at;
