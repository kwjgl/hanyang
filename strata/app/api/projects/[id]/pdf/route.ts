// 서지 정보를 AI로 읽고 데이터베이스에서 찾느라 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { body, json, route, type RouteCtx } from "@/lib/server/api";
import { addPdf, type PdfInput } from "@/lib/server/fulltext";

/** PDF 넣기: 브라우저에서 뽑은 쪽별 글자를 받아 논문에 붙인다 (paperId가 없으면 새 논문으로 보관) */
export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, userId, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<PdfInput & { paperId?: string | null }>(req);
  return json(await addPdf(supabase, userId, id, b));
});
