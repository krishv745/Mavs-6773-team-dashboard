-- Subsystems + per-subsystem BOM import.
-- Idempotent — safe to run once in the Supabase SQL Editor. Re-running
-- supabase/schema.sql top-to-bottom applies the same thing.

create table if not exists public.subsystems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists subsystems_project_idx on public.subsystems (project_id);

alter table public.bom_imports add column if not exists subsystem_id uuid references public.subsystems (id) on delete cascade;
create index if not exists bom_imports_subsystem_idx on public.bom_imports (subsystem_id);

alter table public.bom_lines add column if not exists subsystem_id uuid references public.subsystems (id) on delete cascade;
create index if not exists bom_lines_subsystem_idx on public.bom_lines (subsystem_id);

alter table public.subsystems enable row level security;
do $$ begin
  create policy "read subsystems" on public.subsystems for select to authenticated using (true);
exception when duplicate_object then null; end $$;
