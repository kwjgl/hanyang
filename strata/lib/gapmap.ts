import { LEVELS, STUDY_TYPES } from "@/lib/claude/schemas";
import { hasHangul } from "@/lib/text";

/** 지도에 놓인 논문 한 편 */
export interface GapItem {
  key: string;
  title: string;
  year: number | null;
  url: string | null;
  /** 국문 논문인지 (국내·해외 축) */
  ko: boolean;
  /** 소주제 이름. 어느 소주제에도 맞지 않으면 null */
  subtopic: string | null;
  levels: string[];
  method: string | null;
  /** 직접 정의한 축의 범주 */
  custom: string | null;
  /** 이 프로젝트에 보관한 논문인지 */
  saved: boolean;
}

/** 아직 분류하지 않은 논문 (AI에 보낼 것) */
export interface GapQueued {
  key: string;
  title: string;
  abstract: string | null;
  year: number | null;
  url: string | null;
  ko: boolean;
  saved: boolean;
  /** 이미 알고 있는 값 (보관한 논문의 소주제·요약) */
  known?: { subtopic?: string | null; levels?: string[]; method?: string | null };
}

export interface CustomAxis {
  name: string;
  categories: string[];
}

export interface GapConfig {
  subtopics: string[];
  custom?: CustomAxis | null;
  /** 내 연구 위치: 소주제 × (축 → 칸) */
  mine?: { row: string; cols: Partial<Record<AxisId, string>> } | null;
  /** 어디서 모은 논문인지 */
  source?: { query: string | null; searchId: string | null; top: number; savedCount: number };
  queue?: GapQueued[];
  total?: number;
}

export type AxisId = "level" | "method" | "period" | "region" | "custom";

export const AXES: { id: AxisId; label: string; ai: boolean }[] = [
  { id: "level", label: "대상 학교급", ai: true },
  { id: "method", label: "연구 방법", ai: true },
  { id: "period", label: "출판 시기", ai: false },
  { id: "region", label: "국내·해외", ai: false },
  { id: "custom", label: "직접 정의", ai: true },
];

export const LEVEL_COLS = LEVELS.filter((l) => l !== "해당 없음");
export const METHOD_COLS = [...STUDY_TYPES];

export function periodOf(year: number | null): string | null {
  if (!year) return null;
  if (year < 2010) return "~2009";
  if (year < 2015) return "2010–14";
  if (year < 2020) return "2015–19";
  if (year < 2025) return "2020–24";
  return "2025~";
}
export const PERIOD_COLS = ["~2009", "2010–14", "2015–19", "2020–24", "2025~"];

export function columnsOf(axis: AxisId, custom?: CustomAxis | null): string[] {
  if (axis === "level") return [...LEVEL_COLS];
  if (axis === "method") return METHOD_COLS;
  if (axis === "period") return PERIOD_COLS;
  if (axis === "region") return ["국내", "해외"];
  return custom?.categories ?? [];
}

/** 이 논문이 이 축에서 어느 칸(들)에 들어가는지. 학교급은 여러 칸일 수 있다. */
export function valuesOf(item: GapItem, axis: AxisId): string[] {
  if (axis === "level") return item.levels.filter((l) => l !== "해당 없음");
  if (axis === "method") return item.method ? [item.method] : [];
  if (axis === "period") {
    const p = periodOf(item.year);
    return p ? [p] : [];
  }
  if (axis === "region") return [item.ko ? "국내" : "해외"];
  return item.custom ? [item.custom] : [];
}

export interface Matrix {
  cols: string[];
  rows: { name: string; counts: number[] }[];
  max: number;
  /** 빈칸 (소주제 × 칸) */
  gaps: { row: string; col: string }[];
  /** 소주제에 맞지 않거나 이 축에서 분류되지 않아 빠진 논문 수 */
  unplaced: number;
}

/** 소주제 × 축 칸마다 논문 수를 센다 */
export function buildMatrix(items: GapItem[], subtopics: string[], axis: AxisId, custom?: CustomAxis | null): Matrix {
  const cols = columnsOf(axis, custom);
  const rows = subtopics.map((name) => ({ name, counts: cols.map(() => 0) }));
  let unplaced = 0;
  for (const it of items) {
    const r = rows.find((x) => x.name === it.subtopic);
    const vals = valuesOf(it, axis).filter((v) => cols.includes(v));
    if (!r || !vals.length) {
      unplaced++;
      continue;
    }
    for (const v of vals) r.counts[cols.indexOf(v)]++;
  }
  const gaps = rows.flatMap((r) => cols.filter((_, j) => r.counts[j] === 0).map((col) => ({ row: r.name, col })));
  return { cols, rows, max: Math.max(1, ...rows.flatMap((r) => r.counts)), gaps, unplaced };
}

export function itemsIn(items: GapItem[], row: string, col: string, axis: AxisId): GapItem[] {
  return items.filter((it) => it.subtopic === row && valuesOf(it, axis).includes(col));
}

/** 한글·엑셀에 붙여 넣을 표 */
export function matrixTsv(m: Matrix, axisLabel: string): string {
  return [[`소주제 \\ ${axisLabel}`, ...m.cols].join("\t"), ...m.rows.map((r) => [r.name, ...r.counts].join("\t"))].join("\n");
}

export const isKoreanPaper = (title: string, abstract: string | null) => hasHangul(title) || hasHangul(abstract);
