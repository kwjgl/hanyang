import { runSearch } from "@/lib/search/run";
import type { Supa } from "@/lib/supabase/server";
import type { Candidate, Scope, SourceId } from "@/lib/types";

/** 저장한 검색을 다시 돌리는 간격 */
export const CHECK_EVERY_DAYS = 7;
/** 한 번 확인할 때 새 논문으로 쌓는 최대 편수 (관련도 상위에서만 고른다) */
const MAX_NEW = 20;
const LOOK_AT_TOP = 60;

/** 알림 표가 아직 없을 때 (Supabase에 알림 SQL을 실행하기 전) */
export const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /alert_|checked_at/.test(e.message ?? ""));

const keysOf = (c: Pick<Candidate, "key" | "doi">) => [c.key, ...(c.doi ? [`doi:${c.doi}`] : [])];

/**
 * 다시 찾은 결과 중 새 논문만 고른다.
 * - 처음 저장할 때 결과와 이미 알림으로 쌓은 논문은 뺀다
 * - 순위가 바뀌어 오래된 논문이 끌려 올라오지 않게 작년·올해 논문만, 관련도 상위에서만 고른다
 */
export function pickNew(results: Candidate[], known: Set<string>, thisYear: number): Candidate[] {
  return results
    .slice(0, LOOK_AT_TOP)
    .filter((c) => (c.year ?? 0) >= thisYear - 1 && !keysOf(c).some((k) => known.has(k)))
    .slice(0, MAX_NEW);
}

type SavedSearch = {
  id: string;
  project_id: string;
  query: string;
  terms: string[] | null;
  filters: { sources?: SourceId[]; scope?: Scope } | null;
  results: Candidate[] | null;
  checked_at: string | null;
  created_at: string;
};

export const isDue = (s: Pick<SavedSearch, "checked_at" | "created_at">, now = Date.now()) =>
  now - new Date(s.checked_at ?? s.created_at).getTime() >= CHECK_EVERY_DAYS * 864e5;

/** 저장한 검색 하나를 다시 돌려 새 논문을 알림으로 쌓는다 */
async function checkOne(supabase: Supa, s: SavedSearch): Promise<number> {
  const thisYear = new Date().getFullYear();
  const out = await runSearch(
    {
      terms: s.terms?.length ? s.terms : [s.query],
      sources: s.filters?.sources?.length ? s.filters.sources : ["openalex", "s2", "eric", "crossref"],
      scope: s.filters?.scope ?? "all",
      yearFrom: thisYear - 1,
    },
    200,
  );
  const { data: prev } = await supabase.from("alert_hits").select("paper_key").eq("search_id", s.id);
  const known = new Set<string>([...(s.results ?? []).flatMap(keysOf), ...(prev ?? []).map((h) => h.paper_key as string)]);
  const fresh = pickNew(out.results, known, thisYear);
  if (fresh.length) {
    const rows = fresh.map((c) => ({
      search_id: s.id,
      project_id: s.project_id,
      paper_key: c.doi ? `doi:${c.doi}` : c.key,
      paper: { ...c, abstract: c.abstract?.slice(0, 1500) ?? null },
    }));
    const { error } = await supabase.from("alert_hits").upsert(rows, { onConflict: "search_id,paper_key", ignoreDuplicates: true });
    if (error) throw error;
  }
  // 모든 출처가 실패했으면 다음에 다시 해 보도록 확인 시각을 남기지 않는다
  if (out.results.length || !out.warnings.length) await supabase.from("searches").update({ checked_at: new Date().toISOString() }).eq("id", s.id);
  return fresh.length;
}

/**
 * 확인할 때가 된 저장 검색을 최대 limit개 확인한다. searchId를 주면 그것만 바로 확인한다.
 * 편집 권한이 있는 프로젝트의 검색만 확인한다 (보기 권한으로는 알림을 쌓을 수 없다).
 */
export async function checkAlerts(supabase: Supa, userId: string, opts: { searchId?: string; limit?: number } = {}) {
  const { data: mem } = await supabase.from("project_members").select("project_id, role").eq("user_id", userId);
  const editable = (mem ?? []).filter((m) => m.role !== "viewer").map((m) => m.project_id as string);
  if (!editable.length) return { checked: 0, found: 0, ready: true };

  let q = supabase
    .from("searches")
    .select("id, project_id, query, terms, filters, results, checked_at, created_at")
    .eq("saved", true)
    .in("project_id", editable)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(50);
  if (opts.searchId) q = q.eq("id", opts.searchId);
  const { data, error } = await q;
  if (isMissingTable(error)) return { checked: 0, found: 0, ready: false };
  if (error) throw error;

  const todo = ((data ?? []) as SavedSearch[]).filter((s) => opts.searchId || isDue(s)).slice(0, opts.limit ?? 2);
  let found = 0;
  for (const s of todo) found += await checkOne(supabase, s);
  return { checked: todo.length, found, ready: true };
}

/** 사이드바 숫자: 내가 아직 안 본 새 논문 수. 알림 표가 아직 없으면 null */
export async function unreadAlerts(supabase: Supa, userId: string): Promise<number | null> {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [{ data: hits, error }, { data: saved }, { data: reads }] = await Promise.all([
    supabase.from("alert_hits").select("search_id, found_at").gte("found_at", since).limit(3000),
    supabase.from("searches").select("id").eq("saved", true),
    supabase.from("alert_reads").select("search_id, read_at").eq("user_id", userId),
  ]);
  if (isMissingTable(error)) return null;
  const keep = new Set((saved ?? []).map((s) => s.id as string));
  const readAt = new Map((reads ?? []).map((r) => [r.search_id as string, r.read_at as string]));
  return (hits ?? []).filter((h) => keep.has(h.search_id as string) && (h.found_at as string) > (readAt.get(h.search_id as string) ?? "")).length;
}

export interface AlertSearch {
  id: string;
  projectId: string;
  projectName: string;
  query: string;
  checkedAt: string | null;
  createdAt: string;
  canEdit: boolean;
  readAt: string | null;
  hits: { id: string; paper: Candidate; foundAt: string }[];
}

/** 알림 화면: 저장한 검색과 그 새 논문들 */
export async function loadAlerts(supabase: Supa, userId: string): Promise<{ ready: boolean; searches: AlertSearch[] }> {
  const [{ data: searches, error }, { data: hits }, { data: reads }, { data: mem }] = await Promise.all([
    supabase.from("searches").select("id, project_id, query, checked_at, created_at, project:projects(name)").eq("saved", true).order("created_at", { ascending: false }),
    supabase.from("alert_hits").select("id, search_id, paper, found_at").order("found_at", { ascending: false }).limit(1000),
    supabase.from("alert_reads").select("search_id, read_at").eq("user_id", userId),
    supabase.from("project_members").select("project_id, role").eq("user_id", userId),
  ]);
  if (isMissingTable(error)) return { ready: false, searches: [] };
  const readAt = new Map((reads ?? []).map((r) => [r.search_id as string, r.read_at as string]));
  const role = new Map((mem ?? []).map((m) => [m.project_id as string, m.role as string]));
  type S = { id: string; project_id: string; query: string; checked_at: string | null; created_at: string; project: { name: string } | null };
  return {
    ready: true,
    searches: ((searches ?? []) as unknown as S[]).map((s) => ({
      id: s.id,
      projectId: s.project_id,
      projectName: s.project?.name ?? "",
      query: s.query,
      checkedAt: s.checked_at,
      createdAt: s.created_at,
      canEdit: (role.get(s.project_id) ?? "viewer") !== "viewer",
      readAt: readAt.get(s.id) ?? null,
      hits: (hits ?? [])
        .filter((h) => h.search_id === s.id)
        .map((h) => ({ id: h.id as string, paper: h.paper as Candidate, foundAt: h.found_at as string })),
    })),
  };
}
