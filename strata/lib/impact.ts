import type { Impact } from "@/lib/types";

export type Tier = "top1" | "top10" | "other" | "recent" | "none";

const NON_JOURNAL: Record<string, string> = {
  "book-chapter": "책 장",
  book: "책",
  report: "보고서",
  dissertation: "학위논문",
  preprint: "프리프린트",
};

/** 출판 2년 이내는 피인용이 쌓이기 전이라 순위로 판단하지 않는다 */
export function tierOf(impact: Impact | null | undefined, year: number | null, now = new Date()): Tier {
  const pct = impact?.pct;
  if (year && now.getFullYear() - year < 2) return "recent";
  if (pct == null) return "none";
  if (pct >= 99) return "top1";
  if (pct >= 90) return "top10";
  return "other";
}

export function tierLabel(tier: Tier, pct?: number | null): string {
  switch (tier) {
    case "top1":
      return "상위 1%";
    case "top10":
      return "상위 10%";
    case "other":
      return `상위 ${Math.max(1, Math.round(100 - (pct ?? 0)))}%`;
    case "recent":
      return "최근 논문 · 판단 이름";
    default:
      return "분야 보정 지표 없음";
  }
}

export const nonJournalLabel = (kind: string | null | undefined) => (kind ? (NON_JOURNAL[kind] ?? null) : null);
