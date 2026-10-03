import { HttpError, json, must, route, type RouteCtx } from "@/lib/server/api";

/** 넣은 PDF 본문 (쪽별 글자) */
export const GET = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id: paperId } = await ctx.params;
  const { data } = await supabase.from("paper_fulltexts").select("pages, page_offset, file_name").eq("paper_id", paperId).maybeSingle();
  if (!data) throw new HttpError(404, "넣은 PDF가 없습니다");
  return json(data);
});

/** PDF 지우기 (분석 결과도 함께) */
export const DELETE = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id: paperId } = await ctx.params;
  must(await supabase.from("paper_fulltexts").delete().eq("paper_id", paperId), "PDF");
  return json({ ok: true });
});
