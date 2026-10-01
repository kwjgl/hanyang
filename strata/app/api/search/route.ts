import { runSearch } from "@/lib/search/run";
import { body, HttpError, json, route } from "@/lib/server/api";
import { annotate } from "@/lib/server/membership";
import type { Candidate, Scope, SourceId } from "@/lib/types";

const ALL: SourceId[] = ["openalex", "s2", "eric", "crossref"];

/** 검색 기록에는 목록을 다시 열 수 있을 만큼만 남긴다 (초록은 앞부분만) */
const compact = (c: Candidate): Candidate => ({ ...c, abstract: c.abstract ? c.abstract.slice(0, 1500) : null });

export const POST = route(async ({ req, supabase, userId }) => {
  const b = await body<{ projectId: string; query: string; terms?: string[]; sources?: SourceId[]; scope?: Scope; yearFrom?: number; yearTo?: number }>(req);
  const query = b.query?.trim();
  if (!b.projectId || !query) throw new HttpError(400, "프로젝트와 검색어가 필요합니다");
  const terms = [...new Set([query, ...(b.terms ?? []).map((t) => t.trim()).filter(Boolean)])].slice(0, 10);
  const sources = (b.sources?.length ? b.sources : ALL).filter((s) => ALL.includes(s));
  const scope: Scope = b.scope === "ko" || b.scope === "intl" ? b.scope : "all";

  const out = await runSearch({ terms, sources, scope, yearFrom: b.yearFrom, yearTo: b.yearTo });
  const results = out.results.map(compact);

  // 보기 권한 멤버는 검색 기록을 남기지 못한다 (검색 자체는 할 수 있다)
  const { data: saved } = await supabase
      .from("searches")
      .insert({
        project_id: b.projectId,
        user_id: userId,
        query,
        terms,
        filters: { sources, scope, yearFrom: b.yearFrom ?? null, yearTo: b.yearTo ?? null },
        results,
        total_raw: out.totalRaw,
        total_unique: out.totalUnique,
      })
      .select("id, created_at")
      .maybeSingle();
  return json({ searchId: saved?.id ?? null, createdAt: saved?.created_at ?? new Date().toISOString(), query, terms, scope, sources, saved: false, ...out, results: await annotate(supabase, results) });
});
