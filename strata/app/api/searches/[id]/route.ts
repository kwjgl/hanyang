import { body, json, must, route, type RouteCtx } from "@/lib/server/api";
import { annotate } from "@/lib/server/membership";

/** 저장된 검색 결과 다시 열기 */
export const GET = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  const s = must(await supabase.from("searches").select("*").eq("id", id).single(), "검색 기록");
  return json({
    searchId: s.id,
    createdAt: s.created_at,
    query: s.query,
    terms: s.terms,
    scope: s.filters?.scope ?? "all",
    sources: s.filters?.sources ?? [],
    results: await annotate(supabase, s.results ?? []),
    totalRaw: s.total_raw,
    totalUnique: s.total_unique,
    saved: s.saved,
    warnings: [],
  });
});

/** 이 검색 저장 / 저장 취소 */
export const PATCH = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const { saved } = await body<{ saved: boolean }>(req);
  must(await supabase.from("searches").update({ saved: !!saved }).eq("id", id), "검색 기록");
  return json({ ok: true });
});
