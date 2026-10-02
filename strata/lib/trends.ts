/** 최근 5년 합계가 그 앞 5년보다 몇 % 늘었는지. 앞 5년이 0이면 null */
export function recentChange(counts: number[]): number | null {
  if (counts.length < 10) return null;
  const sum = (a: number[]) => a.reduce((p, c) => p + c, 0);
  const last5 = sum(counts.slice(-5));
  const prev5 = sum(counts.slice(-10, -5));
  return prev5 ? Math.round(((last5 - prev5) / prev5) * 100) : null;
}

export function changeLabel(ch: number | null): string {
  if (ch == null) return "비교할 자료 부족";
  return `${ch >= 0 ? "+" : ""}${ch}% ${ch >= 30 ? "↑ 성장 중" : ch <= -10 ? "↓ 감소" : "→ 유지"}`;
}

/** 눈금 간격: 1·2·5 × 10^n 중에서 4~6칸이 되게 */
export function niceStep(max: number, target = 5): number {
  if (max <= 0) return 1;
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/**
 * 규모가 다른 검색어를 한 축에서 비교하려고, 첫 5년 평균을 100으로 놓고 바꾼다.
 * 첫 5년이 모두 0이면 처음 0이 아닌 해를 기준으로 삼는다.
 */
export function indexed(counts: number[]): number[] {
  const head = counts.slice(0, 5);
  let base = head.reduce((p, c) => p + c, 0) / Math.max(1, head.length);
  if (!base) base = counts.find((c) => c > 0) ?? 0;
  return base ? counts.map((c) => Math.round((c / base) * 100)) : counts.map(() => 0);
}
