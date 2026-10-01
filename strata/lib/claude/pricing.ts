/** 1M 토큰당 달러. 사용량 표시용 대략값이며 실제 청구는 각 회사 콘솔이 기준이다. */
const PRICES: { prefix: string; input: number; output: number }[] = [
  { prefix: "claude-sonnet-5-5", input: 2, output: 10 },
  { prefix: "claude-haiku-4-5", input: 1, output: 5 },
  { prefix: "claude-opus-5-5", input: 4, output: 20 },
  { prefix: "claude-opus-5", input: 5, output: 25 },
  { prefix: "claude-opus-4-8", input: 5, output: 25 },
  // 다른 회사 모델. Gemini 무료 사용분은 실제로 청구되지 않는다.
  { prefix: "gemini-flash", input: 0.3, output: 2.5 },
  { prefix: "gemini-", input: 0.3, output: 2.5 },
  { prefix: "gpt-5-mini", input: 0.25, output: 2 },
  { prefix: "gpt-5", input: 1.25, output: 10 },
];

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES.find((x) => model.startsWith(x.prefix)) ?? PRICES[0];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
