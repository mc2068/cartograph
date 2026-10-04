-- Seeded rows for the dashboard, because nothing creates a real analysis yet.
--
-- The two organization ids are the ones in this project's Clerk instance:
-- "My Organization" and "Second Organization". Run as the database owner,
-- which is the only role that can write to these tables.
--
-- Safe to run twice: a project that already exists is skipped, and an analysis
-- is only added for a project this run inserted.

with seeded (organization_id, repo_owner, repo_name, status, age) as (
  values
    ('org_3KE4XulyiVZBVoqdhPWrIZCRJwg', 'vercel', 'next.js', 'complete', interval '3 days'),
    ('org_3KE4XulyiVZBVoqdhPWrIZCRJwg', 'supabase', 'supabase-js', 'failed', interval '1 day'),
    ('org_3KE4XulyiVZBVoqdhPWrIZCRJwg', 'clerk', 'javascript', 'running', interval '2 minutes'),
    ('org_3KE7P1i8KlpKsA4WQFzN58n5acS', 'nestjs', 'nest', 'complete', interval '5 days'),
    ('org_3KE7P1i8KlpKsA4WQFzN58n5acS', 'expressjs', 'express', 'queued', interval '1 minute')
),
inserted_projects as (
  insert into public.projects (organization_id, repo_owner, repo_name)
  select organization_id, repo_owner, repo_name from seeded
  on conflict (organization_id, repo_owner, repo_name) do nothing
  returning id, organization_id, repo_owner, repo_name
)
insert into public.analyses (organization_id, project_id, status, created_at)
select p.organization_id, p.id, s.status, now() - s.age
from inserted_projects p
join seeded s using (organization_id, repo_owner, repo_name);
