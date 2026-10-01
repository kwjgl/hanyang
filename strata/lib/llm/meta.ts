// 브라우저에서도 쓰는 AI 목록과 표시용 정보 (서버 전용 코드는 providers.ts)

export type Provider = "anthropic" | "gemini" | "openai";

export const PROVIDERS: Record<Provider, { label: string; model: string; keyHint: string; keyUrl: string; note: string }> = {
  anthropic: {
    label: "Claude",
    model: "claude-sonnet-5-5",
    keyHint: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    note: "충전 필요(최소 $5). 논문 100편 요약에 약 $1.",
  },
  gemini: {
    label: "Gemini",
    model: "gemini-flash-latest",
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "무료 사용량이 있습니다(하루 요청 수 제한). 무료 사용분은 Google이 서비스 개선에 쓸 수 있습니다.",
  },
  openai: {
    label: "ChatGPT",
    model: "gpt-5-mini",
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    note: "충전 필요(최소 $5). 논문 100편 요약에 약 $0.2.",
  },
};

export const isProvider = (p: unknown): p is Provider => p === "anthropic" || p === "gemini" || p === "openai";

export function checkKeyFormat(p: Provider, key: string): string | null {
  if (p === "anthropic" && !key.startsWith("sk-ant-")) return "Claude API 키는 sk-ant- 로 시작합니다";
  if (p === "openai" && !key.startsWith("sk-")) return "OpenAI API 키는 sk- 로 시작합니다";
  if (p === "gemini" && !key.startsWith("AIza")) return "Gemini API 키는 AIza 로 시작합니다";
  return null;
}

/**
 * 사용자 AI 설정은 기존 user_settings 칸에 담는다 (DB를 바꾸지 않으려고).
 * - api_key_enc: 암호화한 JSON {"provider": ..., "keys": {"anthropic": "...", ...}}
 *   예전 형식(Claude 키 문자열 하나)도 그대로 읽는다.
 * - api_key_last4: JSON {"provider": ..., "anthropic": "abcd", ...} (화면 표시용, 비밀 아님)
 */
export interface AiSecrets {
  provider: Provider;
  keys: Partial<Record<Provider, string>>;
}

export function parseSecrets(plain: string | null): AiSecrets {
  if (!plain) return { provider: "anthropic", keys: {} };
  if (plain.startsWith("sk-ant-")) return { provider: "anthropic", keys: { anthropic: plain } };
  try {
    const v = JSON.parse(plain) as AiSecrets;
    return { provider: isProvider(v.provider) ? v.provider : "anthropic", keys: v.keys ?? {} };
  } catch {
    return { provider: "anthropic", keys: {} };
  }
}

export interface PublicAi {
  provider: Provider;
  last4: Partial<Record<Provider, string>>;
}

export function parsePublic(raw: string | null): PublicAi {
  if (!raw) return { provider: "anthropic", last4: {} };
  if (raw.length <= 4) return { provider: "anthropic", last4: { anthropic: raw } };
  try {
    const v = JSON.parse(raw) as { provider?: string } & Partial<Record<Provider, string>>;
    return {
      provider: isProvider(v.provider) ? v.provider : "anthropic",
      last4: Object.fromEntries((["anthropic", "gemini", "openai"] as Provider[]).filter((p) => v[p]).map((p) => [p, v[p]])),
    };
  } catch {
    return { provider: "anthropic", last4: {} };
  }
}

