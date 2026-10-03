import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { costUsd } from "./pricing";

export const SUMMARY_MODEL = "claude-sonnet-5-5";
/** 긴 본문에서 정해진 항목을 뽑는 일처럼 깊은 판단이 덜 필요한 작업용 (입력 $1 / 출력 $5, 1M 토큰당) */
export const CHEAP_MODEL = "claude-haiku-4-5";

export class ClaudeError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface ClaudeUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * 사용자 키로 Claude를 한 번 호출해 스키마에 맞는 JSON을 받는다.
 * 안전 분류기가 요청을 거절하면 서버가 다른 모델로 이어서 처리하도록 fallbacks를 켠다.
 */
export async function callStructured<S extends z.ZodType>(opts: {
  apiKey: string;
  system: string;
  user: string;
  schema: S;
  model?: string;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: ClaudeUsage }> {
  const model = opts.model ?? SUMMARY_MODEL;
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 60_000 });
  try {
    const base = { model, max_tokens: opts.maxTokens ?? 4000, system: opts.system, messages: [{ role: "user" as const, content: opts.user }] };
    // Haiku 4.5는 effort와 server-side fallbacks를 받지 않는다 (보내면 400)
    const res = model.startsWith("claude-haiku")
      ? await client.beta.messages.parse({ ...base, output_config: { format: betaZodOutputFormat(opts.schema) } })
      : await client.beta.messages.parse({
          ...base,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
        });
    const usage: ClaudeUsage = {
      model: res.model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      costUsd: costUsd(res.model, res.usage.input_tokens, res.usage.output_tokens),
    };
    if (res.stop_reason === "refusal") throw new ClaudeError("Claude가 이 요청을 처리하지 않았습니다. 다른 논문으로 시도해 보세요.", 422);
    if (res.stop_reason === "max_tokens") throw new ClaudeError("응답이 너무 길어 중간에 끊겼습니다. 다시 시도해 주세요.");
    if (!res.parsed_output) throw new ClaudeError("Claude 응답을 읽지 못했습니다. 다시 시도해 주세요.");
    return { data: res.parsed_output as z.infer<S>, usage };
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.", 401);
    if (e instanceof Anthropic.PermissionDeniedError) throw new ClaudeError("이 API 키로는 해당 모델을 쓸 수 없습니다.", 403);
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError("Claude 요청 한도에 걸렸습니다. 잠시 뒤 다시 시도해 주세요.", 429);
    if (e instanceof Anthropic.BadRequestError) throw new ClaudeError(`요청 형식 오류: ${e.message}`, 400);
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError("Claude에 연결하지 못했습니다.", 503);
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`Claude 오류 (${e.status ?? "?"})`, 502);
    throw e;
  }
}
