import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { ClaudeError } from "@/lib/claude/client";
import { callAi, checkKeyFormat, parsePublic, parseSecrets, toPublic } from "@/lib/llm/providers";

const Schema = z.object({ terms_en: z.array(z.string()), terms_ko: z.array(z.string()) });
const req = { system: "sys", user: "검색 주제: 읽기 평가", schema: Schema, maxTokens: 500 };

function stub(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

const geminiBody = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 10 },
  modelVersion: "gemini-flash-test",
});
const openaiBody = (content: string) => ({ choices: [{ message: { content, refusal: null } }], usage: { prompt_tokens: 80, completion_tokens: 40 }, model: "gpt-5-mini-test" });
const good = JSON.stringify({ terms_en: ["reading assessment"], terms_ko: ["읽기 평가"] });

describe("Gemini", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends the key in a header, asks for JSON and validates the answer", async () => {
    const calls = stub([{ body: geminiBody(good) }]);
    const r = await callAi("gemini", "AIzaTEST", req);
    expect(r.data.terms_ko).toEqual(["읽기 평가"]);
    expect(calls[0].url).toContain("models/gemini-flash-latest:generateContent");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIzaTEST");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.generationConfig.responseMimeType).toBe("application/json");
    expect(sent.systemInstruction.parts[0].text).toContain('"terms_en"');
    expect(r.usage.inputTokens).toBe(100);
    expect(r.usage.outputTokens).toBe(60);
  });
  it("retries once when the JSON does not match, then succeeds", async () => {
    const calls = stub([{ body: geminiBody("{\"oops\":1}") }, { body: geminiBody("```json\n" + good + "\n```") }]);
    const r = await callAi("gemini", "AIzaTEST", req);
    expect(calls).toHaveLength(2);
    expect(r.data.terms_en).toEqual(["reading assessment"]);
  });
  it("explains the free-tier limit on 429", async () => {
    stub([{ status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } }]);
    await expect(callAi("gemini", "AIzaTEST", req)).rejects.toThrow(/무료 사용량/);
  });
  it("reports an invalid key", async () => {
    stub([{ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } } }]);
    await expect(callAi("gemini", "AIzaBAD", req)).rejects.toBeInstanceOf(ClaudeError);
  });
});

describe("OpenAI", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses a bearer key and JSON mode", async () => {
    const calls = stub([{ body: openaiBody(good) }]);
    const r = await callAi("openai", "sk-test", req);
    expect(r.data.terms_en).toEqual(["reading assessment"]);
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.model).toBe("gpt-5-mini");
    expect(r.usage.model).toBe("gpt-5-mini-test");
  });
  it("fails clearly after two unreadable answers", async () => {
    stub([{ body: openaiBody("not json") }]);
    await expect(callAi("openai", "sk-test", req)).rejects.toThrow(/읽지 못했습니다/);
  });
});

describe("stored AI settings", () => {
  it("reads the old single Claude key format", () => {
    expect(parseSecrets("sk-ant-api03-abc")).toEqual({ provider: "anthropic", keys: { anthropic: "sk-ant-api03-abc" } });
    expect(parsePublic("wxyz")).toEqual({ provider: "anthropic", last4: { anthropic: "wxyz" } });
  });
  it("round-trips the multi-provider format and only exposes last 4 characters", () => {
    const s = { provider: "gemini" as const, keys: { anthropic: "sk-ant-api03-1111", gemini: "AIzaSy2222" } };
    expect(parseSecrets(JSON.stringify(s))).toEqual(s);
    const pub = toPublic(s);
    expect(pub).not.toContain("AIzaSy");
    expect(parsePublic(pub)).toEqual({ provider: "gemini", last4: { anthropic: "1111", gemini: "2222" } });
  });
  it("checks key prefixes per provider", () => {
    expect(checkKeyFormat("gemini", "AIzaSyA1234567890abcdefghij")).toBeNull();
    expect(checkKeyFormat("gemini", "AQ.Ab8RN6Kx1234567890abcdefgh")).toBeNull();
    expect(checkKeyFormat("gemini", "AQ.short")).not.toBeNull();
    expect(checkKeyFormat("gemini", "AIza with space 12345678")).not.toBeNull();
    expect(checkKeyFormat("openai", "sk-proj-x")).toBeNull();
    expect(checkKeyFormat("anthropic", "sk-x")).not.toBeNull();
  });
});

describe("Gemini busy (503) handling", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fast = { ...req, waitMs: 0 };
  const busy = { status: 503, body: { error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded." } } };

  it("waits and retries the same model once", async () => {
    const calls = stub([busy, { body: geminiBody(good) }]);
    const r = await callAi("gemini", "AQ.test-key-1234567890", fast);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("models/gemini-flash-latest:");
    expect(r.data.terms_ko).toEqual(["읽기 평가"]);
  });
  it("moves to the next Gemini model when one stays busy", async () => {
    const calls = stub([busy, busy, { body: geminiBody(good) }]);
    await callAi("gemini", "AQ.test-key-1234567890", fast);
    expect(calls[2].url).toContain("models/gemini-2.5-flash:");
  });
  it("skips a model that does not exist", async () => {
    const calls = stub([{ status: 404, body: { error: { code: 404, message: "models/x is not found" } } }, { body: geminiBody(good) }]);
    await callAi("gemini", "AQ.test-key-1234567890", fast);
    expect(calls[1].url).toContain("models/gemini-2.5-flash:");
  });
  it("explains a busy server after every model fails", async () => {
    const calls = stub([busy]);
    await expect(callAi("gemini", "AQ.test-key-1234567890", fast)).rejects.toThrow(/붐빕니다/);
    expect(calls).toHaveLength(8);
  });
});

describe("Claude model choice", () => {
  afterEach(() => vi.unstubAllGlobals());
  const claudeBody = (model: string) => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: good }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
  it("uses Haiku without effort or fallbacks for cheap work, and the default model otherwise", async () => {
    const calls = stub([{ body: claudeBody("claude-haiku-4-5") }]);
    const r = await callAi("anthropic", "sk-ant-test", { ...req, cheap: true });
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.model).toBe("claude-haiku-4-5");
    expect(sent.output_config.effort).toBeUndefined();
    expect(sent.fallbacks).toBeUndefined();
    expect(r.data.terms_ko).toEqual(["읽기 평가"]);
    expect(r.usage.costUsd).toBeCloseTo((1000 * 1 + 100 * 5) / 1_000_000);

    const calls2 = stub([{ body: claudeBody("claude-sonnet-5-5") }]);
    await callAi("anthropic", "sk-ant-test", req);
    const sent2 = JSON.parse(String(calls2[0].init.body));
    expect(sent2.model).toBe("claude-sonnet-5-5");
    expect(sent2.output_config.effort).toBe("low");
    expect(sent2.fallbacks).toBe("default");
  });
});
