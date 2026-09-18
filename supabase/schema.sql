-- DesignHub database + RLS + Storage setup
-- Run this entire file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  requester text not null,
  purpose text not null,
  request_date date not null default current_date,
  status text not null default 'New'
    check (status in ('New', 'In Progress', 'Ready for Review', 'Need Revision', 'Approved')),
  description text,
  folder text,
  file_name text,
  file_size bigint,
  file_type text,
  width integer,
  height integer,
  storage_path text,
  file_url text,
  is_public boolean not null default false,
  share_token uuid not null unique default gen_random_uuid(),
  last_feedback text,
  last_feedback_decision text check (last_feedback_decision in ('approved', 'revision')),
  last_feedback_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  share_token uuid not null,
  decision text not null check (decision in ('approved', 'revision')),
  comment text,
  reviewer_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  type text not null check (type in ('revision_requested', 'approved')),
  title text not null,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists designs_status_idx on public.designs(status);
create index if not exists designs_request_date_idx on public.designs(request_date desc);
create index if not exists designs_share_token_idx on public.designs(share_token);
create index if not exists designs_deleted_at_idx on public.designs(deleted_at);
create index if not exists feedback_design_id_idx on public.feedback(design_id, created_at desc);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists designs_set_updated_at on public.designs;
create trigger designs_set_updated_at
before update on public.designs
for each row execute function public.set_updated_at();

-- Public review workflow.
-- This is SECURITY DEFINER so a public reviewer can submit feedback without gaining
-- permission to update designs directly.
create or replace function public.apply_feedback_to_design()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.designs d
    where d.id = new.design_id
      and d.share_token = new.share_token
      and d.is_public = true
      and d.deleted_at is null
  ) then
    raise exception 'Invalid share link';
  end if;

  update public.designs
  set
    status = case when new.decision = 'revision' then 'Need Revision' else 'Approved' end,
    last_feedback = nullif(trim(new.comment), ''),
    last_feedback_decision = new.decision,
    last_feedback_at = now()
  where id = new.design_id;

  insert into public.notifications (design_id, type, title, message)
  values (
    new.design_id,
    case when new.decision = 'revision' then 'revision_requested' else 'approved' end,
    case when new.decision = 'revision' then 'Revision requested' else 'Design approved' end,
    nullif(trim(new.comment), '')
  );

  return new;
end;
$$;

drop trigger if exists feedback_apply_workflow on public.feedback;
create trigger feedback_apply_workflow
after insert on public.feedback
for each row execute function public.apply_feedback_to_design();

-- RLS
alter table public.designs enable row level security;
alter table public.feedback enable row level security;
alter table public.notifications enable row level security;

-- Remove broad default access before defining the exact policies.
revoke all on public.designs from anon, authenticated;
revoke all on public.feedback from anon, authenticated;
revoke all on public.notifications from anon, authenticated;

grant select on public.designs to anon;
grant select, insert, update, delete on public.designs to authenticated;
grant insert on public.feedback to anon, authenticated;
grant select on public.feedback to authenticated;
grant select, update on public.notifications to authenticated;

-- Public viewers can read only designs explicitly shared and not deleted.
drop policy if exists "Public can view shared designs" on public.designs;
create policy "Public can view shared designs"
on public.designs
for select
to anon
using (is_public = true and deleted_at is null);

-- Authenticated admin can fully manage designs.
drop policy if exists "Admin can manage designs" on public.designs;
create policy "Admin can manage designs"
on public.designs
for all
to authenticated
using (true)
with check (true);

-- Public reviewers can submit feedback only when the token matches a live shared design.
drop policy if exists "Public can submit valid feedback" on public.feedback;
create policy "Public can submit valid feedback"
on public.feedback
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.designs d
    where d.id = feedback.design_id
      and d.share_token = feedback.share_token
      and d.is_public = true
      and d.deleted_at is null
  )
);

-- Admin can read feedback history.
drop policy if exists "Admin can read feedback" on public.feedback;
create policy "Admin can read feedback"
on public.feedback
for select
to authenticated
using (true);

-- Admin notifications only.
drop policy if exists "Admin can read notifications" on public.notifications;
create policy "Admin can read notifications"
on public.notifications
for select
to authenticated
using (true);

drop policy if exists "Admin can update notifications" on public.notifications;
create policy "Admin can update notifications"
on public.notifications
for update
to authenticated
using (true)
with check (true);

-- Storage bucket for design assets.
-- Public read is intentional because shared designs need direct browser preview/download URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-assets',
  'design-assets',
  true,
  20971520,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Upload/update/delete only for authenticated admin.
drop policy if exists "Admin can upload design assets" on storage.objects;
create policy "Admin can upload design assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'design-assets');

drop policy if exists "Admin can update design assets" on storage.objects;
create policy "Admin can update design assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'design-assets')
with check (bucket_id = 'design-assets');

drop policy if exists "Admin can delete design assets" on storage.objects;
create policy "Admin can delete design assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'design-assets');

-- Public download/preview is handled by the bucket's public access model.
