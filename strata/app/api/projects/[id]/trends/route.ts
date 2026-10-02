export const maxDuration = 60;

import { HttpError, json, route, type RouteCtx } from "@/lib/server/api";
import { SourceError } from "@/lib/sources/http";
import { openAlexYearCounts } from "@/lib/sources/openalex";

export interface TrendsResponse {
  years: number[];
  series: { term: string; counts: number[]; total: number }[];
  /** 고를 수 있는 검색어 (이 프로젝트의 최근 검색어) */
  suggestions: string[];
}

const YEARS = 20;

/**
 * 연구 동향: 검색어별 연도별 논문 수.
 * 검색어를 주지 않으면 이 프로젝트의 가장 최근 검색어(최대 3개)를 쓴다. 올해는 집계 중이라 뺀다.
 */
export const GET = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const [{ data: project }, { data: last }] = await Promise.all([
    supabase.from("projects").select("default_query").eq("id", id).maybeSingle(),
    supabase.from("searches").select("query, terms").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!project) throw new HttpError(404, "프로젝트를 찾지 못했습니다");
  const lastTerms = [last?.query, ...((last?.terms as string[] | null) ?? [])].filter((t): t is string => !!t?.trim());
  const suggestions = [...new Set([...lastTerms, project.default_query].filter((t) => t?.trim()))].slice(0, 12);

  const asked = new URL(req.url).searchParams.getAll("t").map((t) => t.trim()).filter(Boolean);
  const terms = [...new Set(asked.length ? asked : suggestions)].slice(0, 3);
  if (!terms.length) return json({ years: [], series: [], suggestions } satisfies TrendsResponse);

  const to = new Date().getFullYear() - 1;
  const from = to - YEARS + 1;
  try {
    const series = await Promise.all(terms.map(async (term) => ({ term, ...(await openAlexYearCounts(term, from, to)) })));
    return json({ years: Array.from({ length: YEARS }, (_, i) => from + i), series, suggestions } satisfies TrendsResponse);
  } catch (e) {
    if (e instanceof SourceError) throw new HttpError(502, `연구 동향을 불러오지 못했습니다 (${e.source}: ${e.message})`);
    throw e;
  }
});
