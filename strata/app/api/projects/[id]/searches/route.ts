import { json, must, route, type RouteCtx } from "@/lib/server/api";

/** 이 프로젝트의 최근 검색 (30일) + 저장한 검색 */
export const GET = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  const rows = must(
    await supabase
      .from("searches")
      .select("id, query, total_unique, saved, created_at, user_id")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    "검색 기록",
  );
  return json({ searches: rows });
});
