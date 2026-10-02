export type SourceId = "openalex" | "s2" | "eric" | "crossref";
export type Scope = "all" | "ko" | "intl";

export const SOURCE_LABEL: Record<SourceId, string> = {
  openalex: "OpenAlex",
  s2: "Semantic Scholar",
  eric: "ERIC",
  crossref: "Crossref",
};

export interface Impact {
  /** 같은 분야·같은 해 논문 중 피인용 백분위 (0–100). OpenAlex */
  pct?: number | null;
  fwci?: number | null;
  /** 본문에서 실질적으로 활용된 인용 수. Semantic Scholar */
  influential?: number | null;
}

/** 검색 결과 한 건. 여러 출처에서 온 같은 논문은 하나로 합쳐진다. */
export interface Candidate {
  key: string;
  doi: string | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  abstractSource: string | null;
  citations: number | null;
  url: string | null;
  oaUrl: string | null;
  lang: string | null;
  /** article, review, book-chapter, dissertation, report, preprint ... */
  kind: string | null;
  ids: Partial<Record<SourceId, string>>;
  sources: SourceId[];
  impact: Impact;
  eduLevel?: string[];
  score?: number;
  /** 연구실 분야(교육·심리·언어)인지: "in" · "out" · 모름(null) */
  domain?: "in" | "out" | null;
}

/** 한 번의 검색 호출 결과: 이번 페이지 논문과, 검색어에 맞는 전체 건수 */
export interface SearchPage {
  items: Candidate[];
  total: number | null;
}

export type StudyType = "실험·준실험" | "조사·상관" | "질적" | "혼합" | "메타분석·리뷰" | "이론·설계" | "기타";

export interface SummaryData {
  one_line: string;
  participants: string;
  design: string;
  findings: string;
  implications: string;
  keywords: string[];
  study_type: StudyType;
  levels: string[];
  /** 분류된 분야 이름 (요약 당시 목록 기준) */
  fields: string[];
  suggested_field: string;
}

export type ProjectRole = "owner" | "editor" | "viewer";
export type ReadStatus = "todo" | "doing" | "done";

export interface Field {
  id: string;
  name: string;
  description: string;
  color: number;
  position: number;
  hidden: boolean;
}
