// AI를 두 번 부르고 데이터베이스를 여러 번 찾으므로 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { body, json, route, type RouteCtx } from "@/lib/server/api";
import { recommendCitations } from "@/lib/server/cite";

/** 글에서 인용이 필요한 문장을 찾고 어울리는 실제 문헌을 추천한다 */
export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, userId, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ text: string; scholar?: boolean }>(req);
  return json(await recommendCitations(supabase, userId, id, String(b.text ?? ""), { scholar: !!b.scholar }));
});
