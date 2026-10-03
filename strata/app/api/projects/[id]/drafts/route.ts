import { body, json, must, route, type RouteCtx } from "@/lib/server/api";
import { isMissingTable } from "@/lib/server/alerts";

/** 이 프로젝트의 글 목록 (본문 포함) */
export const GET = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  const { data, error } = await supabase.from("drafts").select("*").eq("project_id", id).order("updated_at", { ascending: false });
  if (isMissingTable(error) || /drafts/.test(error?.message ?? "")) return json({ ready: false, drafts: [] });
  if (error) throw error;
  return json({ ready: true, drafts: data ?? [] });
});

/** 새 글 */
export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ title?: string; body?: string }>(req).catch(() => ({}) as { title?: string; body?: string });
  const row = must(await supabase.from("drafts").insert({ project_id: id, title: b.title?.trim() || "제목 없는 글", body: b.body ?? "" }).select("*").single(), "글");
  return json({ draft: row });
});
