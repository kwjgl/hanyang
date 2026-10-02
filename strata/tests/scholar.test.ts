// 구글 학술검색(SerpApi): 요약 줄 읽기, 결과 읽기, 요청 모양, 검색 계획, 구글 순서 반영을 검증한다.
// 요약 줄 예시는 실제 구글 학술검색 화면(“assessment for learning”, “디지털 읽기 평가”)에서 옮겼다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeAndRank } from "@/lib/search/merge";
import { rerank } from "@/lib/search/rank";
import { planTasks } from "@/lib/search/run";
import { parseScholarResult, parseSummary, searchScholar } from "@/lib/sources/scholar";
import type { Candidate } from "@/lib/types";

describe("요약 줄 읽기", () => {
  it("저자 - 학술지, 연도 - 출판사", () => {
    expect(parseSummary("LH Schellekens, HGJ Bok, LH De Jong… - Studies in Educational …, 2021 - Elsevier")).toEqual({
      authors: ["LH Schellekens", "HGJ Bok", "LH De Jong"],
      venue: "Studies in Educational",
      year: 2021,
    });
  });
  it("학술지 없이 연도만", () => {
    expect(parseSummary("R Berry - 2008 - books.google.com")).toEqual({ authors: ["R Berry"], venue: null, year: 2008 });
  });
  it("한국어 논문", () => {
    expect(parseSummary("옥현진 - 새국어교육, 2013 - scholar.kyobobook.co.kr")).toEqual({ authors: ["옥현진"], venue: "새국어교육", year: 2013 });
  });
});

describe("결과 읽기", () => {
  it("발췌는 초록이 아니라 따로 두고, 피인용·PDF·구글 순위를 읽는다", () => {
    const c = parseScholarResult(
      {
        position: 0,
        title: "What is assessment for learning?",
        result_id: "abc",
        link: "https://www.sciencedirect.com/science/article/pii/S0191491X11000149",
        snippet: "… adverse impact of assessment on learning …",
        publication_info: { summary: "D Wiliam - Studies in educational evaluation, 2011 - Elsevier", authors: [{ name: "D Wiliam" }] },
        inline_links: { cited_by: { total: 2973 } },
        resources: [{ title: "sciencedirect.com", file_format: "HTML", link: "x" }],
      },
      1,
    )!;
    expect(c.abstract).toBeNull();
    expect(c.snippet).toContain("adverse impact");
    expect(c.citations).toBe(2973);
    expect(c.year).toBe(2011);
    expect(c.venue).toBe("Studies in educational evaluation");
    expect(c.gsRank).toBe(1);
    expect(c.oaUrl).toBeNull();
    expect(c.sources).toEqual(["scholar"]);
  });

  it("링크에 DOI가 있으면 읽고, 두 번째 페이지 순위는 21부터", () => {
    const c = parseScholarResult({ position: 0, title: "[PDF] Rethinking assessment", link: "https://onlinelibrary.wiley.com/doi/abs/10.1002/berj.3215", resources: [{ file_format: "PDF", link: "p.pdf" }] }, 2)!;
    expect(c.title).toBe("Rethinking assessment");
    expect(c.doi).toBe("10.1002/berj.3215");
    expect(c.oaUrl).toBe("p.pdf");
    expect(c.gsRank).toBe(21);
  });
});

describe("요청과 계획", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("한국어 화면·20편·페이지·연도 범위를 보내고, 결과 없음은 오류가 아니다", async () => {
    vi.stubEnv("SERPAPI_KEY", "k");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify(urls.length === 1 ? { organic_results: [{ position: 0, title: "A" }], search_information: { total_results: 5470000 } } : { error: "Google hasn't returned any results for this query." }));
      }),
    );
    const r = await searchScholar("digital assessment", { page: 2, yearFrom: 2020 });
    const u = new URL(urls[0]);
    expect(u.searchParams.get("engine")).toBe("google_scholar");
    expect(u.searchParams.get("hl")).toBe("ko");
    expect(u.searchParams.get("num")).toBe("20");
    expect(u.searchParams.get("start")).toBe("20");
    expect(u.searchParams.get("as_ylo")).toBe("2020");
    expect(r.total).toBe(5470000);
    expect((await searchScholar("zzz")).items).toEqual([]);
  });

  it("횟수를 아끼려고 사용자가 친 검색어 하나만 구글에 묻는다 (키가 있을 때만)", () => {
    vi.stubEnv("SERPAPI_KEY", "k");
    const tasks = planTasks({ terms: ["디지털 읽기 평가", "digital reading assessment"], sources: ["scholar", "openalex"], scope: "all" });
    expect(tasks.filter((t) => t.source === "scholar").map((t) => t.term)).toEqual(["디지털 읽기 평가"]);
    vi.stubEnv("SERPAPI_KEY", "");
    expect(planTasks({ terms: ["x y"], sources: ["scholar"], scope: "all" })).toEqual([]);
  });
});

describe("구글 순서 반영", () => {
  const c = (title: string, over: Partial<Candidate> = {}): Candidate => ({
    key: `t:${title}`,
    doi: null,
    title,
    authors: [],
    year: 2018,
    venue: null,
    abstract: null,
    abstractSource: null,
    citations: 10,
    url: null,
    oaUrl: null,
    lang: "en",
    kind: "article",
    ids: {},
    sources: ["openalex"],
    impact: {},
    ...over,
  });

  it("구글 상위 논문이 구글 순서대로 맨 위에 온다 (같은 논문은 합쳐서 순위를 지킨다)", () => {
    const terms = ["digital assessment"];
    const g = (title: string, rank: number) => c(title, { sources: ["scholar"], gsRank: rank, citations: 500 });
    const lists = [
      { source: "scholar" as const, term: terms[0], weight: 1.5, items: [g("Rethinking assessment in a digital age", 1), g("Designing assessment in a digital world", 2), g("Blended e-assessment", 3)] },
      {
        source: "openalex" as const,
        term: terms[0],
        weight: 1,
        items: [
          c("Exploring teachers' digital assessment practices", { citations: 39, year: 2024 }),
          c("Developing a digital assessment in physical education"),
          c("Rethinking assessment in a digital age", { citations: 265, year: 2015 }),
        ],
      },
    ];
    const out = rerank(mergeAndRank(lists), terms, 2026).map((x) => x.title);
    expect(out.slice(0, 3)).toEqual(["Rethinking assessment in a digital age", "Designing assessment in a digital world", "Blended e-assessment"]);
  });
});

describe("요약 전 초록 채우기", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("DOI 없는 구글 결과는 제목이 같은 OpenAlex 논문에서 DOI·초록을 가져온다", async () => {
    const { ensureAbstract } = await import("@/lib/sources/lookup");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              { id: "https://openalex.org/W9", display_name: "Other paper", publication_year: 2013 },
              {
                id: "https://openalex.org/W1",
                doi: "https://doi.org/10.1234/x",
                display_name: "디지털 텍스트 읽기 능력과 디지털 텍스트 읽기 평가에 대한 일고찰",
                publication_year: 2013,
                abstract_inverted_index: { 디지털: [0], 기술의: [1], 발달로: [2], 인해: [3], 읽기: [4], 능력의: [5], 중요성이: [6], 커졌다: [7], 이에: [8], 하위: [9], 요소를: [10], 검토하였다: [11], 또한: [12], 기존: [13], 평가도구의: [14], 특징을: [15], 살펴보고: [16], 개선할: [17], 부분을: [18], 점검하였다: [19] },
              },
            ],
          }),
        ),
      ),
    );
    const base = parseScholarResult({ position: 0, title: "디지털 텍스트 읽기 능력과 디지털 텍스트 읽기 평가에 대한 일고찰", publication_info: { summary: "옥현진 - 새국어교육, 2013 - scholar.kyobobook.co.kr" } })!;
    const out = await ensureAbstract(base);
    expect(out.doi).toBe("10.1234/x");
    expect(out.abstract).toContain("디지털 기술의 발달로");
    expect(out.ids.openalex).toBe("W1");
    expect(out.authors).toEqual(["옥현진"]);
  });
});

describe("구글 연동 후 실제 비교 (디지털 읽기 평가)", () => {
  const k = (title: string, over: Partial<Candidate> = {}): Candidate => ({
    key: `t:${title}`,
    doi: null,
    title,
    authors: [],
    year: 2013,
    venue: null,
    abstract: null,
    abstractSource: null,
    citations: 0,
    url: null,
    oaUrl: null,
    lang: null,
    kind: "article",
    ids: {},
    sources: ["openalex"],
    impact: {},
    ...over,
  });
  const terms = ["디지털 읽기 평가"];

  it("구글 상위 10편은 다른 출처에 함께 있어도 구글 순서 그대로", () => {
    const g = (t: string, r: number, year = 2013) => k(t, { sources: ["scholar"], gsRank: r, year });
    const lists = [
      {
        source: "scholar" as const,
        term: terms[0],
        weight: 1.5,
        items: [
          g("디지털 텍스트 읽기 능력과 디지털 텍스트 읽기 평가에 대한 일고찰", 1),
          g("자동문항생성 기법을 활용한 읽기 평가 개발에 대한 시론", 2, 2022),
          g("디지털 시대의 읽기 능력", 3, 2012),
          g("PISA 2018 에 나타난 한국 학생들의 디지털 기기 활용 경향과 읽기 성취의 특성", 4, 2021),
          g("국가수준 학업성취도 평가와 PISA 2009 (PRA 와 DRA) 연계를 통한 우리나라 학생들의 읽기 성취 특성 분석", 5),
        ],
      },
      {
        source: "openalex" as const,
        term: terms[0],
        weight: 1,
        items: [
          k("국가수준 학업성취도 평가와 PISA 2009(PRA와 DRA) 연계를 통한 우리나라 학생들의 읽기 성취 특성 분석", { abstract: "인쇄매체 읽기 평가(PRA)와 디지털 읽기 평가(DRA)의 결과를 둘 다 활용하여", citations: 2 }),
          k("국어교육학 : 디지털 텍스트 읽기 능력과 디지털 텍스트 읽기 평가에 대한 일고찰", { abstract: "디지털 읽기 평가(Digital Reading Assessment)와 온라인 읽기 이해 평가" }),
        ],
      },
    ];
    const out = rerank(mergeAndRank(lists), terms, 2026);
    expect(out.map((x) => x.gsRank)).toEqual([1, 2, 3, 4, 5]);
    // 앞에 "국어교육학 : "이 붙은 같은 논문은 하나로 합쳐지고 초록을 얻는다
    expect(out[0].abstract).toContain("Digital Reading Assessment");
  });

  it("영문 제목에 초록에서 흔한 낱말만 겹치는 무관한 국내 논문은, 제목이 맞는 국문 논문보다 아래", () => {
    const out = rerank(
      [
        k("A Study on Cloud Network and Security System Analysis for Enhanced Security of Legislative Authority", { score: 0.02, citations: 5, abstract: "국회사무처의 정보보호컨설팅 결과 매우 낮게 평가 되었으며 보안평가기준에 따라 분석" }),
        k("마킹 기능이 컴퓨터기반 읽기 평가의 결과 및 수험자의 인식에 미치는 영향", { score: 0.012, year: 2014, abstract: "컴퓨터 기반 읽기 평가의 타당도를 연구한 선행 연구에서 디지털 잉크 기능을 활용하여" }),
      ],
      terms,
      2026,
    );
    expect(out[0].title).toMatch(/^마킹 기능/);
  });

  it("두 칸짜리 요약 줄의 사이트 주소는 학술지로 보지 않는다", () => {
    expect(parseSummary("허은서, 이형민 - dbpia.co.kr")).toEqual({ authors: ["허은서", "이형민"], venue: null, year: null });
  });
});
