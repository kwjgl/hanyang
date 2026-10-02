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

export const GapSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      subtopic: z.string().describe("소주제 목록의 이름 그대로, 맞는 것이 없으면 '해당 없음'"),
      // 목록 밖 값이 하나 섞여도 묶음 전체가 실패하지 않도록 글자로 받고, 서버에서 목록에 있는 것만 남긴다
      levels: z.array(z.string()).describe(`대상 학교급: ${LEVELS.join(", ")} 중에서`),
      method: z.string().describe(`연구 방법: ${STUDY_TYPES.join(", ")} 중 하나`),
      custom: z.string().describe("직접 정의 축의 범주 이름 그대로, 축이 없거나 맞는 것이 없으면 빈 문자열"),
    }),
  ),
});
export type GapResult = z.infer<typeof GapSchema>;
