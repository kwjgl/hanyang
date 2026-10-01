import { body, HttpError, json, must, route } from "@/lib/server/api";

/** 내 읽기 상태·별표 (사람마다 따로) */
export const PUT = route(async ({ req, supabase, userId }) => {
  const { paperId, status, starred } = await body<{ paperId: string; status?: "todo" | "doing" | "done"; starred?: boolean }>(req);
  if (!paperId) throw new HttpError(400, "논문이 필요합니다");
  const { data: cur } = await supabase.from("user_papers").select("status, starred").eq("user_id", userId).eq("paper_id", paperId).maybeSingle();
  must(
    await supabase.from("user_papers").upsert({
      user_id: userId,
      paper_id: paperId,
      status: status ?? cur?.status ?? "todo",
      starred: starred ?? cur?.starred ?? false,
      updated_at: new Date().toISOString(),
    }),
    "읽기 상태",
  );
  return json({ ok: true });
});
