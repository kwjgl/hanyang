import { callStructured, ClaudeError, type ClaudeUsage } from "@/lib/claude/client";
import { decryptSecret } from "@/lib/crypto";
import type { Supa } from "@/lib/supabase/server";
import type * as z from "zod/v4";

async function userApiKey(supabase: Supa, userId: string): Promise<string> {
  const { data } = await supabase.from("user_settings").select("api_key_enc").eq("user_id", userId).maybeSingle();
  if (!data?.api_key_enc) throw new ClaudeError("설정에서 Anthropic API 키를 먼저 등록해 주세요.", 402);
  try {
    return decryptSecret(data.api_key_enc);
  } catch {
    throw new ClaudeError("저장된 API 키를 읽지 못했습니다. 설정에서 다시 등록해 주세요.", 402);
  }
}

export async function monthUsage(supabase: Supa, userId: string): Promise<{ used: number; limit: number }> {
  const [{ data: used }, { data: s }] = await Promise.all([
    supabase.rpc("my_month_usage"),
    supabase.from("user_settings").select("monthly_limit_usd").eq("user_id", userId).maybeSingle(),
  ]);
  return { used: Number(used ?? 0), limit: Number(s?.monthly_limit_usd ?? 5) };
}

async function record(supabase: Supa, userId: string, kind: string, u: ClaudeUsage) {
  await supabase.from("usage_events").insert({
    user_id: userId,
    kind,
    model: u.model,
    input_tokens: u.inputTokens,
    output_tokens: u.outputTokens,
    cost_usd: u.costUsd,
  });
}

/** 한도 확인 → 사용자 키로 호출 → 사용량 기록 */
export async function runAi<S extends z.ZodType>(
  supabase: Supa,
  userId: string,
  kind: "expand" | "summary" | "classify" | "test",
  req: { system: string; user: string; schema: S; maxTokens?: number },
): Promise<z.infer<S>> {
  const { used, limit } = await monthUsage(supabase, userId);
  if (used >= limit) {
    throw new ClaudeError(`이번 달 AI 사용 한도($${limit.toFixed(2)})에 닿았습니다. 설정에서 한도를 바꿀 수 있습니다.`, 402);
  }
  const apiKey = await userApiKey(supabase, userId);
  const { data, usage } = await callStructured({ apiKey, ...req });
  await record(supabase, userId, kind, usage);
  return data;
}
