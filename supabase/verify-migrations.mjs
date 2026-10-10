#!/usr/bin/env node
/**
 * Real-Postgres verification for supabase/migrations/001-004, using PGlite
 * (Postgres compiled to WebAssembly — no server and no credentials needed).
 *
 * The harness rebuilds the shape of the live Supabase project (legacy
 * `tickets` with a uuid id, minimal `submissions`), applies the migration
 * files verbatim, shims what Supabase provides at runtime (the auth schema
 * with auth.uid()/auth.role(), the anon / authenticated / service_role
 * roles, and Supabase's default GRANTs), then asserts that the security
 * model in 003_auth_roles_rls.sql actually holds in real Postgres:
 *
 *   - RLS is what protects data (grants exist, yet anon reads nothing).
 *   - Citizens see and update only their own complaints.
 *   - Officers are strictly ward-scoped; unscoped/inactive officers see
 *     nothing (deny by default).
 *   - Nobody can change their own role; signup metadata cannot self-assign.
 *   - Directory writes and officer provisioning are admin-only.
 *   - support_complaint() merges duplicate reports, bumps the count and
 *     notifies the owner without granting citizens update rights.
 *   - mark_overdue_tickets() is officer/admin-only, ward-scoped, marks each
 *     overdue complaint once, escalates it and notifies its owner.
 *   - Re-running the migrations is safe (idempotent).
 *
 * Usage: npm run verify:db
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  '001_duplicate_sla.sql',
  '002_ward_hierarchy.sql',
  '003_auth_roles_rls.sql',
  '004_overdue_notifications.sql',
];

const CITIZEN_A = '11111111-1111-4111-8111-111111111111';
const CITIZEN_B = '22222222-2222-4222-8222-222222222222';
const OFFICER_1 = '33333333-3333-4333-8333-333333333333';
const OFFICER_2 = '44444444-4444-4444-8444-444444444444';
const ADMIN_1 = '55555555-5555-4555-8555-555555555555';
const EVE = '66666666-6666-4666-8666-666666666666';
const OFFICER_3 = '77777777-7777-4777-8777-777777777777';
const NEW_SIGNUP = '88888888-8888-4888-8888-888888888888';
const LEGACY_TICKET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ANON = { role: 'anon', uid: null };
const SQL_EDITOR = { role: 'postgres', uid: null };
const asUser = (uid) => ({ role: 'authenticated', uid });

// ---------------------------------------------------------------------------
// Supabase shims
// ---------------------------------------------------------------------------

const SHIM_SQL = `
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as
$$ select nullif(current_setting('app.test_uid', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable as
$$ select nullif(current_setting('app.test_role', true), '') $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
`;

// The live project's current shape: tickets created by an earlier setup with
// a uuid primary key, submissions with a uuid ticket reference, before any
// UrbanGrid migration has been applied.
const LEGACY_SHAPE_SQL = `
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  description text,
  status text default 'Open',
  priority_score numeric default 1,
  latitude double precision,
  longitude double precision,
  ward_id text,
  created_at timestamptz default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid,
  description text,
  created_at timestamptz default now()
);

insert into public.tickets (id, description, status, priority_score, latitude, longitude, ward_id, created_at)
values (
  '${LEGACY_TICKET}', 'Legacy pothole cluster from the first install', 'In Progress', 2,
  13.05, 80.24, null, now() - interval '5 days'
);

insert into public.submissions (ticket_id, description)
values ('${LEGACY_TICKET}', 'First legacy report');
`;

// Mimics Supabase's default privileges: anon/authenticated hold table
// privileges; RLS is the only thing standing between them and the data.
const SUPABASE_GRANTS_SQL = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
`;

// ---------------------------------------------------------------------------
// Tiny assertion runner
// ---------------------------------------------------------------------------

let passed = 0;
const failures = [];

function section(title) {
  console.log(`\n== ${title} ==`);
}

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Context-aware query helpers (equivalent of PostgREST request contexts)
// ---------------------------------------------------------------------------

async function setContext(pg, { role, uid }) {
  await pg.exec('reset role;');
  const roleValue = role === 'postgres' ? '' : role;
  await pg.exec(
    `select set_config('app.test_uid', '${uid || ''}', false),
            set_config('app.test_role', '${roleValue}', false);`
  );
  if (role !== 'postgres') await pg.exec(`set role ${role};`);
}

async function queryAs(pg, context, sql) {
  await setContext(pg, context);
  try {
    return (await pg.query(sql)).rows;
  } finally {
    await pg.exec('reset role;');
  }
}

async function execAs(pg, context, sql) {
  await setContext(pg, context);
  try {
    await pg.exec(sql);
  } finally {
    await pg.exec('reset role;');
  }
}

async function expectError(pg, context, sql, fragment) {
  try {
    await execAs(pg, context, sql);
    return { ok: false, message: 'no error was raised' };
  } catch (error) {
    const message = String(error?.message || error);
    return { ok: message.includes(fragment), message };
  }
}

const ids = (rows) => rows.map((row) => row.id).join(', ');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('UrbanGrid migrations 001-004 — real-Postgres verification (PGlite)');

  const pg = new PGlite();
  if (pg.waitReady) await pg.waitReady;

  await pg.exec(SHIM_SQL);
  await pg.exec(LEGACY_SHAPE_SQL);
  for (const file of MIGRATIONS) {
    const sql = readFileSync(join(here, 'migrations', file), 'utf8');
    await pg.exec(sql);
    console.log(`applied ${file}`);
  }
  await pg.exec(SUPABASE_GRANTS_SQL);

  // -------------------------------------------------------------------------
  section('Schema and upgrade of a legacy install');
  // -------------------------------------------------------------------------

  const rls = await queryAs(pg, SQL_EDITOR, `
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
    order by c.relname`);
  const rlsTables = rls.map((row) => row.relname);
  const requiredRls = [
    'profiles', 'officer_profiles', 'app_roles', 'notifications', 'audit_logs',
    'ticket_status_history', 'ticket_assignments', 'tickets', 'wards', 'areas',
    'places', 'officers', 'submissions',
  ];
  check(
    'Row Level Security enabled on every table',
    requiredRls.every((table) => rlsTables.includes(table)),
    `missing: ${requiredRls.filter((t) => !rlsTables.includes(t)).join(', ')}`
  );

  const idType = await queryAs(pg, SQL_EDITOR, `
    select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets' and column_name = 'id'`);
  check('tickets.id normalised to text (display ids like UG-2026-00101)', idType[0]?.data_type === 'text');

  const subCols = await queryAs(pg, SQL_EDITOR, `
    select column_name, max(data_type) as data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'submissions'
    group by column_name`);
  const subCol = new Map(subCols.map((row) => [row.column_name, row.data_type]));
  check(
    'submissions extended with image_url / latitude / longitude / category',
    ['image_url', 'latitude', 'longitude', 'category'].every((c) => subCol.has(c))
  );
  check('submissions.ticket_id normalised to text', subCol.get('ticket_id') === 'text');

  const fk = await queryAs(pg, SQL_EDITOR, `
    select count(*)::int as n from pg_constraint where conname = 'submissions_ticket_id_fkey'`);
  check('submissions → tickets foreign key chain in place', fk[0].n === 1);

  const roles = await queryAs(pg, SQL_EDITOR, `select count(*)::int as n from public.app_roles`);
  check('app_roles seeded with citizen / officer / admin', roles[0].n === 3);

  const legacy = await queryAs(pg, SQL_EDITOR, `
    select ticket_id, report_count, sla_status, id from public.tickets where id = '${LEGACY_TICKET}'`);
  check(
    'legacy ticket backfilled (ticket_id, report_count from priority)',
    legacy[0]?.ticket_id === LEGACY_TICKET && legacy[0]?.report_count === 2 && legacy[0]?.sla_status === 'on_track',
    JSON.stringify(legacy[0])
  );

  const viewCols = await queryAs(pg, SQL_EDITOR, `
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'public_issues'`);
  const viewCol = new Set(viewCols.map((row) => row.column_name));
  check(
    'public_issues exposes the public feed columns',
    ['status', 'report_count', 'timeline', 'ward_id', 'satisfaction'].every((c) => viewCol.has(c)) && viewCol.size > 0
  );
  check(
    'public_issues excludes personal columns (user_id / rating / feedback_at)',
    !viewCol.has('user_id') && !viewCol.has('rating') && !viewCol.has('feedback_at')
  );

  // -------------------------------------------------------------------------
  section('Fixtures: wards, accounts and complaints');
  // -------------------------------------------------------------------------

  await execAs(pg, SQL_EDITOR, `
insert into public.wards (ward_id, ward_number, ward_name, zone) values
  ('W1', '1', 'Ward One', 'Zone North'),
  ('W2', '2', 'Ward Two', 'Zone South');

insert into auth.users (id, email, raw_user_meta_data) values
  ('${CITIZEN_A}', 'asha@example.com',  '{"full_name":"Asha","phone":"9000000001"}'),
  ('${CITIZEN_B}', 'bala@example.com',  '{"full_name":"Bala","phone":"9000000002"}'),
  ('${OFFICER_1}', 'officer1@example.com', '{"full_name":"Officer One"}'),
  ('${OFFICER_2}', 'officer2@example.com', '{"full_name":"Officer Two"}'),
  ('${OFFICER_3}', 'officer3@example.com', '{"full_name":"Officer Three"}'),
  ('${ADMIN_1}',   'admin@example.com',   '{"full_name":"Admin"}'),
  ('${EVE}',       'eve@example.com',     '{"full_name":"Eve"}');

update public.profiles set role = 'officer' where id in ('${OFFICER_1}', '${OFFICER_2}', '${OFFICER_3}');
update public.profiles set role = 'admin' where id = '${ADMIN_1}';

insert into public.officer_profiles (user_id, officer_id, ward_id, department, active) values
  ('${OFFICER_1}', null, 'W1', 'Public Works', true),
  ('${OFFICER_3}', null, 'W1', 'Public Works', false);

insert into public.tickets (id, ticket_id, description, status, priority_score, report_count, ward_id, user_id, resolved_at, resolution_note) values
  ('UG-2026-00001', 'UG-2026-00001', 'Pothole near school',  'In Progress', 2, 2, 'W1', '${CITIZEN_A}', null, null),
  ('UG-2026-00002', 'UG-2026-00002', 'Streetlight out',     'Open',        1, 1, 'W2', '${CITIZEN_B}', null, null),
  ('UG-2026-00003', 'UG-2026-00003', 'Guest complaint',     'Open',        1, 1, 'W1', null,           null, null),
  ('UG-2026-00004', 'UG-2026-00004', 'Garbage cleared',     'Resolved',    1, 1, 'W1', '${CITIZEN_A}', now(), 'Cleared'),
  ('UG-2026-00005', 'UG-2026-00005', 'Drain desilted',      'Resolved',    1, 1, 'W1', '${CITIZEN_B}', now(), 'Desilted');
`);

  const profiles = await queryAs(pg, SQL_EDITOR, `select count(*)::int as n from public.profiles`);
  check('every auth signup creates a citizen profile', profiles[0].n === 7);

  // -------------------------------------------------------------------------
  section('Anonymous visitors');
  // -------------------------------------------------------------------------

  const anonGrant = await queryAs(pg, SQL_EDITOR, `select has_table_privilege('anon', 'public.tickets', 'select') as ok`);
  const anonTickets = await queryAs(pg, ANON, `select id from public.tickets`);
  check(
    'anon holds the table grant yet RLS returns zero tickets directly',
    anonGrant[0].ok === true && anonTickets.length === 0
  );

  const anonProfiles = await queryAs(pg, ANON, `select id from public.profiles`);
  check('anon cannot read profiles', anonProfiles.length === 0);

  const anonFeed = await queryAs(pg, ANON, `select id from public.public_issues`);
  check('anon reads the public issue feed (all 6 issues)', anonFeed.length === 6, `saw ${anonFeed.length}`);

  await execAs(pg, ANON, `
    insert into public.tickets
      (id, ticket_id, description, status, report_count, escalation_level, ward_id, latitude, longitude,
       satisfaction, rating, feedback_at, resolved_at, resolution_note, assigned_officer)
    values (
      'UG-2026-00010', 'UG-2026-00010', 'Guest filed complaint', 'Resolved', 9, 4, 'W1', 13.01, 80.21,
      'up', 5, now(), now(), 'fabricated', 'fake-officer'
    )`);
  const guestRow = await queryAs(pg, SQL_EDITOR, `
    select status, report_count, escalation_level, satisfaction, rating, feedback_at, resolved_at, resolution_note, assigned_officer
    from public.tickets where id = 'UG-2026-00010'`);
  check(
    'guest insert sanitised: status Open, count 1, no escalation, no fabricated resolution',
    guestRow[0]?.status === 'Open' &&
      guestRow[0]?.report_count === 1 &&
      guestRow[0]?.escalation_level === 0 &&
      guestRow[0]?.satisfaction === null &&
      guestRow[0]?.rating === null &&
      guestRow[0]?.feedback_at === null &&
      guestRow[0]?.resolved_at === null &&
      guestRow[0]?.resolution_note === null &&
      guestRow[0]?.assigned_officer === null
  );

  const anonCredit = await expectError(
    pg, ANON,
    `insert into public.tickets (id, ticket_id, description, ward_id, user_id) values ('UG-2026-00012', 'UG-2026-00012', 'Credited to someone else', 'W1', '${CITIZEN_A}')`,
    'row-level security'
  );
  check('guest cannot file a complaint credited to another account', anonCredit.ok, anonCredit.message);

  // -------------------------------------------------------------------------
  section('Citizen account (ward W1 owner)');
  // -------------------------------------------------------------------------

  const A = asUser(CITIZEN_A);
  const aOwn = await queryAs(pg, A, `select id from public.tickets order by id`);
  check('citizen sees exactly their own complaints', ids(aOwn) === 'UG-2026-00001, UG-2026-00004', ids(aOwn));

  const aOtherRead = await queryAs(pg, A, `select id from public.tickets where id = 'UG-2026-00002'`);
  check("citizen cannot read another citizen's complaint", aOtherRead.length === 0);

  const aOtherWrite = await queryAs(pg, A, `update public.tickets set latest_update = 'hijacked' where id = 'UG-2026-00002' returning id`);
  check("citizen cannot update another citizen's complaint", aOtherWrite.length === 0);

  const aStatus = await expectError(
    pg, A,
    `update public.tickets set status = 'Resolved' where id = 'UG-2026-00001'`,
    'Only officers can change the complaint status'
  );
  check('citizen cannot mark their own complaint Resolved', aStatus.ok, aStatus.message);

  const aDispatch = await expectError(
    pg, A,
    `update public.tickets set priority_score = 5 where id = 'UG-2026-00001'`,
    'dispatch-controlled'
  );
  check('citizen cannot edit dispatch-controlled fields', aDispatch.ok, aDispatch.message);

  const aWard = await expectError(
    pg, A,
    `update public.tickets set ward_id = 'W2' where id = 'UG-2026-00001'`,
    'dispatch-controlled'
  );
  check('citizen cannot move a complaint to another ward', aWard.ok, aWard.message);

  const aRole = await expectError(
    pg, A,
    `update public.profiles set role = 'officer' where id = '${CITIZEN_A}'`,
    'Only administrators can change account roles'
  );
  check('citizen cannot promote themselves to officer', aRole.ok, aRole.message);

  await execAs(pg, A, `update public.profiles set full_name = 'Asha K' where id = '${CITIZEN_A}'`);
  const aProfile = await queryAs(pg, A, `select full_name from public.profiles`);
  const aProfileCount = await queryAs(pg, A, `select count(*)::int as n from public.profiles`);
  check(
    'citizen can edit their own name but reads only their own profile row',
    aProfile[0]?.full_name === 'Asha K' && aProfileCount[0].n === 1
  );

  await execAs(pg, A, `
    update public.tickets set satisfaction = 'up', rating = 5, feedback_at = now()
    where id = 'UG-2026-00004'`);
  const thumbsUp = await queryAs(pg, SQL_EDITOR, `
    select status, satisfaction, rating from public.tickets where id = 'UG-2026-00004'`);
  check(
    'citizen 👍 verification allowed (satisfaction stored, status unchanged)',
    thumbsUp[0]?.status === 'Resolved' && thumbsUp[0]?.satisfaction === 'up' && thumbsUp[0]?.rating === 5
  );

  await execAs(pg, A, `
    update public.tickets
       set satisfaction = 'down',
           status = 'In Progress',
           latest_update = 'Reopened after citizen reported the problem persists.'
     where id = 'UG-2026-00004'`);
  const reopen = await queryAs(pg, SQL_EDITOR, `
    select status, satisfaction from public.tickets where id = 'UG-2026-00004'`);
  const reopenHistory = await queryAs(pg, SQL_EDITOR, `
    select from_status, to_status from public.ticket_status_history
    where ticket_id = 'UG-2026-00004' order by created_at`);
  check(
    'citizen 👎 reopens Resolved → In Progress with satisfaction down',
    reopen[0]?.status === 'In Progress' && reopen[0]?.satisfaction === 'down'
  );
  check(
    'reopen recorded in status history',
    reopenHistory.length === 1 && reopenHistory[0].from_status === 'Resolved' && reopenHistory[0].to_status === 'In Progress',
    JSON.stringify(reopenHistory)
  );

  const aNotif = await queryAs(pg, A, `select count(*)::int as n from public.notifications`);
  const bNotifBefore = await queryAs(pg, asUser(CITIZEN_B), `select count(*)::int as n from public.notifications`);
  check(
    'reopen notified the owner; other citizens read nothing',
    aNotif[0].n === 1 && bNotifBefore[0].n === 0,
    `owner=${aNotif[0].n} other=${bNotifBefore[0].n}`
  );

  // -------------------------------------------------------------------------
  section('Officer account (ward W1 scope)');
  // -------------------------------------------------------------------------

  const O1 = asUser(OFFICER_1);
  const o1Visible = await queryAs(pg, O1, `select id from public.tickets order by id`);
  check(
    'officer sees exactly the complaints in their ward (guests included)',
    ids(o1Visible) === 'UG-2026-00001, UG-2026-00003, UG-2026-00004, UG-2026-00005, UG-2026-00010',
    ids(o1Visible)
  );

  const o1CrossWardWrite = await queryAs(pg, O1, `update public.tickets set latest_update = 'out of scope' where id = 'UG-2026-00002' returning id`);
  check('officer cannot update a complaint outside their ward', o1CrossWardWrite.length === 0);

  await execAs(pg, O1, `
    update public.tickets
       set status = 'Resolved', resolution_note = 'Fixed', latest_update = 'Repaired', resolved_at = now()
     where id = 'UG-2026-00001'`);

  const o1Resolved = await queryAs(pg, SQL_EDITOR, `select status, resolution_note from public.tickets where id = 'UG-2026-00001'`);
  const o1History = await queryAs(pg, SQL_EDITOR, `
    select from_status, to_status, actor_name from public.ticket_status_history where ticket_id = 'UG-2026-00001'`);
  const aNotifAfter = await queryAs(pg, A, `select count(*)::int as n from public.notifications`);
  const o1Audit = await queryAs(pg, O1, `select id from public.audit_logs`);
  const auditRow = await queryAs(pg, SQL_EDITOR, `
    select action, actor_role, detail from public.audit_logs where entity = 'tickets' order by created_at desc limit 1`);
  check(
    'officer status update persists and tells the citizen',
    o1Resolved[0]?.status === 'Resolved' && aNotifAfter[0].n === 2,
    `status=${o1Resolved[0]?.status} notifications=${aNotifAfter[0].n}`
  );
  check(
    'officer update recorded in status history and audit log (officers may read it)',
    o1History.some((h) => h.from_status === 'In Progress' && h.to_status === 'Resolved') &&
      o1Audit.length >= 1 &&
      auditRow[0]?.action === 'ticket.update' &&
      auditRow[0]?.actor_role === 'officer' &&
      auditRow[0]?.detail?.to_status === 'Resolved',
    JSON.stringify({ history: o1History, auditRow })
  );

  const o1OwnScope = await queryAs(pg, O1, `select user_id from public.officer_profiles`);
  check('officer reads only their own scope row', o1OwnScope.length === 1 && o1OwnScope[0].user_id === OFFICER_1);

  const o1WardInsert = await expectError(
    pg, O1,
    `insert into public.wards (ward_id, ward_number, ward_name, zone) values ('W9', '9', 'Nine', 'Zone X')`,
    'row-level security'
  );
  check('officer cannot create wards (admin-only)', o1WardInsert.ok, o1WardInsert.message);

  const o1Provision = await expectError(
    pg, O1,
    `insert into public.officer_profiles (user_id, ward_id) values ('${EVE}', 'W1')`,
    'row-level security'
  );
  check('officer cannot provision officer accounts', o1Provision.ok, o1Provision.message);

  const o2Visible = await queryAs(pg, asUser(OFFICER_2), `select id from public.tickets`);
  const o3Visible = await queryAs(pg, asUser(OFFICER_3), `select id from public.tickets`);
  check('officer without a ward assignment sees nothing (deny by default)', o2Visible.length === 0);
  check('deactivated officer scope sees nothing', o3Visible.length === 0);

  // -------------------------------------------------------------------------
  section('Administrator');
  // -------------------------------------------------------------------------

  const ADM = asUser(ADMIN_1);
  const admTickets = await queryAs(pg, ADM, `select id from public.tickets`);
  check('admin sees every complaint across wards', admTickets.length === 7, `saw ${admTickets.length}`);

  await execAs(pg, ADM, `insert into public.wards (ward_id, ward_number, ward_name, zone) values ('W3', '3', 'Ward Three', 'Zone East')`);
  const dupId = await expectError(
    pg, ADM,
    `insert into public.wards (ward_id, ward_number, ward_name, zone) values ('W3', '4', 'Duplicate id', 'Zone East')`,
    'duplicate key'
  );
  const dupNumber = await expectError(
    pg, ADM,
    `insert into public.wards (ward_id, ward_number, ward_name, zone) values ('W4', '3', 'Duplicate number', 'Zone East')`,
    'duplicate key'
  );
  check('one ward = one unique Ward ID, one unique Ward Number', dupId.ok && dupNumber.ok, `${dupId.message} | ${dupNumber.message}`);

  await execAs(pg, ADM, `insert into public.officer_profiles (user_id, ward_id, department) values ('${EVE}', 'W2', 'Roads')`);
  const eveVisible = await queryAs(pg, asUser(EVE), `select id from public.tickets`);
  check(
    'a scope row alone does not make someone an officer (role comes from profiles, admin-set)',
    eveVisible.length === 0
  );

  const admAudit = await queryAs(pg, ADM, `select count(*)::int as n from public.audit_logs`);
  const dirAudit = await queryAs(pg, ADM, `select entity from public.audit_logs where action like 'directory.%' order by created_at desc limit 1`);
  check('admin reads the audit log (ticket + directory activity)', admAudit[0].n >= 2 && dirAudit[0]?.entity === 'wards', JSON.stringify({ n: admAudit[0].n, dir: dirAudit }));

  const admNotif = await queryAs(pg, ADM, `select count(*)::int as n from public.notifications`);
  check('admin can read all notifications', admNotif[0].n >= 2);

  // -------------------------------------------------------------------------
  section('Duplicate merging — support_complaint()');
  // -------------------------------------------------------------------------

  const merge1 = await queryAs(pg, ANON, `
    select report_count, priority_score, jsonb_array_length(timeline) as timeline_len
    from public.support_complaint('UG-2026-00002', 'Same streetlight is still out', null, 13.06, 80.25, 'Streetlight')`);
  const bNotif1 = await queryAs(pg, asUser(CITIZEN_B), `select count(*)::int as n from public.notifications`);
  check(
    'guest support merges into the existing ticket (count 1 → 2, timeline + notification)',
    merge1[0]?.report_count === 2 && merge1[0]?.timeline_len >= 1 && bNotif1[0].n === 1,
    JSON.stringify({ merge1, bNotif: bNotif1[0].n })
  );

  const merge2 = await queryAs(pg, A, `
    select report_count, priority_score from public.support_complaint('UG-2026-00002', 'My third report of the same problem')`);
  const subCount = await queryAs(pg, SQL_EDITOR, `
    select count(*)::int as n from public.submissions where ticket_id = 'UG-2026-00002'`);
  const bNotif2 = await queryAs(pg, asUser(CITIZEN_B), `select count(*)::int as n from public.notifications`);
  check(
    "signed-in citizen supports another citizen's ticket (guard does not block the merge)",
    merge2[0]?.report_count === 3 && Number(merge2[0]?.priority_score) >= 2,
    JSON.stringify(merge2[0])
  );
  check(
    'each report is preserved as a submission row; owner notified again',
    subCount[0].n === 2 && bNotif2[0].n === 2,
    JSON.stringify({ submissions: subCount[0].n, notifications: bNotif2[0].n })
  );

  const resolvedSupport = await expectError(
    pg, ANON,
    `select public.support_complaint('UG-2026-00005', 'Still broken')`,
    'already resolved'
  );
  check('a resolved complaint cannot be supported again', resolvedSupport.ok, resolvedSupport.message);

  const publicSubs = await queryAs(pg, ANON, `select count(*)::int as n from public.submissions`);
  check('public record of merged reports is readable', publicSubs[0].n >= 3, `saw ${publicSubs[0].n}`);

  // -------------------------------------------------------------------------
  section('Signup cannot self-assign a role');
  // -------------------------------------------------------------------------

  await execAs(pg, SQL_EDITOR, `
    insert into auth.users (id, email, raw_user_meta_data)
    values ('${NEW_SIGNUP}', 'mallory@example.com', '{"full_name":"Mallory","role":"admin","phone":"9000000009"}')`);
  const mallory = await queryAs(pg, SQL_EDITOR, `
    select role, full_name from public.profiles where id = '${NEW_SIGNUP}'`);
  check(
    'role claim in signup metadata is ignored — profile is always created as citizen',
    mallory[0]?.role === 'citizen' && mallory[0]?.full_name === 'Mallory',
    JSON.stringify(mallory[0])
  );

  // -------------------------------------------------------------------------
  section('Idempotency — re-running the migrations');
  // -------------------------------------------------------------------------

  try {
    for (const file of MIGRATIONS) {
      await pg.exec(readFileSync(join(here, 'migrations', file), 'utf8'));
    }
    check('migrations re-run without errors', true);
  } catch (error) {
    check('migrations re-run without errors', false, String(error?.message || error));
  }

  const ticketsAfter = await queryAs(pg, SQL_EDITOR, `select count(*)::int as n from public.tickets`);
  const rolesAfter = await queryAs(pg, SQL_EDITOR, `select count(*)::int as n from public.app_roles`);
  const anonAfter = await queryAs(pg, ANON, `select id from public.tickets`);
  const o2After = await queryAs(pg, asUser(OFFICER_2), `select id from public.tickets`);
  const dupAfter = await expectError(
    pg, asUser(ADMIN_1),
    `insert into public.wards (ward_id, ward_number, ward_name, zone) values ('W3', '3', 'Again', 'Zone East')`,
    'duplicate key'
  );
  check(
    'data and security model survive the re-run',
    ticketsAfter[0].n === 7 && rolesAfter[0].n === 3 && anonAfter.length === 0 && o2After.length === 0 && dupAfter.ok,
    JSON.stringify({ tickets: ticketsAfter[0].n, roles: rolesAfter[0].n, anon: anonAfter.length, o2: o2After.length, dup: dupAfter.ok })
  );

  // -------------------------------------------------------------------------
  section('Overdue sweep — mark_overdue_tickets()');
  // -------------------------------------------------------------------------

  await execAs(pg, SQL_EDITOR, `
insert into public.tickets
  (id, ticket_id, description, status, priority_score, report_count, ward_id, user_id,
   deadline, escalation_level, sla_status, created_at)
values
  ('UG-2026-00021', 'UG-2026-00021', 'Overdue pothole in Ward One',  'Open',     3, 1, 'W1', '${CITIZEN_A}', now() - interval '2 days', 0, 'on_track', now() - interval '6 days'),
  ('UG-2026-00023', 'UG-2026-00023', 'Target date still ahead',     'Open',     1, 1, 'W1', '${CITIZEN_A}', now() + interval '7 days', 0, 'on_track', now()),
  ('UG-2026-00024', 'UG-2026-00024', 'Resolved before the target',  'Resolved', 1, 1, 'W1', '${CITIZEN_A}', now() - interval '3 days', 1, 'on_track', now() - interval '9 days'),
  ('UG-2026-00025', 'UG-2026-00025', 'No target date set',          'Open',     1, 1, 'W1', null,           null,                      0, 'on_track', now());

insert into public.tickets
  (id, ticket_id, description, status, priority_score, report_count, ward_id, user_id,
   response_deadline, escalation_level, sla_status, created_at)
values
  ('UG-2026-00022', 'UG-2026-00022', 'Overdue drain in Ward Two', 'In Progress', 2, 1, 'W2', '${CITIZEN_B}', now() - interval '1 day', 1, 'on_track', now() - interval '5 days');
`);

  const anonSweep = await expectError(
    pg, ANON, `select public.mark_overdue_tickets()`, 'Only officers or administrators'
  );
  const citizenSweep = await expectError(
    pg, asUser(CITIZEN_A), `select public.mark_overdue_tickets()`, 'Only officers or administrators'
  );
  check(
    'guests and citizens cannot run the overdue sweep',
    anonSweep.ok && citizenSweep.ok,
    `${anonSweep.message} | ${citizenSweep.message}`
  );

  const auditBefore = await queryAs(pg, SQL_EDITOR, `
    select count(*)::int as n from public.audit_logs where action = 'ticket.update'`);

  const swept1 = await queryAs(pg, O1, `select public.mark_overdue_tickets() as marked`);
  const t21 = await queryAs(pg, SQL_EDITOR, `select sla_status, escalation_level from public.tickets where id = 'UG-2026-00021'`);
  const t22 = await queryAs(pg, SQL_EDITOR, `select sla_status, escalation_level from public.tickets where id = 'UG-2026-00022'`);
  const t23 = await queryAs(pg, SQL_EDITOR, `select sla_status from public.tickets where id = 'UG-2026-00023'`);
  const t24 = await queryAs(pg, SQL_EDITOR, `select sla_status from public.tickets where id = 'UG-2026-00024'`);
  const t25 = await queryAs(pg, SQL_EDITOR, `select sla_status from public.tickets where id = 'UG-2026-00025'`);
  check(
    "officer sweep marks only their ward's overdue complaint (sla_status + escalation)",
    swept1[0]?.marked === 1 && t21[0]?.sla_status === 'overdue' && t21[0]?.escalation_level === 1,
    JSON.stringify({ swept: swept1[0]?.marked, t21: t21[0] })
  );
  check(
    'other ward stays untouched for a ward-scoped officer; future / resolved / undated stay on track',
    t22[0]?.sla_status === 'on_track' && t22[0]?.escalation_level === 1 &&
      t23[0]?.sla_status === 'on_track' && t24[0]?.sla_status === 'on_track' && t25[0]?.sla_status === 'on_track',
    JSON.stringify({ w2: t22[0], ahead: t23[0], resolved: t24[0], undated: t25[0] })
  );

  const overdueNotif = await queryAs(pg, A, `
    select ticket_id, kind, title from public.notifications where kind = 'overdue'`);
  const bOverdue = await queryAs(pg, asUser(CITIZEN_B), `
    select count(*)::int as n from public.notifications where kind = 'overdue'`);
  check(
    'the reporting citizen is notified; other citizens see nothing',
    overdueNotif.length === 1 && overdueNotif[0].ticket_id === 'UG-2026-00021' &&
      overdueNotif[0].title.includes('UG-2026-00021') && bOverdue[0].n === 0,
    JSON.stringify({ owner: overdueNotif, other: bOverdue[0].n })
  );

  const auditAfter = await queryAs(pg, SQL_EDITOR, `
    select count(*)::int as n from public.audit_logs where action = 'ticket.update'`);
  const sweepAudit = await queryAs(pg, SQL_EDITOR, `
    select actor_role, detail from public.audit_logs where action = 'tickets.overdue_sweep'`);
  check(
    'sweep writes one summary audit entry instead of one per ticket',
    auditAfter[0].n === auditBefore[0].n && sweepAudit.length === 1 &&
      sweepAudit[0]?.detail?.marked === 1 && sweepAudit[0]?.actor_role === 'officer',
    JSON.stringify({ perRowBefore: auditBefore[0].n, perRowAfter: auditAfter[0].n, sweep: sweepAudit[0] })
  );

  const aAudit = await queryAs(pg, A, `select id from public.audit_logs`);
  check('citizens still cannot read the staff audit log', aAudit.length === 0);

  const swept2 = await queryAs(pg, O1, `select public.mark_overdue_tickets() as marked`);
  check('re-running the sweep marks nothing twice', swept2[0]?.marked === 0, String(swept2[0]?.marked));

  const swept3 = await queryAs(pg, ADM, `select public.mark_overdue_tickets() as marked`);
  const t22b = await queryAs(pg, SQL_EDITOR, `select sla_status, escalation_level from public.tickets where id = 'UG-2026-00022'`);
  check(
    'administrator sweep covers every ward (W2 marked, escalation raised)',
    swept3[0]?.marked === 1 && t22b[0]?.sla_status === 'overdue' && t22b[0]?.escalation_level === 2,
    JSON.stringify({ swept: swept3[0]?.marked, t22: t22b[0] })
  );

  await execAs(pg, SQL_EDITOR, `
    insert into public.tickets
      (id, ticket_id, description, status, priority_score, report_count, ward_id, user_id,
       deadline, escalation_level, sla_status)
    values ('UG-2026-00026', 'UG-2026-00026', 'Ownerless chronic spot', 'Open', 2, 3, 'W2', null,
            now() - interval '12 hours', 3, 'on_track')`);
  const swept4 = await queryAs(pg, ADM, `select public.mark_overdue_tickets() as marked`);
  const t26 = await queryAs(pg, SQL_EDITOR, `
    select sla_status, escalation_level from public.tickets where id = 'UG-2026-00026'`);
  check(
    'escalation is capped at 3 and ownerless complaints are marked without a notification',
    swept4[0]?.marked === 1 && t26[0]?.sla_status === 'overdue' && t26[0]?.escalation_level === 3,
    JSON.stringify({ swept: swept4[0]?.marked, t26: t26[0] })
  );

  await pg.close();

  // -------------------------------------------------------------------------
  section('Orphan-submissions install (FK tolerated with a warning)');
  // -------------------------------------------------------------------------

  const orphan = new PGlite();
  if (orphan.waitReady) await orphan.waitReady;
  await orphan.exec(SHIM_SQL);
  await orphan.exec(LEGACY_SHAPE_SQL);
  await orphan.exec(`
    insert into public.submissions (ticket_id, description)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'orphan row from a previous experiment')`);
  let orphanOk = true;
  try {
    for (const file of MIGRATIONS) {
      await orphan.exec(readFileSync(join(here, 'migrations', file), 'utf8'));
    }
  } catch (error) {
    orphanOk = false;
    check('orphan install: migrations still complete', false, String(error?.message || error));
  }
  if (orphanOk) {
    const orphanFk = await queryAs(orphan, SQL_EDITOR, `
      select count(*)::int as n from pg_constraint where conname = 'submissions_ticket_id_fkey'`);
    const orphanRows = await queryAs(orphan, SQL_EDITOR, `select count(*)::int as n from public.submissions`);
    check(
      'orphan rows keep the FK out but never abort the migration chain',
      orphanFk[0].n === 0 && orphanRows[0].n === 2,
      JSON.stringify({ fk: orphanFk[0].n, rows: orphanRows[0].n })
    );
  }
  await orphan.close();

  // -------------------------------------------------------------------------
  console.log(`\n${'='.repeat(60)}`);
  if (failures.length === 0) {
    console.log(`All ${passed} verification checks passed.`);
  } else {
    console.log(`${passed} passed, ${failures.length} FAILED:`);
    for (const name of failures) console.log(`  - ${name}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nHarness crashed:', error);
  process.exitCode = 1;
});
