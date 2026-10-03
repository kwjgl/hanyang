import { LEVELS, STUDY_TYPES } from "@/lib/claude/schemas";
import type { DetailResult } from "@/lib/claude/schemas";
import { locateQuote, sanitizeText } from "@/lib/pdf-text";
import type { StudyType, SummaryData } from "@/lib/types";

/** 근거 쪽이 붙은 한 항목 */
export interface Cited {
  text: string;
  pages: number[];
}

/** PDF 본문으로 만든 선행연구 분석표 항목 (paper_fulltexts.details) */
export interface PaperDetails {
  one_line: string;
  purpose: Cited;
  questions: string[];
  participants: Cited & { n: number | null; levels: string[] };
  design: Cited & { type: StudyType | null };
  instruments: { name: string; measures: string; reliability: string; pages: number[] }[];
  variables: { independent: string[]; dependent: string[]; other: string[] };
  analysis: Cited;
  findings: (Cited & { stats: string })[];
  implications: string;
  limitations: Cited[];
  future: Cited[];
  /** 원문에서 글자 그대로 찾은 인용문만 */
  quotes: Cited[];
  keywords: string[];
  /** 분석한 범위와 쪽 번호 종류 */
  range: { from: number; to: number; truncated: boolean };
  /** print: 학술지에 인쇄된 쪽 번호, pdf: PDF 쪽 번호 */
  pageMode: "print" | "pdf";
}

const clean = (s: string | undefined | null) => sanitizeText(s ?? "").replace(/\s+/g, " ").trim();
const list = (xs: string[] | undefined) => [...new Set((xs ?? []).map(clean).filter(Boolean))];

/**
 * AI가 낸 분석 결과를 정리한다.
 * - 쪽 번호는 실제 있는 쪽만 남긴다
 * - 학교급·연구 방법은 정해진 목록에 있는 값만
 * - 인용문은 원문에서 글자 그대로 찾은 것만, 쪽 번호도 실제 찾은 쪽으로 고친다
 */
export function cleanDetails(
  r: DetailResult,
  ctx: { pages: string[]; offset: number | null; range: { from: number; to: number; truncated: boolean } },
): PaperDetails {
  const first = 1 + (ctx.offset ?? 0);
  const last = ctx.pages.length + (ctx.offset ?? 0);
  const pg = (ps: number[] | undefined) => [...new Set((ps ?? []).map(Math.round).filter((p) => p >= first && p <= last))].sort((a, b) => a - b).slice(0, 4);
  const cited = (c: { text: string; pages: number[] } | undefined): Cited => ({ text: clean(c?.text), pages: c && clean(c.text) ? pg(c.pages) : [] });
  const citedList = (xs: { text: string; pages: number[] }[] | undefined) => (xs ?? []).map(cited).filter((c) => c.text);

  const type = clean(r.design?.type);
  const quotes: Cited[] = [];
  for (const q of r.quotes ?? []) {
    const text = clean(q.text).replace(/^["“'‘]|["”'’]$/g, "");
    const at = locateQuote(text, ctx.pages, ctx.offset);
    if (at != null && !quotes.some((x) => x.text === text)) quotes.push({ text, pages: [at] });
  }
  return {
    one_line: clean(r.one_line),
    purpose: cited(r.purpose),
    questions: list(r.questions),
    participants: {
      text: clean(r.participants?.text),
      n: r.participants?.n && r.participants.n > 0 ? Math.round(r.participants.n) : null,
      levels: list(r.participants?.levels).filter((l) => (LEVELS as readonly string[]).includes(l)),
      pages: pg(r.participants?.pages),
    },
    design: { type: (STUDY_TYPES as readonly string[]).includes(type) ? (type as StudyType) : null, text: clean(r.design?.text), pages: pg(r.design?.pages) },
    instruments: (r.instruments ?? [])
      .map((i) => ({ name: clean(i.name), measures: clean(i.measures), reliability: clean(i.reliability), pages: pg(i.pages) }))
      .filter((i) => i.name),
    variables: { independent: list(r.variables?.independent), dependent: list(r.variables?.dependent), other: list(r.variables?.other) },
    analysis: cited(r.analysis),
    findings: (r.findings ?? []).map((f) => ({ ...cited(f), stats: clean(f.stats) })).filter((f) => f.text),
    implications: clean(r.implications),
    limitations: citedList(r.limitations),
    future: citedList(r.future),
    quotes,
    keywords: list(r.keywords).slice(0, 8),
    range: ctx.range,
    pageMode: ctx.offset != null ? "print" : "pdf",
  };
}

/** 쪽 표시 ("p. 12", "pp. 12–13") */
export function pagesLabel(pages: number[], mode: PaperDetails["pageMode"] = "print"): string {
  if (!pages.length) return "";
  const pre = mode === "pdf" ? "PDF " : "";
  if (pages.length === 1) return `${pre}p. ${pages[0]}`;
  const contiguous = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  return contiguous ? `${pre}pp. ${pages[0]}–${pages[pages.length - 1]}` : `${pre}pp. ${pages.join(", ")}`;
}

/** 요약이 없는 논문(국내 PDF 등)은 분석 결과로 요약을 채워, 대시보드·공백 지도에서도 쓰이게 한다 */
export function summaryFromDetails(d: PaperDetails, fields: string[]): SummaryData {
  return {
    one_line: d.one_line,
    participants: d.participants.text,
    design: d.design.text,
    findings: d.findings.map((f) => f.text + (f.stats ? ` (${f.stats})` : "")).join(" "),
    implications: d.implications,
    keywords: d.keywords,
    study_type: d.design.type ?? "기타",
    levels: d.participants.levels.length ? d.participants.levels : ["해당 없음"],
    fields,
    suggested_field: "",
  };
}
