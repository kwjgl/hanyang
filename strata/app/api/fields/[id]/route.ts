import { body, json, must, route, type RouteCtx } from "@/lib/server/api";

export const PATCH = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ name?: string; description?: string; color?: number; position?: number; hidden?: boolean }>(req);
  const patch = Object.fromEntries(Object.entries(b).filter(([k, v]) => v !== undefined && ["name", "description", "color", "position", "hidden"].includes(k)));
  must(await supabase.from("fields").update(patch).eq("id", id), "분야");
  return json({ ok: true });
});

export const DELETE = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  must(await supabase.from("fields").delete().eq("id", id), "분야");
  return json({ ok: true });
});
