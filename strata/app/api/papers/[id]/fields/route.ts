import { body, json, must, route, type RouteCtx } from "@/lib/server/api";

/** 분야를 직접 지정한다. 이후 자동 분류는 이 논문을 건드리지 않는다. 빈 목록이면 자동 분류로 되돌린다. */
export const PUT = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const { fieldIds } = await body<{ fieldIds: string[] }>(req);
  must(await supabase.from("paper_fields").delete().eq("paper_id", id), "분야");
  if (fieldIds?.length) {
    must(await supabase.from("paper_fields").insert(fieldIds.map((field_id) => ({ paper_id: id, field_id, source: "manual" }))), "분야");
  }
  return json({ ok: true });
});
