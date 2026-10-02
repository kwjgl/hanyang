-- 연구 공백 지도
-- 소주제 × 축(학교급·연구 방법·시기·직접 정의)으로 논문을 나눠 빈칸(연구 공백)을 찾는다.
-- AI로 분류한 결과를 지도 한 장으로 저장해 두고, 날짜별로 다시 열어 본다.
-- 여러 번 실행해도 괜찮다.

create table if not exists public.gap_maps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 저장한 지도인지 (저장 안 한 "지금 지도"는 프로젝트마다 가장 최근 것 하나만 남긴다)
  saved boolean not null default false,
  label text,
  -- 소주제 목록, 직접 정의 축, 내 연구 위치, 아직 분류하지 않은 논문 등
  config jsonb not null default '{}',
  -- 분류된 논문
  items jsonb not null default '[]'
);
create index if not exists gap_maps_project_idx on public.gap_maps (project_id, created_at desc);

alter table public.gap_maps enable row level security;

drop policy if exists gap_maps_read on public.gap_maps;
create policy gap_maps_read on public.gap_maps for select to authenticated using (public.is_project_member(project_id));
drop policy if exists gap_maps_write on public.gap_maps;
create policy gap_maps_write on public.gap_maps for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

grant select, insert, update, delete on public.gap_maps to authenticated;
