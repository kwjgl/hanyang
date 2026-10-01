import { encryptSecret, last4 } from "@/lib/crypto";
import { monthUsage } from "@/lib/server/ai";
import { body, HttpError, json, must, route } from "@/lib/server/api";

export const GET = route(async ({ supabase, userId }) => {
  const { data } = await supabase.from("user_settings").select("api_key_last4, monthly_limit_usd").eq("user_id", userId).maybeSingle();
  const usage = await monthUsage(supabase, userId);
  return json({ apiKeyLast4: data?.api_key_last4 ?? null, monthlyLimit: usage.limit, monthUsage: usage.used });
});

/** API 키 등록·삭제, 월 한도 변경. 키 원문은 응답에 다시 싣지 않는다. */
export const PUT = route(async ({ req, supabase, userId }) => {
  const b = await body<{ apiKey?: string | null; monthlyLimit?: number }>(req);
  const patch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (b.apiKey !== undefined) {
    if (b.apiKey === null || b.apiKey === "") {
      patch.api_key_enc = null;
      patch.api_key_last4 = null;
    } else {
      const k = b.apiKey.trim();
      if (!k.startsWith("sk-ant-")) throw new HttpError(400, "Anthropic API 키는 sk-ant- 로 시작합니다");
      patch.api_key_enc = encryptSecret(k);
      patch.api_key_last4 = last4(k);
    }
  }
  if (b.monthlyLimit !== undefined) {
    const v = Number(b.monthlyLimit);
    if (!Number.isFinite(v) || v < 0 || v > 1000) throw new HttpError(400, "한도는 0~1000달러 사이로 정해 주세요");
    patch.monthly_limit_usd = v;
  }
  must(await supabase.from("user_settings").upsert(patch), "설정");
  return json({ ok: true, apiKeyLast4: patch.api_key_last4 });
});
