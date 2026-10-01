import { body, json, must, route, type RouteCtx } from "@/lib/server/api";

export const PATCH = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ name?: string; researchQuestion?: string; defaultQuery?: string; fieldIds?: string[] }>(req);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) patch.name = b.name.trim();
  if (b.researchQuestion !== undefined) patch.research_question = b.researchQuestion.trim();
  if (b.defaultQuery !== undefined) patch.default_query = b.defaultQuery.trim();
  if (b.fieldIds !== undefined) patch.field_ids = b.fieldIds;
  must(await supabase.from("projects").update(patch).eq("id", id), "프로젝트");
  return json({ ok: true });
});

export const DELETE = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  must(await supabase.from("projects").delete().eq("id", id), "프로젝트");
  return json({ ok: true });
});
