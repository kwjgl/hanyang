import type { GapConfig } from "@/lib/gapmap";
import { body, json, must, route, type RouteCtx } from "@/lib/server/api";

/** 지도 저장(날짜별 저장본) · 이름 바꾸기 · 내 연구 위치 표시 */
export const PATCH = route<RouteCtx<{ id: string; mapId: string }>>(async ({ req, supabase, ctx }) => {
  const { mapId } = await ctx.params;
  const b = await body<{ save?: boolean; label?: string; mine?: GapConfig["mine"] }>(req);
  const patch: Record<string, unknown> = {};
  if (b.save) {
    patch.saved = true;
    const d = new Date();
    patch.label = (b.label?.trim() || `${d.getMonth() + 1}월 ${d.getDate()}일 저장본`).slice(0, 60);
  } else if (b.label !== undefined) patch.label = b.label.trim().slice(0, 60) || null;
  if (b.mine !== undefined) {
    const cur = must(await supabase.from("gap_maps").select("config").eq("id", mapId).single(), "공백 지도");
    patch.config = { ...(cur.config as GapConfig), mine: b.mine };
  }
  must(await supabase.from("gap_maps").update(patch).eq("id", mapId), "공백 지도");
  return json({ ok: true });
});

export const DELETE = route<RouteCtx<{ id: string; mapId: string }>>(async ({ supabase, ctx }) => {
  const { mapId } = await ctx.params;
  must(await supabase.from("gap_maps").delete().eq("id", mapId), "공백 지도");
  return json({ ok: true });
});
