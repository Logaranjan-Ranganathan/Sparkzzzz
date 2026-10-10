# UrbanGrid — Civic Issue Management System

A Ward / Area / Place aware civic complaint platform. Citizens report civic
problems (potholes, streetlights, drainage, waste…), the app detects the ward
from GPS, and municipal officers work a ward-scoped dispatch queue with
deadlines, an audit trail and citizen notifications.

**Demo notice:** the Chennai wards, places and officer contacts shipped with
this project are demonstration data for evaluation. Target response times are
configurable examples, not official government service guarantees.

## Two experiences, one codebase

| Experience | Routes | Notes |
| --- | --- | --- |
| Public citizen portal | `/`, `/report-issue`, `/my-complaints`, `/track-complaint/:id`, `/login`, `/register` | Anyone can report and track a complaint; signing in adds "my complaints" and notifications. |
| Municipal officer console | `/officer/login`, `/officer/dashboard`, `/officer/issues` | Accounts are **provisioned by an administrator** — there is no officer self-registration, and the console is protected by database Row Level Security, not just by hidden buttons. |

Citizens never type a ward number: the ward is detected from the selected
location (GPS or the place directory). One real-world problem is one ticket;
extra reports for the same problem are merged into it and increase its
`report_count`.

## Environment variables

Copy `.env.local.example` (or create `.env.local`) with:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon/publishable key>
```

Only the **anon (publishable) key** belongs in the frontend. Never put the
`service_role` key or database passwords in any `VITE_` variable — anything
prefixed `VITE_` is shipped to the browser.

## Local development

```bash
npm install
npm run dev          # start the dev server
npm run lint         # eslint
npm run build        # production build (dist/)
npm run verify:db    # real-Postgres check of migrations 001-004 (PGlite, no server needed)
```

## Database setup (Supabase)

Run these files **in order** in the Supabase SQL editor (Dashboard → SQL
Editor). They are idempotent, so re-running is safe.

1. `supabase/migrations/001_duplicate_sla.sql` — duplicate-report merging + SLA columns
2. `supabase/migrations/002_ward_hierarchy.sql` — wards → areas → places + ticket extension
3. `supabase/migrations/003_auth_roles_rls.sql` — profiles, roles, officer scope, RLS, guard triggers
4. `supabase/migrations/004_overdue_notifications.sql` — overdue sweep + notifications + staff audit visibility

`npm run verify:db` proves the security model in a real Postgres (PGlite)
before you apply anything: RLS isolation, ward scoping, role-escalation
blocks, duplicate merging, the overdue sweep and idempotency.

## Officer accounts

Officer accounts are created by invitation only:

1. An administrator creates the user (Supabase Dashboard → Authentication →
   Users → *Add user*, or the user registers and is then promoted).
2. Promote that user with the documented statements in
   `supabase/officer-provisioning.sql` (set `profiles.role`, insert the
   `officer_profiles` ward scope row).

Roles are stored in `public.profiles` and protected by triggers — nobody can
change their own role, and no frontend value is trusted.

## Deploying to Vercel

The repository is a single Vite app (this project's `package.json` sits at the
repository root of `Logaranjan-Ranganathan/Sparkzzzz`).

1. In Vercel, **Add New → Project → Import Git Repository** and pick the
   GitHub repository, then complete the authorization Vercel asks for.
2. **Root Directory:** leave it at the repository root. (Only if your copy of
   the repo nests the app in a subfolder such as `urbngrid/` should you set
   Root Directory to that folder — the build must run against the
   `package.json` that has the `vite` scripts.)
3. Framework preset **Vite**, build command `npm run build`, output `dist` —
   these are pinned in `vercel.json`, which also adds the SPA rewrite so deep
   links like `/track-complaint/UG-2026-00101` never 404 on refresh.
4. **Environment Variables** (Production and Preview): `VITE_SUPABASE_URL`
   and `VITE_SUPABASE_ANON_KEY` with the same values as `.env.local`. No
   localhost URLs — production uses the Supabase project URL.
5. Deploy, then open the production URL and smoke-test: `/`, `/register`,
   `/login`, `/officer/login`, and a direct refresh on a nested route.
6. In Supabase → Authentication → URL Configuration, set the **Site URL** to
   the production domain and add it to **Redirect URLs** so email
   verification and password-reset links return to the deployed app.

## Tests

- `npm run verify:db` — 59 database/security checks (migrations 001-004).
- `npm run lint` and `npm run build` — must be clean before deploying.
