export const maxDuration = 60;

import { body, HttpError, json, must, route, type RouteCtx } from "@/lib/server/api";
import { consultTurn, loadConsult } from "@/lib/server/consult";

type Ctx = RouteCtx<{ id: string; consultId: string }>;

export const GET = route<Ctx>(async ({ supabase, ctx }) => {
  const { id, consultId } = await ctx.params;
  const c = await loadConsult(supabase, consultId);
  if (c.project_id !== id) throw new HttpError(404, "상담을 찾지 못했습니다");
  return json({ consult: c });
});

/** 이어서 묻기 */
export const POST = route<Ctx>(async ({ req, supabase, userId, ctx }) => {
  const { id, consultId } = await ctx.params;
  const b = await body<{ text: string }>(req);
  return json({ consult: await consultTurn(supabase, userId, id, consultId, String(b.text ?? "")) });
});

/** 제목 바꾸기 */
export const PATCH = route<Ctx>(async ({ req, supabase, ctx }) => {
  const { id, consultId } = await ctx.params;
  const b = await body<{ title?: string }>(req);
  must(await supabase.from("consults").update({ title: (b.title ?? "").trim().slice(0, 80) || "새 상담" }).eq("id", consultId).eq("project_id", id), "상담");
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async ({ supabase, ctx }) => {
  const { id, consultId } = await ctx.params;
  must(await supabase.from("consults").delete().eq("id", consultId).eq("project_id", id), "상담");
  return json({ ok: true });
});
