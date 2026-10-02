// 미리보기용 예시 데이터. 실제 논문 서지 정보에 예시 요약을 붙였다 (피인용 수·지표는 대략값).
import type { AlertSearch } from "@/lib/server/alerts";
import type { SearchResult } from "@/app/components/project/useSearch";
import type { ProjectData, ShellData, TableRow } from "@/lib/server/load";
import type { PaperRow } from "@/lib/server/papers";
import type { Field, SummaryData } from "@/lib/types";

const F = (id: string, name: string, color: number, description = ""): Field => ({ id, name, description, color, position: color, hidden: false });
const fields: Field[] = [
  F("edu", "교육학", 0),
  F("et", "교육공학", 1),
  F("ls", "학습과학", 2),
  F("cog", "인지심리", 3),
  F("kor", "국어교육", 4),
  F("eval", "교육평가", 5),
  F("dig", "디지털 평가문항", 6),
];

const paper = (p: Partial<PaperRow> & Pick<PaperRow, "id" | "title" | "authors" | "year">): PaperRow => ({
  doi: null,
  venue: null,
  abstract: null,
  abstract_source: null,
  url: null,
  oa_url: null,
  citations: null,
  impact: {},
  ids: {},
  lang: "en",
  kind: "article",
  sources: ["openalex"],
  ...p,
});

const sum = (s: Partial<SummaryData>): SummaryData => ({
  one_line: "",
  participants: "",
  design: "",
  findings: "",
  implications: "",
  keywords: [],
  study_type: "기타",
  levels: [],
  fields: [],
  suggested_field: "",
  ...s,
});

const row = (p: PaperRow, s: SummaryData | null, fieldIds: string[], subtopicId: string, extra: Partial<TableRow> = {}): TableRow => ({
  paper: p,
  summary: s,
  fieldIds,
  fieldSource: "auto",
  subtopicId,
  addedBy: "나",
  addedAt: "2026-09-20T00:00:00Z",
  status: "todo",
  starred: false,
  notes: [],
  elsewhere: [],
  ...extra,
});

const kintsch = paper({
  id: "p1",
  title: "The role of knowledge in discourse comprehension: A construction-integration model",
  authors: ["Walter Kintsch"],
  year: 1988,
  venue: "Psychological Review",
  doi: "10.1037/0033-295x.95.2.163",
  url: "https://doi.org/10.1037/0033-295x.95.2.163",
  citations: 5000,
  impact: { pct: 99.9, influential: 600 },
});
const clinton = paper({
  id: "p2",
  title: "Reading from paper compared to screens: A systematic review and meta-analysis",
  authors: ["Virginia Clinton"],
  year: 2019,
  venue: "Journal of Research in Reading",
  doi: "10.1111/1467-9817.12269",
  url: "https://doi.org/10.1111/1467-9817.12269",
  citations: 500,
  impact: { pct: 98.1, influential: 30 },
  kind: "review",
});
const delgado = paper({
  id: "p3",
  title: "Don't throw away your printed books: A meta-analysis on the effects of reading media on reading comprehension",
  authors: ["Pablo Delgado", "Cristina Vargas", "Rakefet Ackerman", "Ladislao Salmerón"],
  year: 2018,
  venue: "Educational Research Review",
  doi: "10.1016/j.edurev.2018.09.003",
  url: "https://doi.org/10.1016/j.edurev.2018.09.003",
  citations: 800,
  impact: { pct: 99.6, influential: 55 },
  kind: "review",
});
const sireci = paper({
  id: "p4",
  title: "Innovative item formats in computer-based testing: In pursuit of improved construct representation",
  authors: ["Stephen G. Sireci", "April L. Zenisky"],
  year: 2006,
  venue: "Handbook of Test Development",
  citations: 350,
  impact: { influential: 20 },
  kind: "book-chapter",
});

export const previewProject: ProjectData = {
  project: {
    id: "preview",
    name: "학위논문 · 디지털 읽기 평가",
    research_question: "디지털 기반 국어 읽기 평가에서 매체와 문항 유형은 학생의 읽기 이해 측정에 어떤 영향을 주는가?",
    default_query: "디지털 환경의 읽기 평가와 문항 설계",
    field_ids: ["kor", "eval", "dig"],
    created_by: "me",
  },
  role: "owner",
  meId: "me",
  members: [
    { user_id: "me", role: "owner", name: "나", email: "me@lab.kr" },
    { user_id: "u2", role: "editor", name: "김민지", email: "minji@lab.kr" },
    { user_id: "u3", role: "viewer", name: "박서준", email: "seojun@lab.kr" },
  ],
  invites: [{ email: "haeun@lab.kr", role: "editor" }],
  subtopics: [
    { id: "s1", name: "읽기 이해 이론", position: 0 },
    { id: "s2", name: "매체 효과 (종이 vs 화면)", position: 1 },
    { id: "s3", name: "디지털 문항 유형", position: 2 },
  ],
  fields,
  rows: [
    row(
      kintsch,
      sum({
        one_line: "글 이해는 관련 개념을 폭넓게 떠올린 뒤(구성) 맥락에 맞게 걸러내는(통합) 과정이다.",
        participants: "해당 없음 (이론 모형)",
        design: "이론 모형과 시뮬레이션",
        findings: "명제와 연상을 상향식으로 활성화하고 활성화 확산으로 맥락에 맞지 않는 것을 걸러내는 구성-통합 모형을 제시했다.",
        implications: "읽기 평가에서 텍스트 기반과 상황 모형 수준을 구분하는 이론적 토대.",
        keywords: ["구성-통합 모형", "상황 모형"],
        study_type: "이론·설계",
      }),
      ["cog", "kor"],
      "s1",
      { status: "done", starred: true, notes: [{ id: "n1", body: "문항 분류(텍스트 기반/상황 모형)에 활용", visibility: "shared", user_id: "me", created_at: "2026-09-21" }] },
    ),
    row(
      clinton,
      sum({
        one_line: "화면보다 종이로 읽을 때 이해도와 자기 이해 판단이 약간 더 정확하다.",
        participants: "성인 중심 선행 연구 참여자",
        design: "체계적 문헌고찰 및 메타분석",
        findings: "설명문에서 종이 우위, 서사문에서는 차이 없음. 화면에서 자기 이해를 더 과대평가했다.",
        implications: "디지털 읽기 지도에서 이해 점검(메타인지) 지원이 필요함.",
        study_type: "메타분석·리뷰",
      }),
      ["kor", "cog"],
      "s2",
      { status: "doing", addedBy: "김민지", elsewhere: ["연구실 세미나"] },
    ),
    row(
      delgado,
      sum({
        one_line: "종이 읽기가 화면 읽기보다 이해도가 조금 높고, 이 차이는 최근 연구일수록 커졌다.",
        participants: "2000–2017년 연구 참여자 (초등~성인)",
        design: "메타분석, 시간 제한·글 유형·출판 연도 조절변수 분석",
        findings: "종이 우위(작은 효과). 시간 제한이 있을 때와 설명문에서 차이가 뚜렷했다.",
        implications: "디지털 평가에서 시간 제한과 지문 유형을 정할 때 매체 효과를 고려해야 함.",
        study_type: "메타분석·리뷰",
      }),
      ["kor", "eval"],
      "s2",
    ),
    row(
      sireci,
      sum({
        one_line: "컴퓨터 기반 평가의 새 문항 형식은 측정하려는 능력을 더 잘 담아낼 때 의미가 있다.",
        participants: "해당 없음 (문헌 검토)",
        design: "핸드북 장, 혁신 문항 유형 정리",
        findings: "끌어놓기·핫스팟·순서 배열·시뮬레이션 등 문항 유형을 구인 대표성·채점·개발 비용 측면에서 검토했다.",
        implications: "디지털 문항 유형을 고를 때 기준을 구인 대표성에 둘 것.",
        study_type: "메타분석·리뷰",
      }),
      ["eval", "dig"],
      "s3",
      { addedBy: "김민지" },
    ),
  ],
};

const hit = (p: PaperRow, abstract: string, extra: Partial<SearchResult["results"][number]> = {}): SearchResult["results"][number] => ({
  key: p.doi ? `doi:${p.doi}` : p.id,
  doi: p.doi,
  title: p.title,
  authors: p.authors,
  year: p.year,
  venue: p.venue,
  abstract,
  abstractSource: "openalex",
  citations: p.citations,
  url: p.url,
  oaUrl: p.oa_url,
  lang: p.lang,
  kind: p.kind,
  ids: p.ids,
  sources: ["openalex", "s2"],
  impact: p.impact,
  placements: [],
  ...extra,
});

export const previewResult: SearchResult = {
  searchId: null,
  createdAt: "2026-10-01T00:00:00Z",
  query: "디지털 환경의 읽기 평가와 문항 설계",
  terms: ["디지털 환경의 읽기 평가와 문항 설계", "digital reading assessment", "paper vs. screen reading comprehension", "technology-enhanced items", "컴퓨터 기반 평가 문항"],
  scope: "all",
  totalRaw: 612,
  totalUnique: 388,
  warnings: [],
  saved: false,
  results: [
    hit(
      paper({
        id: "r1",
        title: "Reading linear texts on paper versus computer screen: Effects on reading comprehension",
        authors: ["Anne Mangen", "Bente R. Walgermo", "Kolbjørn Brønnick"],
        year: 2013,
        venue: "International Journal of Educational Research",
        doi: "10.1016/j.ijer.2012.12.002",
        url: "https://doi.org/10.1016/j.ijer.2012.12.002",
        citations: 900,
        impact: { pct: 99.2, influential: 60 },
      }),
      "Tenth graders read narrative and expository texts either in print or as PDF files on a computer screen, then completed comprehension tests. Students who read on paper scored better than those who read on screen.",
      { sources: ["openalex", "s2", "eric"], eduLevel: ["Secondary Education"] },
    ),
    hit(delgado, "A meta-analysis comparing comprehension of texts read on paper and on digital screens, with moderators such as time frame and text genre.", {
      placements: [{ projectId: "preview", projectName: "학위논문 · 디지털 읽기 평가", subtopic: "매체 효과 (종이 vs 화면)", paperId: "p3" }],
    }),
    hit(
      paper({
        id: "r3",
        title: "디지털 기반 국어 읽기 평가에서 기술 강화 문항 유형의 타당도 검토 (예시 국문 논문)",
        authors: ["김 민지", "이 하나"],
        year: 2025,
        venue: "교육평가연구 (예시)",
        lang: "ko",
        citations: 2,
      }),
      "(예시 초록) 이 연구는 중학생을 대상으로 디지털 기반 읽기 평가에서 기술 강화 문항 유형별 응답 자료를 분석하여 타당도 근거를 검토하였다.",
      { sources: ["crossref"] },
    ),
    hit(
      paper({
        id: "r4",
        title: "Using automatic item generation to create multiple-choice test items",
        authors: ["Mark J. Gierl", "Hollis Lai", "Simon R. Turner"],
        year: 2012,
        venue: "Medical Education",
        citations: 250,
        impact: { pct: 95.4, influential: 15 },
      }),
      "A three-step method for automatic item generation using cognitive models and item models, illustrated in medical education.",
      { placements: [{ projectId: "x", projectName: "학회 발표 · LLM 문항 생성", subtopic: null, paperId: "r4" }] },
    ),
    hit(sireci, "", { abstract: null, sources: ["openalex"] }),
  ],
};

export const previewShell: ShellData = {
  me: { id: "me", name: "나", email: "me@lab.kr" },
  projects: [
    { id: "preview", name: "학위논문 · 디지털 읽기 평가", count: 4, members: 3, shared: false },
    { id: "x", name: "학회 발표 · LLM 문항 생성", count: 2, members: 1, shared: false },
    { id: "y", name: "연구실 세미나 · 디지털 읽기 교육", count: 3, members: 4, shared: true },
  ],
  lib: { all: 9, todo: 5, recent: 4, star: 2 },
  fields: fields.map((f, i) => ({ ...f, count: [2, 1, 1, 3, 4, 3, 2][i] })),
  monthUsage: 1.12,
  alerts: 3,
};

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

export const previewAlerts: AlertSearch[] = [
  {
    id: "s1",
    projectId: "preview",
    projectName: "학위논문 · 디지털 읽기 평가",
    query: "paper vs. screen reading",
    checkedAt: day(2),
    createdAt: day(40),
    canEdit: true,
    readAt: day(10),
    hits: previewResult.results.slice(0, 3).map((paper, i) => ({ id: `h${i}`, paper: { ...paper, year: 2026 }, foundAt: day(2) })),
  },
  {
    id: "s2",
    projectId: "x",
    projectName: "학회 발표 · LLM 문항 생성",
    query: "LLM item generation",
    checkedAt: null,
    createdAt: day(3),
    canEdit: false,
    readAt: null,
    hits: [],
  },
];
