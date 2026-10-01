import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { checkKeyFormat, isProvider, parsePublic, parseSecrets, toPublic, type Provider } from "@/lib/llm/providers";
import { monthUsage } from "@/lib/server/ai";
import { body, HttpError, json, must, route } from "@/lib/server/api";

export const GET = route(async ({ supabase, userId }) => {
  const { data } = await supabase.from("user_settings").select("api_key_last4").eq("user_id", userId).maybeSingle();
  const usage = await monthUsage(supabase, userId);
  return json({ ai: parsePublic(data?.api_key_last4 ?? null), monthlyLimit: usage.limit, monthUsage: usage.used });
});

/**
 * 쓸 AI 고르기, AI별 API 키 등록·삭제, 월 한도 변경.
 * 키 원문은 암호화해서만 저장하고 응답에 다시 싣지 않는다.
 */
export const PUT = route(async ({ req, supabase, userId }) => {
  const b = await body<{ provider?: string; key?: { provider: string; value: string | null }; monthlyLimit?: number }>(req);
  const patch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };

  if (b.provider !== undefined || b.key !== undefined) {
    const { data } = await supabase.from("user_settings").select("api_key_enc").eq("user_id", userId).maybeSingle();
    let secrets;
    try {
      secrets = parseSecrets(data?.api_key_enc ? decryptSecret(data.api_key_enc) : null);
    } catch {
      secrets = parseSecrets(null);
    }
    if (b.provider !== undefined) {
      if (!isProvider(b.provider)) throw new HttpError(400, "알 수 없는 AI입니다");
      secrets.provider = b.provider;
    }
    if (b.key !== undefined) {
      if (!isProvider(b.key.provider)) throw new HttpError(400, "알 수 없는 AI입니다");
      const p: Provider = b.key.provider;
      const v = b.key.value?.trim() ?? "";
      if (!v) delete secrets.keys[p];
      else {
        const bad = checkKeyFormat(p, v);
        if (bad) throw new HttpError(400, bad);
        secrets.keys[p] = v;
      }
    }
    patch.api_key_enc = encryptSecret(JSON.stringify(secrets));
    patch.api_key_last4 = toPublic(secrets);
  }
  if (b.monthlyLimit !== undefined) {
    const v = Number(b.monthlyLimit);
    if (!Number.isFinite(v) || v < 0 || v > 1000) throw new HttpError(400, "한도는 0~1000달러 사이로 정해 주세요");
    patch.monthly_limit_usd = v;
  }
  must(await supabase.from("user_settings").upsert(patch), "설정");
  return json({ ok: true, ai: patch.api_key_last4 ? parsePublic(patch.api_key_last4 as string) : undefined });
});
