-- 저장한 검색의 새 논문 알림
-- 저장한 검색을 일주일마다 다시 돌려, 전에 없던 최근 논문을 알림으로 쌓는다.
-- 여러 번 실행해도 괜찮다.

alter table public.searches add column if not exists checked_at timestamptz;

-- 새로 찾은 논문 (프로젝트 멤버가 함께 본다)
create table if not exists public.alert_hits (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.searches(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_key text not null,
  paper jsonb not null,
  found_at timestamptz not null default now(),
  unique (search_id, paper_key)
);
create index if not exists alert_hits_project_idx on public.alert_hits (project_id, found_at desc);

-- 사람마다 어디까지 봤는지
create table if not exists public.alert_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  search_id uuid not null references public.searches(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, search_id)
);

alter table public.alert_hits enable row level security;
alter table public.alert_reads enable row level security;

drop policy if exists alert_hits_read on public.alert_hits;
create policy alert_hits_read on public.alert_hits for select to authenticated using (public.is_project_member(project_id));
drop policy if exists alert_hits_insert on public.alert_hits;
create policy alert_hits_insert on public.alert_hits for insert to authenticated with check (public.can_edit_project(project_id));

drop policy if exists alert_reads_own on public.alert_reads;
create policy alert_reads_own on public.alert_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert on public.alert_hits to authenticated;
grant select, insert, update, delete on public.alert_reads to authenticated;
