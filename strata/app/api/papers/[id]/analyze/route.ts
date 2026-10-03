// 긴 본문을 AI가 읽느라 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { json, route, type RouteCtx } from "@/lib/server/api";
import { analyzePaper } from "@/lib/server/fulltext";

/** PDF 본문 상세 분석 (선행연구 분석표 항목) */
export const POST = route<RouteCtx<{ id: string }>>(async ({ supabase, userId, ctx }) => {
  const { id: paperId } = await ctx.params;
  return json({ details: await analyzePaper(supabase, userId, paperId) });
});
