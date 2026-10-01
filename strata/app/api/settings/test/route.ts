import * as z from "zod/v4";
import { runAi } from "@/lib/server/ai";
import { json, route } from "@/lib/server/api";

/** 등록한 키로 아주 짧은 요청을 보내 연결을 확인한다 */
export const POST = route(async ({ supabase, userId }) => {
  const out = await runAi(supabase, userId, "test", {
    system: "Reply with ok=true.",
    user: "ping",
    schema: z.object({ ok: z.boolean() }),
    maxTokens: 400,
  });
  return json({ ok: out.ok === true });
});
