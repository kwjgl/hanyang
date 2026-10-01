// 여러 출처를 기다리거나 Claude를 호출하므로 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { runSearch } from "@/lib/search/run";
import { body, HttpError, json, route } from "@/lib/server/api";
import { annotate } from "@/lib/server/membership";
import type { Candidate, Scope, SourceId } from "@/lib/types";

const ALL: SourceId[] = ["openalex", "s2", "eric", "crossref"];

/** 검색 기록에는 목록을 다시 열 수 있을 만큼만 남긴다 (초록은 앞부분만) */
const compact = (c: Candidate): Candidate => ({ ...c, abstract: c.abstract ? c.abstract.slice(0, 1500) : null });

export const POST = route(async ({ req, supabase, userId }) => {
  const b = await body<{ projectId: string; query: string; terms?: string[]; sources?: SourceId[]; scope?: Scope; yearFrom?: number; yearTo?: number; page?: number; searchId?: string | null }>(req);
  const page = Math.max(1, Math.min(20, Number(b.page) || 1));
  const query = b.query?.trim();
  if (!b.projectId || !query) throw new HttpError(400, "프로젝트와 검색어가 필요합니다");
  const terms = [...new Set([query, ...(b.terms ?? []).map((t) => t.trim()).filter(Boolean)])].slice(0, 10);
  const sources = (b.sources?.length ? b.sources : ALL).filter((s) => ALL.includes(s));
  const scope: Scope = b.scope === "ko" || b.scope === "intl" ? b.scope : "all";

  const out = await runSearch({ terms, sources, scope, yearFrom: b.yearFrom, yearTo: b.yearTo, page });
  let results = out.results.map(compact);

  // 다음 페이지: 이미 가진 논문은 빼고, 같은 검색 기록에 이어 붙인다
  if (page > 1 && b.searchId) {
    const { data: prev } = await supabase.from("searches").select("results, total_raw, filters").eq("id", b.searchId).maybeSingle();
    if (prev) {
      const old = (prev.results ?? []) as Candidate[];
      const keys = new Set(old.map((r) => r.key));
      const dois = new Set(old.map((r) => r.doi).filter(Boolean));
      results = results.filter((r) => !keys.has(r.key) && !(r.doi && dois.has(r.doi)));
      await supabase
        .from("searches")
        .update({ results: [...old, ...results], total_raw: (prev.total_raw ?? 0) + out.totalRaw, total_unique: old.length + results.length, filters: { ...(prev.filters ?? {}), page } })
        .eq("id", b.searchId);
    }
    return json({ searchId: b.searchId, page, ...out, results: await annotate(supabase, results) });
  }


  // 보기 권한 멤버는 검색 기록을 남기지 못한다 (검색 자체는 할 수 있다)
  const { data: saved } = await supabase
      .from("searches")
      .insert({
        project_id: b.projectId,
        user_id: userId,
        query,
        terms,
        filters: { sources, scope, yearFrom: b.yearFrom ?? null, yearTo: b.yearTo ?? null, available: out.available, page: 1 },
        results,
        total_raw: out.totalRaw,
        total_unique: out.totalUnique,
      })
      .select("id, created_at")
      .maybeSingle();
  return json({ searchId: saved?.id ?? null, createdAt: saved?.created_at ?? new Date().toISOString(), query, terms, scope, sources, saved: false, page, ...out, results: await annotate(supabase, results) });
});
