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

/** 글에서 근거(인용)가 필요한 문장 찾기 */
export const CiteClaimsSchema = z.object({
  claims: z.array(
    z.object({
      sentence: z.string().describe("글에 있는 문장을 한 글자도 바꾸지 않고 그대로"),
      claim: z.string().describe("이 문장이 하는 주장을 짧게"),
      query_en: z.string().describe("이 주장을 뒷받침할 논문을 찾는 영어 학술 검색어 (2~6단어)"),
      query_ko: z.string().describe("같은 뜻의 한국어 검색어, 필요 없으면 빈 문자열"),
      classic: z.boolean().describe("이론·정의·개념처럼 대표 문헌(고전)을 인용해야 하는 주장이면 true"),
    }),
  ),
});
export type CiteClaims = z.infer<typeof CiteClaimsSchema>;

/** 후보 논문 중 주장마다 어울리는 문헌 고르기 (후보 밖의 논문은 고를 수 없다) */
export const CitePickSchema = z.object({
  picks: z.array(
    z.object({
      claim: z.number().describe("주장 번호"),
      id: z.string().describe("후보 번호 그대로"),
      reason: z.string().describe("이 논문이 그 주장을 뒷받침하는 이유 한 문장 (초록 내용 근거)"),
      fit: z.string().describe("'직접' (주장을 직접 뒷받침) 또는 '관련' (배경·관련 근거)"),
    }),
  ),
});
export type CitePicks = z.infer<typeof CitePickSchema>;

/** 주제 상담 한 번의 답. 문헌은 이름만 대고, 실제 존재는 서버가 데이터베이스에서 확인한다 */
export const ConsultSchema = z.object({
  reply: z.string().describe("연구자에게 하는 답 (한국어, 상담하듯)"),
  theories: z
    .array(
      z.object({
        name: z.string().describe("이론·모형·개념 이름 (원어 병기)"),
        summary: z.string().describe("핵심 내용 1~2문장"),
        fit: z.string().describe("연구자의 주제에 어떻게 쓸 수 있는지 1~2문장"),
        works: z
          .array(
            z.object({
              author: z.string().describe("첫 저자 성 (한국인은 이름 전체)"),
              year: z.number().describe("출판 연도, 모르면 0"),
              title: z.string().describe("정확한 원제목 (번역하지 않는다)"),
            }),
          )
          .describe("이 이론을 처음 제시했거나 가장 대표적인 문헌 1~3편. 확실한 것만"),
        query_en: z.string().describe("이 이론으로 관련 연구를 찾을 영어 검색어"),
        query_ko: z.string().describe("한국어 검색어, 필요 없으면 빈 문자열"),
      }),
    )
    .describe("이번 답에서 새로 권하는 이론적 배경 0~4개"),
  questions: z.array(z.string()).describe("연구자가 더 생각해 볼 질문 0~3개"),
});
export type ConsultResult = z.infer<typeof ConsultSchema>;

/** 상담 내용을 이론적 배경 개요로. 문헌은 확인된 목록의 번호로만 단다 */
export const OutlineSchema = z.object({
  title: z.string().describe("개요 제목"),
  sections: z.array(
    z.object({
      heading: z.string(),
      points: z.array(
        z.object({
          text: z.string().describe("연구자가 풀어 쓸 한 문장 메모"),
          ids: z.array(z.number()).describe("근거로 달 문헌 번호 (목록에 있는 번호만), 없으면 빈 배열"),
        }),
      ),
    }),
  ),
});
export type OutlineResult = z.infer<typeof OutlineSchema>;

const cited = z.object({ text: z.string(), pages: z.array(z.number()).describe("근거 쪽 번호 ([p.N] 표시의 N)") });

/** PDF 본문으로 만드는 선행연구 분석표 항목. 목록 밖 값이 섞여도 실패하지 않도록 글자로 받고 서버에서 거른다 */
export const DetailSchema = z.object({
  one_line: z.string().describe("이 연구를 한 문장으로"),
  purpose: cited.describe("연구 목적"),
  questions: z.array(z.string()).describe("연구 문제 (논문에 적힌 대로, 없으면 빈 배열)"),
  participants: z.object({
    text: z.string().describe("대상과 인원 (예: 중학교 2학년 312명, 4개 학교)"),
    n: z.number().describe("전체 인원 수, 모르거나 해당 없으면 0"),
    levels: z.array(z.string()).describe(`대상 학교급: ${LEVELS.join(", ")} 중에서`),
    pages: z.array(z.number()),
  }),
  design: z.object({
    type: z.string().describe(`연구 방법: ${STUDY_TYPES.join(", ")} 중 하나`),
    text: z.string().describe("설계와 절차 요약 (집단, 처치, 기간 등)"),
    pages: z.array(z.number()),
  }),
  instruments: z
    .array(z.object({ name: z.string(), measures: z.string().describe("무엇을 재는지"), reliability: z.string().describe("신뢰도·타당도 보고 (예: Cronbach α=.87), 없으면 빈 문자열"), pages: z.array(z.number()) }))
    .describe("측정 도구·검사·설문 (없으면 빈 배열)"),
  variables: z.object({ independent: z.array(z.string()), dependent: z.array(z.string()), other: z.array(z.string()).describe("통제·조절·매개 변인") }),
  analysis: cited.describe("자료 분석 방법"),
  findings: z.array(cited.extend({ stats: z.string().describe("효과크기·통계치 (예: d=0.42, p<.01), 없으면 빈 문자열") })).describe("주요 결과 2~6개"),
  implications: z.string().describe("시사점 요약"),
  limitations: z.array(cited).describe("저자가 밝힌 연구의 한계 (논문에 있는 것만)"),
  future: z.array(cited).describe("저자가 제안한 후속 연구 (논문에 있는 것만)"),
  quotes: z.array(cited).describe("인용할 만한 핵심 문장 2~4개. 본문 문장을 한 글자도 바꾸지 않고 그대로"),
  keywords: z.array(z.string()),
  fields: z.array(z.string()).describe("분야 목록 중 해당하는 것"),
});
export type DetailResult = z.infer<typeof DetailSchema>;

/** PDF 첫 쪽에서 서지 정보 읽기 */
export const PdfMetaSchema = z.object({
  title: z.string().describe("논문 제목 (원문 그대로, 부제 포함)"),
  authors: z.array(z.string()).describe("저자 이름 (원문 표기 그대로, 순서대로)"),
  year: z.number().describe("출판 연도, 모르면 0"),
  venue: z.string().describe("학술지·학회·대학 이름, 모르면 빈 문자열"),
  kind: z.string().describe("'article'(학술지 논문), 'dissertation'(학위논문), 'report', 'book-chapter' 중 하나"),
  abstract: z.string().describe("초록 (본문에 있는 그대로 옮긴다. 국문·영문 초록이 모두 있으면 국문), 없으면 빈 문자열"),
});
export type PdfMeta = z.infer<typeof PdfMetaSchema>;
