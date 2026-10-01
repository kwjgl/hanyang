import { body, HttpError, json, must, route, type RouteCtx } from "@/lib/server/api";

export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const { name } = await body<{ name: string }>(req);
  if (!name?.trim()) throw new HttpError(400, "소주제 이름을 입력해 주세요");
  const { count } = await supabase.from("subtopics").select("id", { count: "exact", head: true }).eq("project_id", id);
  const s = must(await supabase.from("subtopics").insert({ project_id: id, name: name.trim(), position: count ?? 0 }).select("*").single(), "소주제");
  return json({ subtopic: s });
});

export const PATCH = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const { subtopicId, name, position } = await body<{ subtopicId: string; name?: string; position?: number }>(req);
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name.trim();
  if (position !== undefined) patch.position = position;
  must(await supabase.from("subtopics").update(patch).eq("project_id", id).eq("id", subtopicId), "소주제");
  return json({ ok: true });
});

export const DELETE = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const sid = new URL(req.url).searchParams.get("subtopicId");
  if (!sid) throw new HttpError(400, "소주제가 필요합니다");
  must(await supabase.from("subtopics").delete().eq("project_id", id).eq("id", sid), "소주제");
  return json({ ok: true });
});
