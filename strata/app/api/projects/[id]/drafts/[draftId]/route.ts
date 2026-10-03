import type { CitedRef } from "@/lib/cite";
import { body, json, must, route, type RouteCtx } from "@/lib/server/api";

/** 글 저장 (제목·본문·인용) */
export const PATCH = route<RouteCtx<{ id: string; draftId: string }>>(async ({ req, supabase, userId, ctx }) => {
  const { draftId } = await ctx.params;
  const b = await body<{ title?: string; body?: string; citations?: CitedRef[] }>(req);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
  if (b.title !== undefined) patch.title = b.title.trim().slice(0, 120) || "제목 없는 글";
  if (b.body !== undefined) patch.body = b.body.slice(0, 200_000);
  if (b.citations !== undefined) patch.citations = b.citations.slice(0, 500);
  const row = must(await supabase.from("drafts").update(patch).eq("id", draftId).select("updated_at").single(), "글");
  return json({ updatedAt: row.updated_at });
});

export const DELETE = route<RouteCtx<{ id: string; draftId: string }>>(async ({ supabase, ctx }) => {
  const { draftId } = await ctx.params;
  must(await supabase.from("drafts").delete().eq("id", draftId), "글");
  return json({ ok: true });
});
