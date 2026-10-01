import * as z from "zod/v4";

export const STUDY_TYPES = ["실험·준실험", "조사·상관", "질적", "혼합", "메타분석·리뷰", "이론·설계", "기타"] as const;
export const LEVELS = ["유아", "초등", "중등", "고등", "대학·성인", "교사", "해당 없음"] as const;

export const ExpandSchema = z.object({
  terms_en: z.array(z.string()).describe("영어 학술 검색어 3~5개"),
  terms_ko: z.array(z.string()).describe("한국어 학술 검색어 1~3개"),
});
export type ExpandResult = z.infer<typeof ExpandSchema>;

export const SummarySchema = z.object({
  one_line: z.string(),
  participants: z.string(),
  design: z.string(),
  findings: z.string(),
  implications: z.string(),
  keywords: z.array(z.string()),
  study_type: z.enum(STUDY_TYPES),
  levels: z.array(z.enum(LEVELS)),
  fields: z.array(z.string()),
  suggested_field: z.string(),
});
export type SummaryResult = z.infer<typeof SummarySchema>;

export const ClassifySchema = z.object({
  fields: z.array(z.string()),
  suggested_field: z.string(),
});
export type ClassifyResult = z.infer<typeof ClassifySchema>;
