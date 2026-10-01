/** 1M 토큰당 달러 (Anthropic 공식 요금, 2026-09 기준) */
const PRICES: { prefix: string; input: number; output: number }[] = [
  { prefix: "claude-sonnet-5-5", input: 2, output: 10 },
  { prefix: "claude-haiku-4-5", input: 1, output: 5 },
  { prefix: "claude-opus-5-5", input: 4, output: 20 },
  { prefix: "claude-opus-5", input: 5, output: 25 },
  { prefix: "claude-opus-4-8", input: 5, output: 25 },
];

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES.find((x) => model.startsWith(x.prefix)) ?? PRICES[0];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
