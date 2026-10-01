import { json, route, type RouteCtx } from "@/lib/server/api";
import { reclassify } from "@/lib/server/papers";

/** 바뀐 분야 목록으로 다시 분류 (직접 지정한 분야가 있으면 그대로 둠) */
export const POST = route<RouteCtx<{ id: string }>>(async ({ supabase, userId, ctx }) => {
  const { id } = await ctx.params;
  const out = await reclassify(supabase, userId, id);
  return json(out);
});
