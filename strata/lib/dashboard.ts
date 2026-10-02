import { tierOf, type Tier } from "@/lib/impact";
import type { Impact } from "@/lib/types";

export interface Bin {
  label: string;
  tip: string;
  n: number;
}

/** 출판 연도를 범위에 맞춰 묶는다: 12년 이하면 해마다, 40년 이하면 5년, 그보다 길면 10년 단위 */
export function yearBins(years: (number | null)[]): Bin[] {
  const ys = years.filter((y): y is number => !!y);
  if (!ys.length) return [];
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min + 1;
  const step = span <= 12 ? 1 : span <= 40 ? 5 : 10;
  const start = Math.floor(min / step) * step;
  const bins: Bin[] = [];
  for (let s = start; s <= max; s += step) {
    const n = ys.filter((y) => y >= s && y < s + step).length;
    const label = step === 1 ? `'${String(s).slice(2)}` : step === 5 ? String(s) : `${s}s`;
    const tip = step === 1 ? `${s}년: ${n}편` : step === 5 ? `${s}–${s + 4}년: ${n}편` : `${s}년대: ${n}편`;
    bins.push({ label, tip, n });
  }
  return bins;
}

/** 최근 weeks주 동안 주마다 보관한 편수 (마지막이 이번 주) */
export function weeklyCounts(dates: string[], weeks = 8, now = new Date()): number[] {
  const out = new Array<number>(weeks).fill(0);
  const week = 7 * 864e5;
  for (const d of dates) {
    const ago = Math.floor((now.getTime() - new Date(d).getTime()) / week);
    if (ago >= 0 && ago < weeks) out[weeks - 1 - ago]++;
  }
  return out;
}

export const TIER_ORDER: [Tier, string][] = [
  ["top1", "상위 1%"],
  ["top10", "상위 10%"],
  ["other", "그 외"],
  ["recent", "최근 2년 논문"],
  ["none", "지표 없음"],
];

export function tierCounts(papers: { impact: Impact | null; year: number | null }[], now = new Date()): Record<Tier, number> {
  const out: Record<Tier, number> = { top1: 0, top10: 0, other: 0, recent: 0, none: 0 };
  for (const p of papers) out[tierOf(p.impact, p.year, now)]++;
  return out;
}

/** 값이 많은 순으로 센다 */
export function countBy<T>(items: T[], keyOf: (x: T) => string | string[] | null | undefined): { label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyOf(it);
    for (const key of Array.isArray(k) ? k : k ? [k] : []) m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
