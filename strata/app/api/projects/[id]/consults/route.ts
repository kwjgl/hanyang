// AI 답을 받고 문헌을 데이터베이스에서 확인하느라 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { body, json, route, type RouteCtx } from "@/lib/server/api";
import { isMissingTable } from "@/lib/server/alerts";
import { consultTurn } from "@/lib/server/consult";

/** 이 프로젝트의 상담 목록 (내용은 하나씩 불러온다) */
export const GET = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  const { data, error } = await supabase.from("consults").select("id, title, updated_at").eq("project_id", id).order("updated_at", { ascending: false }).limit(50);
  if (isMissingTable(error) || /consults/.test(error?.message ?? "")) return json({ ready: false, consults: [] });
  if (error) throw error;
  return json({ ready: true, consults: data ?? [] });
});

/** 새 상담을 첫 질문과 함께 시작한다 */
export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, userId, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ text: string; scholar?: boolean }>(req);
  return json({ consult: await consultTurn(supabase, userId, id, null, String(b.text ?? ""), { scholar: !!b.scholar }) });
});
