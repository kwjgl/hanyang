import { body, HttpError, json, must, route, type RouteCtx } from "@/lib/server/api";

/** 요약한 논문을 이 프로젝트의 소주제에 보관 */
export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, userId, ctx }) => {
  const { id } = await ctx.params;
  const { paperId, subtopicId } = await body<{ paperId: string; subtopicId?: string | null }>(req);
  if (!paperId) throw new HttpError(400, "논문이 필요합니다");
  must(
    await supabase
      .from("project_papers")
      .upsert({ project_id: id, paper_id: paperId, subtopic_id: subtopicId ?? null, added_by: userId }, { onConflict: "project_id,paper_id" }),
    "보관",
  );
  return json({ ok: true });
});

/** 소주제 옮기기 */
export const PATCH = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const { paperId, subtopicId } = await body<{ paperId: string; subtopicId: string | null }>(req);
  must(await supabase.from("project_papers").update({ subtopic_id: subtopicId }).eq("project_id", id).eq("paper_id", paperId), "보관");
  return json({ ok: true });
});

export const DELETE = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const paperId = new URL(req.url).searchParams.get("paperId");
  if (!paperId) throw new HttpError(400, "논문이 필요합니다");
  must(await supabase.from("project_papers").delete().eq("project_id", id).eq("paper_id", paperId), "보관");
  return json({ ok: true });
});
