import * as z from "zod/v4";
import { callStructured, ClaudeError, type ClaudeUsage } from "@/lib/claude/client";
import { costUsd } from "@/lib/claude/pricing";

export * from "./meta";
import { PROVIDERS, type Provider } from "./meta";
import type { AiSecrets } from "./meta";

export const toPublic = (s: AiSecrets): string =>
  JSON.stringify({ provider: s.provider, ...Object.fromEntries(Object.entries(s.keys).map(([p, k]) => [p, (k ?? "").slice(-4)])) });

// ------------------------------------------------------------------ 호출

export type Usage = ClaudeUsage;

/** Claude 외 모델은 스키마를 프롬프트로 알려주고, 받은 JSON을 zod로 검증한다 (한 번 다시 시도) */
function withSchema(system: string, schema: z.ZodType) {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return `${system}\n\n출력 형식: 아래 JSON 스키마에 맞는 JSON 객체 하나만 출력한다. 설명이나 코드 블록 표시는 붙이지 않는다.\n${JSON.stringify(js)}`;
}

function parseJson<S extends z.ZodType>(text: string, schema: S): z.infer<S> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const r = schema.safeParse(JSON.parse(cleaned));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, label: string) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new ClaudeError(`${label}에 연결하지 못했습니다.`, 503);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = JSON.stringify(data).slice(0, 300);
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|invalid_api_key|API key not valid/i.test(msg))
      throw new ClaudeError(`${label} API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.`, 401);
    if (res.status === 429)
      throw new ClaudeError(
        label === "Gemini" ? "Gemini 무료 사용량(분당·하루 요청 수)을 넘었습니다. 잠시 뒤 다시 시도해 주세요." : `${label} 요청 한도에 걸렸습니다. 충전 잔액이나 한도를 확인해 주세요.`,
        429,
      );
    throw new ClaudeError(`${label} 오류 (${res.status})`, 502);
  }
  return data;
}

async function callGemini<S extends z.ZodType>(apiKey: string, system: string, user: string, schema: S, maxTokens: number) {
  const model = PROVIDERS.gemini.model;
  let totalIn = 0;
  let totalOut = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = (await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": apiKey },
      {
        systemInstruction: { parts: [{ text: withSchema(system, schema) }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
      },
      "Gemini",
    )) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      modelVersion?: string;
    };
    totalIn += data.usageMetadata?.promptTokenCount ?? 0;
    totalOut += (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0);
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const parsed = parseJson(text, schema);
    if (parsed) {
      const m = data.modelVersion ?? model;
      return { data: parsed, usage: { model: m, inputTokens: totalIn, outputTokens: totalOut, costUsd: costUsd(m, totalIn, totalOut) } };
    }
    if (data.candidates?.[0]?.finishReason === "SAFETY") throw new ClaudeError("Gemini가 이 요청을 처리하지 않았습니다. 다른 논문으로 시도해 주세요.", 422);
  }
  throw new ClaudeError("Gemini 응답을 읽지 못했습니다. 다시 시도해 주세요.");
}

async function callOpenAI<S extends z.ZodType>(apiKey: string, system: string, user: string, schema: S, maxTokens: number) {
  const model = PROVIDERS.openai.model;
  let totalIn = 0;
  let totalOut = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = (await post(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${apiKey}` },
      {
        model,
        messages: [
          { role: "system", content: withSchema(system, schema) },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        max_completion_tokens: maxTokens,
      },
      "OpenAI",
    )) as {
      choices?: { message?: { content?: string; refusal?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    totalIn += data.usage?.prompt_tokens ?? 0;
    totalOut += data.usage?.completion_tokens ?? 0;
    const msg = data.choices?.[0]?.message;
    if (msg?.refusal) throw new ClaudeError("ChatGPT가 이 요청을 처리하지 않았습니다. 다른 논문으로 시도해 주세요.", 422);
    const parsed = parseJson(msg?.content ?? "", schema);
    if (parsed) {
      const m = data.model ?? model;
      return { data: parsed, usage: { model: m, inputTokens: totalIn, outputTokens: totalOut, costUsd: costUsd(m, totalIn, totalOut) } };
    }
  }
  throw new ClaudeError("ChatGPT 응답을 읽지 못했습니다. 다시 시도해 주세요.");
}

/** 고른 AI로 한 번 호출해 스키마에 맞는 결과를 받는다 */
export async function callAi<S extends z.ZodType>(
  provider: Provider,
  apiKey: string,
  req: { system: string; user: string; schema: S; maxTokens?: number },
): Promise<{ data: z.infer<S>; usage: Usage }> {
  const maxTokens = req.maxTokens ?? 4000;
  // Gemini는 생각(thinking) 토큰도 출력 한도에 포함되므로 넉넉히 둔다
  if (provider === "gemini") return callGemini(apiKey, req.system, req.user, req.schema, Math.max(maxTokens, 8192));
  if (provider === "openai") return callOpenAI(apiKey, req.system, req.user, req.schema, maxTokens);
  return callStructured({ apiKey, ...req });
}
