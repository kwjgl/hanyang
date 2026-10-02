import type { CustomAxis } from "@/lib/gapmap";
import { body, json, route, type RouteCtx } from "@/lib/server/api";
import { createGapMap, loadGapMaps } from "@/lib/server/gapmap";

/** 공백 지도 목록과 지도 하나 (?map=id, 없으면 가장 최근 것) */
export const GET = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  return json(await loadGapMaps(supabase, id, new URL(req.url).searchParams.get("map")));
});

/** 새 지도 만들기: 논문을 모으고 분류 대기열을 만든다. 분류는 classify를 여러 번 불러 진행한다. */
export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ top?: number; searchId?: string | null; custom?: CustomAxis | null }>(req);
  const top = Math.max(0, Math.min(300, Number(b.top) || 100));
  const custom = b.custom
    ? { name: String(b.custom.name ?? "").trim().slice(0, 40), categories: [...new Set((b.custom.categories ?? []).map((c) => String(c).trim()).filter(Boolean))].slice(0, 8) }
    : null;
  return json(await createGapMap(supabase, id, { top, searchId: b.searchId ?? null, custom }));
});
