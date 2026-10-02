// AI 호출을 기다리므로 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { json, route, type RouteCtx } from "@/lib/server/api";
import { classifyGapBatch } from "@/lib/server/gapmap";

/** 대기열의 다음 묶음을 분류한다. 화면이 끝날 때까지 되풀이해 부른다. */
export const POST = route<RouteCtx<{ id: string; mapId: string }>>(async ({ supabase, userId, ctx }) => {
  const { mapId } = await ctx.params;
  return json(await classifyGapBatch(supabase, userId, mapId));
});
