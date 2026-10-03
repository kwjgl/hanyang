export const maxDuration = 60;

import { json, route, type RouteCtx } from "@/lib/server/api";
import { outlineToDraft } from "@/lib/server/consult";

/** 상담 내용 → 이론적 배경 개요 (새 글) */
export const POST = route<RouteCtx<{ id: string; consultId: string }>>(async ({ supabase, userId, ctx }) => {
  const { id, consultId } = await ctx.params;
  return json(await outlineToDraft(supabase, userId, id, consultId));
});
