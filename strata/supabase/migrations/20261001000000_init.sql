-- Strata 1단계 스키마
-- 논문(papers)·요약(summaries)·분야(fields)는 연구실 전체가 함께 쓰는 공용 데이터이고,
-- 프로젝트와 그 하위 데이터는 프로젝트 멤버만 볼 수 있다.


-- ---------------------------------------------------------------- 사용자
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key_enc text,
  api_key_last4 text,
  monthly_limit_usd numeric(8,2) not null default 5,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 분야 (연구실 공용, 편집 가능)
create table public.fields (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  color int not null default 0,
  position int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.fields (name, description, color, position) values
  ('교육학', '교육 일반 이론, 교육과정, 교육 정책·제도, 교사·학교', 0, 0),
  ('교육공학', '교수설계, 에듀테크, 디지털 학습 환경, AI 활용 교육', 1, 1),
  ('학습과학', '학습 원리와 과정, 학습 전략, 협력 학습, 학습 분석', 2, 2),
  ('인지심리', '주의·기억·지각·언어 이해 등 인지 과정', 3, 3),
  ('국어교육', '읽기·쓰기·문법·문학·화법 교육, 리터러시', 4, 4),
  ('교육평가', '측정 이론, 문항 분석, 타당도·신뢰도, 형성평가', 5, 5),
  ('디지털 평가문항', 'CBT, 기술 강화 문항, 자동 문항 생성, 디지털 평가 설계', 6, 6);

-- ---------------------------------------------------------------- 논문 (공용 캐시)
create table public.papers (
  id uuid primary key default gen_random_uuid(),
  doi text unique,
  title text not null,
  authors jsonb not null default '[]',
  year int,
  venue text,
  abstract text,
  abstract_source text,
  url text,
  oa_url text,
  citations int,
  impact jsonb not null default '{}',
  ids jsonb not null default '{}',
  lang text,
  kind text,
  sources text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index papers_openalex_idx on public.papers ((ids->>'openalex'));
create index papers_title_idx on public.papers (lower(title));

-- 같은 논문의 요약은 한 번만 만들고 모두가 재사용한다
create table public.summaries (
  paper_id uuid primary key references public.papers(id) on delete cascade,
  data jsonb not null,
  model text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.paper_fields (
  paper_id uuid not null references public.papers(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  primary key (paper_id, field_id)
);

-- ---------------------------------------------------------------- 프로젝트
create type public.project_role as enum ('owner', 'editor', 'viewer');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  research_question text not null default '',
  default_query text not null default '',
  field_ids uuid[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.project_role not null,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role public.project_role not null check (role <> 'owner'),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

create table public.subtopics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.project_papers (
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  subtopic_id uuid references public.subtopics(id) on delete set null,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (project_id, paper_id)
);

create table public.paper_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  visibility text not null default 'shared' check (visibility in ('shared', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index paper_notes_lookup_idx on public.paper_notes (project_id, paper_id);

-- 읽기 상태와 별표는 사람마다 다르다
create table public.user_papers (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  starred boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

-- 검색 기록: 30일 보관, saved=true면 계속 보관
create table public.searches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  query text not null,
  terms jsonb not null default '[]',
  filters jsonb not null default '{}',
  results jsonb not null default '[]',
  total_raw int not null default 0,
  total_unique int not null default 0,
  saved boolean not null default false,
  created_at timestamptz not null default now()
);
create index searches_project_idx on public.searches (project_id, created_at desc);

create table public.usage_events (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index usage_events_user_idx on public.usage_events (user_id, created_at);

-- ---------------------------------------------------------------- 권한 헬퍼
create function public.project_role_of(p uuid) returns public.project_role
language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = p and user_id = auth.uid()
$$;

create function public.is_project_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid())
$$;

create function public.can_edit_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.project_role_of(p) in ('owner', 'editor'), false)
$$;

-- 프로젝트를 만든 사람은 자동으로 소유자가 된다
create function public.handle_new_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger on_project_created after insert on public.projects
  for each row execute function public.handle_new_project();

-- 가입하면 프로필을 만들고, 그 이메일로 온 초대를 받아들인다
create function public.accept_invites_for(uid uuid, mail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role)
    select project_id, uid, role from public.project_invites where lower(email) = lower(mail)
    on conflict do nothing;
  delete from public.project_invites where lower(email) = lower(mail);
end $$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
  perform public.accept_invites_for(new.id, new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입한 사람이 나중에 초대받은 경우를 위해 로그인할 때 호출한다
create function public.accept_my_invites() returns void
language plpgsql security definer set search_path = public as $$
declare mail text;
begin
  select email into mail from public.profiles where id = auth.uid();
  if mail is not null then perform public.accept_invites_for(auth.uid(), mail); end if;
end $$;

-- 이번 달(한국 시간) AI 사용 금액
create function public.my_month_usage() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from public.usage_events
  where user_id = auth.uid()
    and created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
$$;

-- ---------------------------------------------------------------- 행 단위 보안
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.fields enable row level security;
alter table public.papers enable row level security;
alter table public.summaries enable row level security;
alter table public.paper_fields enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.subtopics enable row level security;
alter table public.project_papers enable row level security;
alter table public.paper_notes enable row level security;
alter table public.user_papers enable row level security;
alter table public.searches enable row level security;
alter table public.usage_events enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid());

create policy settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy fields_read on public.fields for select to authenticated using (true);
create policy fields_write on public.fields for all to authenticated using (true) with check (true);

create policy papers_read on public.papers for select to authenticated using (true);
create policy papers_insert on public.papers for insert to authenticated with check (true);
create policy papers_update on public.papers for update to authenticated using (true);

create policy summaries_read on public.summaries for select to authenticated using (true);
create policy summaries_insert on public.summaries for insert to authenticated with check (created_by = auth.uid());
create policy summaries_update on public.summaries for update to authenticated using (created_by = auth.uid());

create policy paper_fields_read on public.paper_fields for select to authenticated using (true);
create policy paper_fields_write on public.paper_fields for all to authenticated using (true) with check (true);

-- created_by 조건: 만든 직후(멤버 등록 트리거 실행 전) RETURNING으로 행을 돌려받기 위해 필요
create policy projects_read on public.projects for select to authenticated using (public.is_project_member(id) or created_by = auth.uid());
create policy projects_insert on public.projects for insert to authenticated with check (created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated using (public.can_edit_project(id));
create policy projects_delete on public.projects for delete to authenticated using (public.project_role_of(id) = 'owner');

create policy members_read on public.project_members for select to authenticated using (public.is_project_member(project_id));
create policy members_insert on public.project_members for insert to authenticated
  with check (public.project_role_of(project_id) = 'owner' and role <> 'owner');
create policy members_update on public.project_members for update to authenticated
  using (public.project_role_of(project_id) = 'owner' and role <> 'owner')
  with check (role <> 'owner');
create policy members_delete on public.project_members for delete to authenticated
  using (role <> 'owner' and (public.project_role_of(project_id) = 'owner' or user_id = auth.uid()));

create policy invites_read on public.project_invites for select to authenticated using (public.is_project_member(project_id));
create policy invites_write on public.project_invites for all to authenticated
  using (public.project_role_of(project_id) = 'owner') with check (public.project_role_of(project_id) = 'owner');

create policy subtopics_read on public.subtopics for select to authenticated using (public.is_project_member(project_id));
create policy subtopics_write on public.subtopics for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

create policy pp_read on public.project_papers for select to authenticated using (public.is_project_member(project_id));
create policy pp_write on public.project_papers for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

create policy notes_read on public.paper_notes for select to authenticated
  using (user_id = auth.uid() or (visibility = 'shared' and public.is_project_member(project_id)));
create policy notes_insert on public.paper_notes for insert to authenticated
  with check (user_id = auth.uid() and public.is_project_member(project_id));
create policy notes_update on public.paper_notes for update to authenticated using (user_id = auth.uid());
create policy notes_delete on public.paper_notes for delete to authenticated using (user_id = auth.uid());

create policy user_papers_own on public.user_papers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy searches_read on public.searches for select to authenticated
  using (public.is_project_member(project_id) and (saved or created_at > now() - interval '30 days'));
create policy searches_insert on public.searches for insert to authenticated
  with check (user_id = auth.uid() and public.can_edit_project(project_id));
create policy searches_update on public.searches for update to authenticated using (public.can_edit_project(project_id));
create policy searches_delete on public.searches for delete to authenticated using (user_id = auth.uid());

create policy usage_read_own on public.usage_events for select to authenticated using (user_id = auth.uid());
create policy usage_insert_own on public.usage_events for insert to authenticated with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.accept_my_invites(), public.my_month_usage(),
  public.is_project_member(uuid), public.can_edit_project(uuid), public.project_role_of(uuid) to authenticated;
