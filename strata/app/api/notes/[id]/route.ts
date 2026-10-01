import { json, must, route, type RouteCtx } from "@/lib/server/api";

export const DELETE = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  must(await supabase.from("paper_notes").delete().eq("id", id), "메모");
  return json({ ok: true });
});
