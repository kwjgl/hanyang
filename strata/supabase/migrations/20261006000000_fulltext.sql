-- PDF 본문과 상세 분석: 연구실 멤버가 넣은 PDF에서 뽑은 글자(쪽별)와, 그 글로 만든 선행연구 분석표 항목
-- 논문 정보는 연구실 공용이지만 본문은 그 논문을 보관한 프로젝트의 멤버만 본다.
-- 여러 번 실행해도 괜찮다.

create table if not exists public.paper_fulltexts (
  paper_id uuid primary key references public.papers(id) on delete cascade,
  -- 쪽마다 뽑은 글자 (PDF 쪽 순서)
  pages jsonb not null default '[]',
  -- 인쇄된 쪽 번호 = PDF 쪽 번호 + page_offset (학술지 쪽 번호를 못 찾으면 null)
  page_offset int,
  chars int not null default 0,
  file_name text,
  -- 상세 분석 결과 (분석하기를 눌렀을 때)
  details jsonb,
  details_model text,
  analyzed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.can_see_paper_text(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_papers pp where pp.paper_id = p and public.is_project_member(pp.project_id))
$$;

create or replace function public.can_edit_paper_text(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_papers pp where pp.paper_id = p and public.can_edit_project(pp.project_id))
$$;

alter table public.paper_fulltexts enable row level security;

drop policy if exists fulltexts_read on public.paper_fulltexts;
create policy fulltexts_read on public.paper_fulltexts for select to authenticated using (public.can_see_paper_text(paper_id));
drop policy if exists fulltexts_write on public.paper_fulltexts;
create policy fulltexts_write on public.paper_fulltexts for all to authenticated
  using (public.can_edit_paper_text(paper_id)) with check (public.can_edit_paper_text(paper_id));

grant select, insert, update, delete on public.paper_fulltexts to authenticated;
grant execute on function public.can_see_paper_text(uuid), public.can_edit_paper_text(uuid) to authenticated;
