import { body, HttpError, json, must, route } from "@/lib/server/api";

/** 이 저장 검색의 새 논문을 읽음으로 표시 (나에게만) */
export const POST = route(async ({ req, supabase, userId }) => {
  const { searchId } = await body<{ searchId: string }>(req);
  if (!searchId) throw new HttpError(400, "검색이 필요합니다");
  must(await supabase.from("alert_reads").upsert({ user_id: userId, search_id: searchId, read_at: new Date().toISOString() }), "알림");
  return json({ ok: true });
});
