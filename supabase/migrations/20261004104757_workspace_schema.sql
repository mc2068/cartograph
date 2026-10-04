-- The workspace schema: eight tables, each row owned by one organization.
--
-- Organizations live in Clerk, so organization_id is the Clerk organization id
-- held as plain text. There is no organizations table and no foreign key to
-- one. Ownership inside the schema still cascades: deleting a project removes
-- its analyses, and deleting an analysis removes everything parsed from it.
--
-- Authorization is the policy on each table and nothing else. The predicate
-- reads the organization off the Clerk session token, where version 2 tokens
-- carry it at o.id. It is wrapped in a select so Postgres evaluates it once
-- per query rather than once per row.
--
-- Every policy here is select-only. Nothing in the application writes yet, so
-- no role but the owner can insert, update or delete.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  repo_owner text not null,
  repo_name text not null,
  created_at timestamptz not null default now(),
  -- Leads with organization_id, so it also serves the policy's lookup.
  unique (organization_id, repo_owner, repo_name)
);

alter table public.projects enable row level security;

create policy "Members read their organization's projects"
  on public.projects for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'complete', 'failed')),
  created_at timestamptz not null default now()
);

create index analyses_organization_created_idx
  on public.analyses (organization_id, created_at desc);
create index analyses_project_idx on public.analyses (project_id);

alter table public.analyses enable row level security;

create policy "Members read their organization's analyses"
  on public.analyses for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  path text not null,
  folder text not null,
  line_count integer not null check (line_count >= 0),
  content_hash text not null,
  unique (analysis_id, path)
);

create index files_organization_idx on public.files (organization_id);

alter table public.files enable row level security;

create policy "Members read their organization's files"
  on public.files for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  -- Both ends are real file rows. An import that did not resolve to a file has
  -- no row here at all.
  source_file_id uuid not null references public.files (id) on delete cascade,
  target_file_id uuid not null references public.files (id) on delete cascade,
  kind text not null
    check (kind in ('import', 're-export', 'dynamic-import', 'require'))
);

create index edges_organization_idx on public.edges (organization_id);
create index edges_analysis_idx on public.edges (analysis_id);
create index edges_source_file_idx on public.edges (source_file_id);
create index edges_target_file_idx on public.edges (target_file_id);

alter table public.edges enable row level security;

create policy "Members read their organization's edges"
  on public.edges for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  -- Both not null: a route is stored only when the method and the full path
  -- were recovered.
  method text not null,
  path text not null
);

create index routes_organization_idx on public.routes (organization_id);
create index routes_analysis_idx on public.routes (analysis_id);
create index routes_file_idx on public.routes (file_id);

alter table public.routes enable row level security;

create policy "Members read their organization's routes"
  on public.routes for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  -- A file path or a folder path, so not a reference to files.
  subject_path text not null,
  content_hash text not null,
  model text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index explanations_organization_idx
  on public.explanations (organization_id);
create index explanations_analysis_idx on public.explanations (analysis_id);

alter table public.explanations enable row level security;

create policy "Members read their organization's explanations"
  on public.explanations for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  -- One role per file.
  file_id uuid not null unique references public.files (id) on delete cascade,
  role text not null,
  source text not null check (source in ('convention', 'model'))
);

create index file_roles_organization_idx on public.file_roles (organization_id);

alter table public.file_roles enable row level security;

create policy "Members read their organization's file roles"
  on public.file_roles for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  kind text not null
    check (kind in ('cycle', 'unimported', 'high-fan-in', 'oversized')),
  -- A cycle names several files, so paths rather than one file reference.
  file_paths text[] not null
);

create index insights_organization_idx on public.insights (organization_id);
create index insights_analysis_idx on public.insights (analysis_id);

alter table public.insights enable row level security;

create policy "Members read their organization's insights"
  on public.insights for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

-- The migration fails rather than leaving a table open. A table with security
-- off returns every organization's rows, and nothing else would notice.
do $$
declare
  offenders text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into offenders
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
    and (
      not c.relrowsecurity
      or not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    );

  if offenders is not null then
    raise exception
      'Tables without row-level security or without a policy: %', offenders;
  end if;
end
$$;
