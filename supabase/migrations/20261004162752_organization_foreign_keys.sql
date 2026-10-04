-- A child row's organization has to be its parent's.
--
-- Every table carries its own organization_id and each policy reads that
-- column alone. The foreign keys followed only the parent's id, so nothing
-- stopped a row owned by one organization from hanging off another's analysis:
-- read by the first, deleted along with the second. Each reference now carries
-- organization_id as well, so that row cannot be written. The schema refuses
-- it, and no code that writes has to remember to check.
--
-- A composite reference needs a unique constraint over the same columns in the
-- parent. id is already unique on its own, so these three add no rule.
--
-- The foreign keys keep their names and their cascade. Only what they compare
-- changes.

alter table public.projects
  add constraint projects_id_organization_id_key unique (id, organization_id);
alter table public.analyses
  add constraint analyses_id_organization_id_key unique (id, organization_id);
alter table public.files
  add constraint files_id_organization_id_key unique (id, organization_id);

alter table public.analyses
  drop constraint analyses_project_id_fkey,
  add constraint analyses_project_id_fkey
    foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade;

alter table public.files
  drop constraint files_analysis_id_fkey,
  add constraint files_analysis_id_fkey
    foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade;

alter table public.edges
  drop constraint edges_analysis_id_fkey,
  drop constraint edges_source_file_id_fkey,
  drop constraint edges_target_file_id_fkey,
  add constraint edges_analysis_id_fkey
    foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  add constraint edges_source_file_id_fkey
    foreign key (source_file_id, organization_id)
    references public.files (id, organization_id) on delete cascade,
  add constraint edges_target_file_id_fkey
    foreign key (target_file_id, organization_id)
    references public.files (id, organization_id) on delete cascade;

alter table public.routes
  drop constraint routes_analysis_id_fkey,
  drop constraint routes_file_id_fkey,
  add constraint routes_analysis_id_fkey
    foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  add constraint routes_file_id_fkey
    foreign key (file_id, organization_id)
    references public.files (id, organization_id) on delete cascade;

alter table public.explanations
  drop constraint explanations_analysis_id_fkey,
  add constraint explanations_analysis_id_fkey
    foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade;

alter table public.file_roles
  drop constraint file_roles_file_id_fkey,
  add constraint file_roles_file_id_fkey
    foreign key (file_id, organization_id)
    references public.files (id, organization_id) on delete cascade;

alter table public.insights
  drop constraint insights_analysis_id_fkey,
  add constraint insights_analysis_id_fkey
    foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade;
