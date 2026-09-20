-- Tech Titans 25783 — Team app schema
-- Run this once in the Supabase project's SQL Editor (Database > SQL Editor).
-- Safe to re-run: every statement is idempotent, including on a database
-- that already has an earlier version of this schema applied.

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
do $$ begin
  create type user_role as enum ('member', 'team_lead', 'owner', 'parent');
exception when duplicate_object then null; end $$;

-- Migrating from an earlier version of this schema that only had
-- ('member', 'admin', 'owner'): rename 'admin' to 'team_lead'. No-op if
-- already migrated or if this is a fresh install (RENAME VALUE is safe to
-- run inside a DO block, unlike ADD VALUE below). The exception handler here
-- is intentionally broad (rename fails for several unrelated reasons
-- depending on what the enum already looks like) — the bare ADD VALUE right
-- after it is the real safety net, guaranteeing 'team_lead' exists even if
-- this rename silently no-ops.
do $$ begin
  alter type user_role rename value 'admin' to 'team_lead';
exception when others then null; end $$;

-- ADD VALUE cannot run inside a DO block/transaction in Postgres, so these
-- have to be bare top-level statements — IF NOT EXISTS makes them idempotent.
alter type user_role add value if not exists 'team_lead';
alter type user_role add value if not exists 'parent';

do $$ begin
  create type subteam as enum ('mechanical', 'electrical', 'cad', 'software', 'outreach', 'marketing');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pending', 'active', 'archived');
exception when duplicate_object then null; end $$;
alter type task_status add value if not exists 'completed';

do $$ begin
  create type task_priority as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type volunteer_type as enum ('parent', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scan_action as enum ('remove', 'add');
exception when duplicate_object then null; end $$;
-- Disassembly's "mark lost" — units written off instead of returned to
-- stock, kept distinct from 'add' so a part's scan history can tell the two
-- apart.
alter type scan_action add value if not exists 'lost';

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  username text not null,
  username_lower text generated always as (lower(username)) stored,
  role user_role not null default 'member',
  subteam subteam,
  avatar_url text,
  must_reset_password boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists users_username_lower_idx on public.users (username_lower);
alter table public.users add column if not exists avatar_url text;
-- Optional — edited from My Profile (self) or the Admin Dashboard (staff),
-- same manage_members permission as editing someone's email.
alter table public.users add column if not exists phone text;
-- Optional, self-only free-text bio shown on My Profile.
alter table public.users add column if not exists bio text;
-- Light/dark/system, saved per-account so it follows a member to any device
-- they sign in on (see ThemeProvider + updateThemeAction).
alter table public.users add column if not exists theme text not null default 'system'
  check (theme in ('light', 'dark', 'system'));

-- Full role/permission system. A role (system or custom) grants a set of
-- permissions via role_permissions; users.role_id is the source of truth
-- for what a user can do. users.role (the old fixed enum) is kept in sync
-- automatically as a *derived* legacy field — every custom role still maps
-- to one of the four tiers via maps_to, and that mirrored value is what a
-- handful of genuinely structural (non-permission) checks key off:
-- parent-only navigation, events.visible_to targeting, "am I eligible to
-- clock in" — none of which are things a role's permissions should be able
-- to change. Owner is special-cased everywhere in code (isOwner()) rather
-- than via a permission: there must always be exactly one, and only the
-- literal Owner may ever grant Owner/Team-Lead-tier access.
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  maps_to user_role not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists roles_name_lower_idx on public.roles (lower(name));
alter table public.roles add column if not exists is_system boolean not null default false;

create table if not exists public.permissions (
  key text primary key,
  label text not null,
  description text
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

alter table public.users add column if not exists custom_role_id uuid references public.roles (id) on delete set null;
alter table public.users add column if not exists role_id uuid references public.roles (id) on delete set null;

-- Seed the fixed permission catalog (see src/lib/permissions.ts — the two
-- must be kept in sync by hand; there's no generator).
insert into public.permissions (key, label, description) values
  ('approve_tasks', 'Approve tasks', 'Approve or reject pending tasks; a role with this skips approval on its own submissions'),
  ('edit_tasks', 'Edit tasks', 'Edit, archive/unarchive tasks, and change who''s assigned'),
  ('delete_tasks', 'Delete tasks', 'Permanently delete a task and its log entries'),
  ('edit_projects', 'Edit projects', 'Change a project''s deadline and color'),
  ('delete_projects', 'Delete projects', 'Permanently delete a project and every task inside it'),
  ('manage_events', 'Manage events', 'Create/edit events, assign volunteers, cancel someone else''s sign-up'),
  ('delete_events', 'Delete events', 'Permanently delete an event and its sign-ups'),
  ('manage_parts', 'Manage parts', 'Add, edit, or delete parts; import a BOM; fetch missing images'),
  ('manage_members', 'Manage members', 'Add members, reset passwords, edit member info, change roles (up to Team Lead)'),
  ('manage_roles', 'Manage roles', 'Create, delete, and edit custom roles and their permissions'),
  ('view_admin_hours', 'View hour tracking', 'View the Admin Dashboard''s hour totals and the Activity Report'),
  ('delete_clock_sessions', 'Delete clock sessions', 'Remove a member''s individual clock-in/out entry')
on conflict (key) do nothing;

-- Seed the four system roles (safe to re-run) and grant Team Lead the same
-- default permissions the app used to hardcode via isStaff() — behavior is
-- unchanged out of the box until the Owner adjusts something. Owner gets
-- every permission recorded too (even though isOwner() bypasses the table
-- entirely in code) purely so the Roles panel's checkbox grid reads correctly.
insert into public.roles (name, maps_to, is_system)
values ('Owner', 'owner', true), ('Team Lead', 'team_lead', true), ('Team Member', 'member', true), ('Parent', 'parent', true)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r, public.permissions p
where r.name = 'Owner' and r.is_system
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r, public.permissions p
where r.name = 'Team Lead' and r.is_system and p.key not in ('manage_roles', 'delete_clock_sessions')
on conflict do nothing;

-- Backfill every user's role_id: from their existing custom_role_id if they
-- had one (Phase 7's scoped-down version), otherwise their matching system
-- role for their current tier.
update public.users u set role_id = u.custom_role_id where u.role_id is null and u.custom_role_id is not null;
update public.users u set role_id = r.id from public.roles r
where r.is_system and r.maps_to = u.role and u.role_id is null;

alter table public.users drop column if exists custom_role_id;

create table if not exists public.clock_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  -- true when this session was force-closed rather than explicitly ended
  -- (the member never clicked Clock Out — closed the tab, lost power,
  -- etc.), whether that was middleware noticing a stale heartbeat while
  -- they were still signed in elsewhere, or the nightly cron catching
  -- anything left open overnight. Drives the "what did you work on last
  -- time?" prompt.
  auto_clocked_out boolean not null default false,
  -- Set once the member has either submitted a catch-up log for this session
  -- or explicitly skipped it — stops the prompt from asking again.
  catch_up_resolved boolean not null default false,
  -- Refreshed on every authenticated request while this session is open —
  -- lets middleware notice "no request in a while" and treat the tab as
  -- closed immediately, instead of waiting for the nightly cron.
  last_seen_at timestamptz not null default now()
);
create index if not exists clock_sessions_user_idx on public.clock_sessions (user_id);
alter table public.clock_sessions add column if not exists auto_clocked_out boolean not null default false;
alter table public.clock_sessions add column if not exists catch_up_resolved boolean not null default false;
alter table public.clock_sessions add column if not exists last_seen_at timestamptz not null default now();

-- Append-only audit trail for Owner-only clock_sessions deletions (e.g. a
-- forgotten clock-out that inflated someone's hours) — the row itself is
-- hard-deleted from clock_sessions (so hour totals everywhere are correct
-- automatically, no risk of a missed filter), but a snapshot is kept here
-- so there's still a record of what got removed and by whom.
create table if not exists public.clock_session_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  deleted_by uuid references public.users (id) on delete set null,
  deleted_at timestamptz not null default now()
);

-- created_by/approved_by/user_id below are nullable with ON DELETE SET NULL:
-- deleting a member's account (Owner-only) shouldn't destroy the team's task
-- and log history, it should just orphan the "who did this" attribution.

-- The Projects tab's projects (e.g. "V1", "Clubhouse Outreach Event") — a
-- separate, name-only concept from the Build tab's public.projects (used for
-- parts allocation). A matching name between the two is just a coincidence
-- the UI can offer to cross-link, not a shared identity.
create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  deadline date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- A stable color (from a small fixed palette, see src/lib/projectColors.ts)
-- so a project renders the same color everywhere instead of being
-- re-derived per view. Assigned on creation, editable by staff.
alter table public.task_projects add column if not exists color text;
-- null = not completed; set = when it was marked complete.
alter table public.task_projects add column if not exists completed_at timestamptz;
-- Projects dashboard sorts highest priority first; defaults to 'medium' so
-- existing projects don't all pin to the top or bottom.
alter table public.task_projects add column if not exists priority task_priority not null default 'medium';
-- Free-text blurb shown when a project row is expanded on the dashboard.
alter table public.task_projects add column if not exists description text;
-- true = no fixed end date, tracked as "Ongoing" instead of forcing a deadline.
alter table public.task_projects add column if not exists ongoing boolean not null default false;

-- Every deadline change on a task_project, manual (a Team Lead/Owner edits
-- it) or automatic (a task's deadline moved past it and pulled it along) —
-- kept as an append-only history, never edited/deleted.
create table if not exists public.task_project_deadline_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.task_projects (id) on delete cascade,
  old_deadline date,
  new_deadline date,
  changed_by uuid references public.users (id) on delete set null,
  -- null = an explicit manual change; set = auto-extended, describing why.
  reason text,
  changed_at timestamptz not null default now()
);
create index if not exists task_project_deadline_log_project_idx on public.task_project_deadline_log (project_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subteam subteam not null,
  deadline date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  status task_status not null default 'pending',
  approved_by uuid references public.users (id) on delete set null,
  project_id uuid references public.task_projects (id) on delete cascade,
  description text
);
create index if not exists tasks_status_idx on public.tasks (status);
alter table public.tasks add column if not exists description text;
-- project_id was added to the CREATE TABLE above when the Projects tab
-- replaced the old flat task list, but installs whose tasks table predates
-- that never got the column — CREATE TABLE IF NOT EXISTS is a no-op on an
-- existing table, so this explicit ALTER (before the index that needs it)
-- is required for them too.
alter table public.tasks add column if not exists project_id uuid references public.task_projects (id) on delete cascade;
create index if not exists tasks_project_idx on public.tasks (project_id);
-- Projects dashboard's Priority column — every existing task defaults to
-- 'medium' rather than null, so the board never has to special-case "unset".
alter table public.tasks add column if not exists priority task_priority not null default 'medium';
-- true = ongoing work with no due date; the timeline shows "Ongoing" and the
-- deadline is ignored (and won't pull the project's deadline forward).
alter table public.tasks add column if not exists ongoing boolean not null default false;

-- Who's assigned to work a task — separate from created_by (who submitted
-- it) and task_logs.user_id (who's actually logged work on it so far).
create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists task_assignees_user_idx on public.task_assignees (user_id);

-- task_id is nullable: a null task_id is a general "what I've been doing"
-- status update tied only to a clock session, not any specific task.
create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  clock_session_id uuid references public.clock_sessions (id),
  "timestamp" timestamptz not null default now(),
  description text,
  photo_url text,
  audio_transcript text
);
create index if not exists task_logs_task_idx on public.task_logs (task_id);
do $$ begin
  alter table public.task_logs alter column task_id drop not null;
exception when undefined_table then null; end $$;
alter table public.task_logs add column if not exists clock_session_id uuid references public.clock_sessions (id);
-- Multi-photo attachments; photo_url stays populated for older single-photo
-- rows and is still read as a fallback wherever photo_urls is empty.
alter table public.task_logs add column if not exists photo_urls text[] not null default '{}';
-- A work log outlives its task (and its project). Deleting either nulls
-- task_id instead of cascading the log away, and task_title keeps the name
-- so the Clock Log still says what the log was about.
alter table public.task_logs add column if not exists task_title text;
do $$ begin
  alter table public.task_logs drop constraint if exists task_logs_task_id_fkey;
  alter table public.task_logs add constraint task_logs_task_id_fkey
    foreign key (task_id) references public.tasks (id) on delete set null;
exception when undefined_table then null; end $$;

create table if not exists public.event_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
insert into public.event_categories (name)
values ('Outreach event'), ('Competition'), ('Full team meeting'), ('Leadership meeting'), ('Other')
on conflict (name) do nothing;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  start_time time,
  end_time time,
  info text,
  parent_slots_needed integer not null default 0,
  student_slots_needed integer not null default 0,
  category_id uuid references public.event_categories (id) on delete set null,
  -- Which app roles can see this event. NULL/empty means everyone —
  -- team_lead/owner always see every event regardless, for management.
  visible_to user_role[],
  recurrence_group_id uuid,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Migrating from an earlier version of this schema with a single `time`
-- column: rename it to start_time and add end_time.
do $$ begin
  alter table public.events rename column "time" to start_time;
exception when undefined_column then null; end $$;
alter table public.events add column if not exists end_time time;
alter table public.events add column if not exists category_id uuid references public.event_categories (id) on delete set null;
alter table public.events add column if not exists visible_to user_role[];
alter table public.events add column if not exists recurrence_group_id uuid;

-- Named, admin-defined volunteer roles for an event (e.g. "Setup crew — 3",
-- "Registration desk — 2"), replacing the old fixed parent/student counts.
create table if not exists public.event_roles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  slots_needed integer not null default 0
);
create index if not exists event_roles_event_idx on public.event_roles (event_id);

create table if not exists public.event_volunteers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  email text not null,
  notes text,
  type volunteer_type,
  role_id uuid references public.event_roles (id) on delete set null,
  -- Who signed themselves up, if it was a logged-in member/parent doing it
  -- themselves (vs. a Team Lead assigning a walk-in by name/email). Lets a
  -- volunteer cancel their own signup and lets us show "who" in the admin view.
  user_id uuid references public.users (id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
-- Migrating an existing table: `type` used to be required, now optional
-- now that signups are tied to a role_id instead.
do $$ begin
  alter table public.event_volunteers alter column type drop not null;
exception when undefined_column then null; end $$;

-- role_id was added to the CREATE TABLE above when named roles replaced the
-- old fixed parent/student counts, but installs whose event_volunteers table
-- predates that never got the column — CREATE TABLE IF NOT EXISTS is a no-op
-- on an existing table, so this explicit ALTER is required for them too.
alter table public.event_volunteers add column if not exists role_id uuid references public.event_roles (id) on delete set null;
alter table public.event_volunteers add column if not exists user_id uuid references public.users (id) on delete set null;
alter table public.event_volunteers add column if not exists status text not null default 'confirmed';
do $$ begin
  alter table public.event_volunteers add constraint event_volunteers_status_check check (status in ('confirmed', 'cancelled'));
exception when duplicate_object then null; end $$;
alter table public.event_volunteers add column if not exists cancel_reason text;
alter table public.event_volunteers add column if not exists cancelled_at timestamptz;

create index if not exists event_volunteers_event_idx on public.event_volunteers (event_id);
create index if not exists event_volunteers_role_idx on public.event_volunteers (role_id);
create index if not exists event_volunteers_user_idx on public.event_volunteers (user_id);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  part_number text,
  link text,
  image_url text,
  location text,
  qty_in_stock integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.parts add column if not exists image_url text;
alter table public.parts add column if not exists unit_cost numeric;
alter table public.parts add column if not exists material text;
alter table public.parts add column if not exists manufacturing_method text;
alter table public.parts add column if not exists onshape_document_id text;
alter table public.parts add column if not exists onshape_wv_type text;
alter table public.parts add column if not exists onshape_wv_id text;
alter table public.parts add column if not exists onshape_element_id text;
alter table public.parts add column if not exists onshape_part_id text;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Subsystems group a project's parts (Drivetrain, Intake, …). Each subsystem
-- carries its own imported BOM; a project's dashboard is a read-only rollup
-- across all of its subsystems.
create table if not exists public.subsystems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists subsystems_project_idx on public.subsystems (project_id);

create table if not exists public.part_allocations (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  qty integer not null default 0,
  unique (part_id, project_id)
);

create table if not exists public.scan_events (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts (id),
  project_id uuid references public.projects (id),
  user_id uuid references public.users (id) on delete set null,
  action scan_action not null,
  qty integer not null default 1,
  "timestamp" timestamptz not null default now()
);
create index if not exists scan_events_part_idx on public.scan_events (part_id);

-- ============================================================
-- BOM IMPORT PIPELINE (Phase 8)
-- One bom_import per CSV upload / pasted Onshape link, scoped to a single
-- Build-tab project. Lines start in 'draft' with just a parsed name/qty/
-- material/category; qty_collect/qty_order/qty_scanned/qty_fulfilled are
-- filled in on confirm (Step 3) and updated as parts get scanned in
-- (Step 4) or a vendor order is received against them (Step 5).
-- ============================================================
create table if not exists public.bom_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source text not null,                   -- 'csv' | 'onshape_link' | 'manual'
  source_ref text,                        -- filename or the pasted URL
  imported_by uuid references public.users (id) on delete set null,
  imported_at timestamptz not null default now(),
  status text not null default 'draft'    -- 'draft' | 'confirmed'
);
-- A BOM is imported per subsystem now; project_id is kept (from the subsystem)
-- so vendor-order receiving and disassembly stay project-scoped as before.
alter table public.bom_imports add column if not exists subsystem_id uuid references public.subsystems (id) on delete cascade;
create index if not exists bom_imports_subsystem_idx on public.bom_imports (subsystem_id);

create table if not exists public.bom_lines (
  id uuid primary key default gen_random_uuid(),
  bom_import_id uuid not null references public.bom_imports (id) on delete cascade,
  name text not null,
  part_number text,
  material text,
  color text,
  vendor_link text,
  qty_needed integer not null default 1,
  category text not null default 'order', -- '3d_print' | 'custom_cut' | 'order'
  matched_part_id uuid references public.parts (id) on delete set null,
  qty_collect integer not null default 0,
  qty_order integer not null default 0,
  qty_scanned integer not null default 0,
  qty_fulfilled integer not null default 0
);
create index if not exists bom_lines_import_idx on public.bom_lines (bom_import_id);
-- 3D Print / Custom Cut lines never become a real parts catalog row (they're
-- one-off fabricated pieces for this build, not reusable inventory) —
-- collected is a plain done/not-done checkbox instead of scan-based qty tracking.
alter table public.bom_lines add column if not exists collected boolean not null default false;
alter table public.bom_lines add column if not exists color text;
-- Denormalized from the line's import so the project rollup and the
-- "which subsystem" column don't need a 3-way join, and so manually-added
-- COTS lines can carry a subsystem directly.
alter table public.bom_lines add column if not exists subsystem_id uuid references public.subsystems (id) on delete cascade;
create index if not exists bom_lines_subsystem_idx on public.bom_lines (subsystem_id);

-- A received order (CSV or PDF) — optionally tied to a bom_import so
-- fulfilling that BOM's outstanding Order lines allocates straight to its
-- project; left null for a general restock order.
create table if not exists public.vendor_orders (
  id uuid primary key default gen_random_uuid(),
  vendor text,
  order_reference text,
  bom_import_id uuid references public.bom_imports (id) on delete set null,
  imported_by uuid references public.users (id) on delete set null,
  imported_at timestamptz not null default now()
);

create table if not exists public.vendor_order_lines (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references public.vendor_orders (id) on delete cascade,
  part_name text not null,
  part_number text,
  link text,
  qty_ordered integer not null default 1,
  matched_part_id uuid references public.parts (id) on delete set null
);
create index if not exists vendor_order_lines_order_idx on public.vendor_order_lines (vendor_order_id);

-- A retired robot version's teardown: expected_qty per part is snapshotted
-- from part_allocations when the session starts. Progress is computed live
-- by diffing that snapshot against current part_allocations as parts get
-- scanned back with the existing scanAction "add" mode — no separate
-- progress column needed here.
create table if not exists public.disassembly_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  started_by uuid references public.users (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  discrepancy_note text
);

create table if not exists public.disassembly_session_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.disassembly_sessions (id) on delete cascade,
  part_id uuid not null references public.parts (id) on delete cascade,
  expected_qty integer not null
);
create index if not exists disassembly_session_lines_session_idx on public.disassembly_session_lines (session_id);
-- Which subsystem's BOM line this snapshot came from — lets the checklist
-- show the same part as separate, adjacent entries when it was collected
-- into more than one subsystem. Null means it's an "orphan" project
-- allocation with no BOM line behind it (see the project page's orphan
-- list) — including a fabricated-catalog part manually allocated outside
-- any BOM, still handled below for discard-on-complete.
alter table public.disassembly_session_lines add column if not exists subsystem_id uuid references public.subsystems (id) on delete set null;
alter table public.disassembly_session_lines add column if not exists bom_line_id uuid references public.bom_lines (id) on delete set null;
create index if not exists disassembly_session_lines_bom_line_idx on public.disassembly_session_lines (bom_line_id);
-- Units written off via "Mark lost" instead of returned — tracked
-- separately from the live "remaining" count (bom_lines.qty_scanned for a
-- line-backed row, part_allocations.qty for an orphan row) so the checklist
-- can still show "3 returned, 1 lost of 4 expected".
alter table public.disassembly_session_lines add column if not exists lost_qty integer not null default 0;

-- File attachments for 3D Print / Custom Cut BOM lines (STL/3MF/STEP for
-- print, STEP/DXF/drawing for custom cut) — a line can carry several.
create table if not exists public.bom_line_files (
  id uuid primary key default gen_random_uuid(),
  bom_line_id uuid not null references public.bom_lines (id) on delete cascade,
  url text not null,
  filename text not null,
  content_type text,
  uploaded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bom_line_files_line_idx on public.bom_line_files (bom_line_id);

-- Migration for anyone who already ran an earlier version of this file
-- with the old NOT NULL / RESTRICT-by-default foreign keys:
do $$ begin
  alter table public.tasks alter column created_by drop not null;
  alter table public.tasks drop constraint if exists tasks_created_by_fkey;
  alter table public.tasks add constraint tasks_created_by_fkey
    foreign key (created_by) references public.users (id) on delete set null;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.tasks drop constraint if exists tasks_approved_by_fkey;
  alter table public.tasks add constraint tasks_approved_by_fkey
    foreign key (approved_by) references public.users (id) on delete set null;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.task_logs alter column user_id drop not null;
  alter table public.task_logs drop constraint if exists task_logs_user_id_fkey;
  alter table public.task_logs add constraint task_logs_user_id_fkey
    foreign key (user_id) references public.users (id) on delete set null;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.scan_events alter column user_id drop not null;
  alter table public.scan_events drop constraint if exists scan_events_user_id_fkey;
  alter table public.scan_events add constraint scan_events_user_id_fkey
    foreign key (user_id) references public.users (id) on delete set null;
exception when undefined_table then null; end $$;

-- Barcode/camera scanning was removed app-wide in favor of manual quantity
-- entry — drops the column (and its unique constraint) for anyone who
-- already ran an earlier version of this file with it.
alter table public.parts drop column if exists barcode;
alter table public.bom_lines drop column if exists barcode;

-- ============================================================
-- ROW LEVEL SECURITY
-- Every table is readable by any signed-in team member. All writes go
-- through Server Actions using the service-role key (after checking the
-- caller's role in `public.users`), so no INSERT/UPDATE/DELETE policies
-- are defined here — the default is deny, which is what we want.
-- ============================================================

alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.clock_sessions enable row level security;
alter table public.clock_session_deletions enable row level security;
alter table public.task_projects enable row level security;
alter table public.task_project_deadline_log enable row level security;
alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;
alter table public.task_assignees enable row level security;
alter table public.events enable row level security;
alter table public.event_categories enable row level security;
alter table public.event_roles enable row level security;
alter table public.event_volunteers enable row level security;
alter table public.parts enable row level security;
alter table public.projects enable row level security;
alter table public.subsystems enable row level security;
alter table public.part_allocations enable row level security;
alter table public.scan_events enable row level security;
alter table public.bom_imports enable row level security;
alter table public.bom_lines enable row level security;
alter table public.vendor_orders enable row level security;
alter table public.vendor_order_lines enable row level security;
alter table public.disassembly_sessions enable row level security;
alter table public.disassembly_session_lines enable row level security;
alter table public.bom_line_files enable row level security;

do $$ begin
  create policy "read users" on public.users for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read roles" on public.roles for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read permissions" on public.permissions for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read role_permissions" on public.role_permissions for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read clock_sessions" on public.clock_sessions for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read clock_session_deletions" on public.clock_session_deletions for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read tasks" on public.tasks for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read task_logs" on public.task_logs for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read task_projects" on public.task_projects for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read task_project_deadline_log" on public.task_project_deadline_log for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read task_assignees" on public.task_assignees for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read events" on public.events for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read event_categories" on public.event_categories for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read event_roles" on public.event_roles for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read event_volunteers" on public.event_volunteers for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read parts" on public.parts for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read projects" on public.projects for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read subsystems" on public.subsystems for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read part_allocations" on public.part_allocations for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read scan_events" on public.scan_events for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read bom_imports" on public.bom_imports for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read bom_lines" on public.bom_lines for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read vendor_orders" on public.vendor_orders for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read vendor_order_lines" on public.vendor_order_lines for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read disassembly_sessions" on public.disassembly_sessions for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read disassembly_session_lines" on public.disassembly_session_lines for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read bom_line_files" on public.bom_line_files for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ============================================================
-- STORAGE — task log photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', true)
on conflict (id) do nothing;

do $$ begin
  create policy "upload task photos" on storage.objects for insert to authenticated
    with check (bucket_id = 'task-photos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "view task photos" on storage.objects for select
    using (bucket_id = 'task-photos');
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$ begin
  create policy "upload avatars" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "update own avatar" on storage.objects for update to authenticated
    using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "view avatars" on storage.objects for select
    using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public)
values ('bom-line-files', 'bom-line-files', true)
on conflict (id) do nothing;

do $$ begin
  create policy "upload bom line files" on storage.objects for insert to authenticated
    with check (bucket_id = 'bom-line-files');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "delete bom line files" on storage.objects for delete to authenticated
    using (bucket_id = 'bom-line-files');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "view bom line files" on storage.objects for select
    using (bucket_id = 'bom-line-files');
exception when duplicate_object then null; end $$;

-- ============================================================
-- OWNER SEED
-- Sign up normally through /team/signup first (this creates the
-- auth user + a matching row in public.users with role='member'),
-- then run this once, swapping in the real username, to promote
-- that account to Owner:
--
--   update public.users set role = 'owner', must_reset_password = false
--   where lower(username) = 'krish';
-- ============================================================
