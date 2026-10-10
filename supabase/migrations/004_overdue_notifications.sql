-- UrbanGrid 004: server-side overdue marking, staff audit visibility and
-- complaint notifications.
--
-- Run AFTER 003_auth_roles_rls.sql. Idempotent.
--
-- * mark_overdue_tickets() is the server side of the SLA sweep. The frontend
--   computes due/overdue display from the configurable civicSettings, and this
--   sweep is what actually persists sla_status = 'overdue', raises the
--   escalation level and notifies the reporting citizen.
-- * Officers and administrators may run the sweep; a ward-scoped officer only
--   sweeps their own ward. Citizens and guests cannot run it.
-- * Officers may read the dispatch audit log (internal ops trail without
--   citizen contact details); administrators already could.
--
-- Demo notice: target response times are configurable examples, not official
-- government service guarantees. Email delivery of notifications is an
-- optional deployment step (Edge Function + email provider) documented
-- separately; in-app notifications are the default.

-- ---------------------------------------------------------------------------
-- 1) Keep the per-row audit trigger quiet during the sweep (the sweep writes
--    one summary audit entry instead of one row per ticket).
-- ---------------------------------------------------------------------------

create or replace function public.audit_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.sla_sweep', true), '') = 'on' then
    return new; -- bulk sweep: audited once by mark_overdue_tickets()
  end if;
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

-- ---------------------------------------------------------------------------
-- 2) Overdue sweep
-- ---------------------------------------------------------------------------

create or replace function public.mark_overdue_tickets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_marked integer := 0;
  v_service boolean;
  r record;
begin
  v_service := coalesce(auth.role(), '') in ('service_role', '');

  -- coalesce guards against NULL: for anonymous callers is_officer() is NULL
  -- (no profile row), and `not (NULL or false)` would let the sweep through.
  if not (coalesce(public.is_officer(), false) or v_service) then
    raise exception 'Only officers or administrators may run the overdue check';
  end if;

  -- Transaction-local marker: the per-row audit trigger stays quiet, the
  -- sweep writes a single summary entry below.
  perform set_config('app.sla_sweep', 'on', true);

  for r in
    select
      t.id,
      t.ticket_id,
      t.user_id,
      t.escalation_level,
      coalesce(t.deadline, t.response_deadline) as due_at
    from public.tickets t
    where t.status is distinct from 'Resolved'
      and coalesce(t.deadline, t.response_deadline) is not null
      and coalesce(t.deadline, t.response_deadline) < v_now
      and coalesce(t.sla_status, 'on_track') <> 'overdue'
      and (
        public.is_admin()
        or v_service
        or public.can_access_ward(t.ward_id)
      )
    order by due_at
    limit 500
  loop
    update public.tickets
       set sla_status = 'overdue',
           escalation_level = least(3, coalesce(escalation_level, 0) + 1),
           updated_at = v_now
     where id = r.id;

    if r.user_id is not null then
      insert into public.notifications (user_id, ticket_id, kind, title, body)
      values (
        r.user_id,
        coalesce(r.ticket_id, r.id::text),
        'overdue',
        'Complaint ' || coalesce(r.ticket_id, r.id::text) || ' is past its target date',
        'The municipal team has been alerted and the case is escalated. '
          || 'Please keep tracking it for the next update.'
      );
    end if;

    v_marked := v_marked + 1;
  end loop;

  if v_marked > 0 then
    insert into public.audit_logs (actor_id, actor_role, action, entity, detail)
    values (
      auth.uid(),
      public.current_role_name(),
      'tickets.overdue_sweep',
      'tickets',
      jsonb_build_object('marked', v_marked, 'at', v_now)
    );
  end if;

  return v_marked;
end;
$$;

revoke all on function public.mark_overdue_tickets() from public;
grant execute on function public.mark_overdue_tickets() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Officers may read the internal dispatch audit log (no citizen contact
--    details are stored there: actor, action, entity, status/ward detail).
-- ---------------------------------------------------------------------------

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (public.is_officer() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Refresh PostgREST schema cache.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
