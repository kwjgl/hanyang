-- 글쓰기: 내가 쓰는 글과 인용, 주제 상담 기록
-- 여러 번 실행해도 괜찮다.

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  title text not null default '제목 없는 글',
  body text not null default '',
  -- 본문에 넣은 인용 (참고문헌 목록을 만들 때 쓴다)
  citations jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drafts_project_idx on public.drafts (project_id, updated_at desc);

create table if not exists public.consults (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '새 상담',
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists consults_project_idx on public.consults (project_id, updated_at desc);

alter table public.drafts enable row level security;
alter table public.consults enable row level security;

drop policy if exists drafts_read on public.drafts;
create policy drafts_read on public.drafts for select to authenticated using (public.is_project_member(project_id));
drop policy if exists drafts_write on public.drafts;
create policy drafts_write on public.drafts for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

drop policy if exists consults_read on public.consults;
create policy consults_read on public.consults for select to authenticated using (public.is_project_member(project_id));
drop policy if exists consults_write on public.consults;
create policy consults_write on public.consults for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

grant select, insert, update, delete on public.drafts, public.consults to authenticated;
