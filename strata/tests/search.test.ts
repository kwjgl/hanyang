// 출처별 응답 파서, 중복 합치기, 검색 계획을 검증한다.
// 응답 예시는 각 API 문서에 나온 형태를 줄여 옮긴 것이다.
import { describe, expect, it } from "vitest";
import { tierLabel, tierOf } from "@/lib/impact";
import { koreanSearchLinks } from "@/lib/korean-links";
import { mergeAndRank } from "@/lib/search/merge";
import { applyScope, planTasks } from "@/lib/search/run";
import { parseCrossrefItem } from "@/lib/sources/crossref";
import { parseEricDoc } from "@/lib/sources/eric";
import { parseOpenAlexWork } from "@/lib/sources/openalex";
import { parseS2Paper } from "@/lib/sources/semanticscholar";
import { hasHangul, normalizeDoi, reconstructAbstract, stripTags, titleKey } from "@/lib/text";
import type { Candidate } from "@/lib/types";

const openAlexWork = {
  id: "https://openalex.org/W2000000001",
  doi: "https://doi.org/10.1016/J.IJER.2012.12.002",
  display_name: "Reading linear texts on paper versus computer screen: Effects on reading comprehension",
  publication_year: 2013,
  authorships: [{ author: { display_name: "Anne Mangen" } }, { author: { display_name: "Bente R. Walgermo" } }],
  primary_location: { landing_page_url: "https://example.org/x", source: { display_name: "International Journal of Educational Research" } },
  cited_by_count: 900,
  open_access: { oa_url: null },
  abstract_inverted_index: { Tenth: [0], graders: [1], read: [2], texts: [3] },
  language: "en",
  type: "article",
  citation_normalized_percentile: { value: 0.992, is_in_top_1_percent: true, is_in_top_10_percent: true },
  fwci: 9.8,
};

const s2Paper = {
  paperId: "abc123",
  title: "Reading linear texts on paper versus computer screen: effects on reading comprehension",
  authors: [{ name: "A. Mangen" }],
  year: 2013,
  venue: "International Journal of Educational Research",
  abstract: "Tenth graders read narrative and expository texts either in print or as PDF files on a computer screen, then completed comprehension tests.",
  citationCount: 950,
  influentialCitationCount: 60,
  externalIds: { DOI: "10.1016/j.ijer.2012.12.002", MAG: "1" },
  openAccessPdf: null,
  url: "https://www.semanticscholar.org/paper/abc123",
  publicationTypes: ["JournalArticle"],
};

const ericDoc = {
  id: "EJ1000001",
  title: "Technology-Enhanced Items in Reading Assessment",
  author: ["Kim, Minji", "Lee, Hana"],
  source: "Applied Measurement in Education",
  publicationdateyear: 2021,
  description: "This study examines technology-enhanced items in a digital reading assessment for middle school students.",
  peerreviewed: "T",
  educationlevel: ["Middle Schools", "Secondary Education"],
  url: "http://dx.doi.org/10.1080/08957347.2021.0000001",
  e_fulltextauth: 0,
  publicationtype: ["Journal Articles", "Reports - Research"],
};

const crossrefItem = {
  DOI: "10.17086/TEST.2024.1.1",
  title: ["디지털 기반 읽기 평가에서 기술 강화 문항의 타당도"],
  author: [{ given: "민지", family: "김" }],
  issued: { "date-parts": [[2024, 3]] },
  "container-title": ["교육평가연구"],
  abstract: "<jats:p>이 연구는 중학생을 대상으로 <jats:italic>기술 강화 문항</jats:italic>의 타당도를 검토하였다.</jats:p>",
  "is-referenced-by-count": 3,
  URL: "https://doi.org/10.17086/test.2024.1.1",
  language: "ko",
  type: "journal-article",
};

describe("text helpers", () => {
  it("normalizes DOIs from many shapes", () => {
    expect(normalizeDoi("https://doi.org/10.1016/J.IJER.2012.12.002")).toBe("10.1016/j.ijer.2012.12.002");
    expect(normalizeDoi("doi: 10.1037/0033-295X.95.2.163.")).toBe("10.1037/0033-295x.95.2.163");
    expect(normalizeDoi("no doi here")).toBeNull();
  });
  it("rebuilds OpenAlex abstracts in word order", () => {
    expect(reconstructAbstract({ world: [1], hello: [0] })).toBe("hello world");
  });
  it("strips JATS markup", () => {
    expect(stripTags("<jats:p>A <jats:italic>b</jats:italic> &amp; c</jats:p>")).toBe("A b & c");
  });
  it("detects Hangul and builds comparable title keys", () => {
    expect(hasHangul("읽기 평가")).toBe(true);
    expect(hasHangul("reading")).toBe(false);
    expect(titleKey("Reading: Effects on <i>Comprehension</i>!")).toBe(titleKey("reading effects on comprehension"));
  });
});

describe("source parsers", () => {
  it("parses OpenAlex works with percentile in 0–100", () => {
    const c = parseOpenAlexWork(openAlexWork)!;
    expect(c.doi).toBe("10.1016/j.ijer.2012.12.002");
    expect(c.ids.openalex).toBe("W2000000001");
    expect(c.abstract).toBe("Tenth graders read texts");
    expect(c.impact.pct).toBe(99.2);
    expect(c.venue).toBe("International Journal of Educational Research");
  });
  it("parses Semantic Scholar papers", () => {
    const c = parseS2Paper(s2Paper)!;
    expect(c.doi).toBe("10.1016/j.ijer.2012.12.002");
    expect(c.impact.influential).toBe(60);
  });
  it("parses ERIC docs, flipping author names and reading the DOI from the URL", () => {
    const c = parseEricDoc(ericDoc)!;
    expect(c.authors).toEqual(["Minji Kim", "Hana Lee"]);
    expect(c.doi).toBe("10.1080/08957347.2021.0000001");
    expect(c.eduLevel).toContain("Middle Schools");
    expect(c.kind).toBe("article");
  });
  it("parses Crossref items with Korean titles and JATS abstracts", () => {
    const c = parseCrossrefItem(crossrefItem)!;
    expect(c.title).toBe("디지털 기반 읽기 평가에서 기술 강화 문항의 타당도");
    expect(c.authors).toEqual(["민지 김"]);
    expect(c.abstract).toBe("이 연구는 중학생을 대상으로 기술 강화 문항 의 타당도를 검토하였다.");
    expect(c.year).toBe(2024);
  });
});

describe("mergeAndRank", () => {
  const oa = parseOpenAlexWork(openAlexWork)!;
  const s2 = parseS2Paper(s2Paper)!;
  const eric = parseEricDoc(ericDoc)!;

  it("merges the same paper from different sources by DOI", () => {
    const out = mergeAndRank([
      { source: "openalex", term: "a", items: [oa] },
      { source: "s2", term: "a", items: [s2] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.sort()).toEqual(["openalex", "s2"]);
    expect(out[0].citations).toBe(950);
    expect(out[0].impact).toMatchObject({ pct: 99.2, influential: 60 });
    // 더 긴 초록을 고른다
    expect(out[0].abstractSource).toBe("s2");
  });

  it("merges by title when one source lacks the DOI", () => {
    const noDoi: Candidate = { ...s2, doi: null, key: "t:x", ids: { s2: "zzz" } };
    const out = mergeAndRank([
      { source: "openalex", term: "a", items: [oa] },
      { source: "s2", term: "b", items: [noDoi] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].doi).toBe("10.1016/j.ijer.2012.12.002");
  });

  it("ranks papers found by more lists higher", () => {
    const out = mergeAndRank([
      { source: "eric", term: "a", items: [eric, s2] },
      { source: "openalex", term: "b", items: [oa] },
    ]);
    expect(out[0].doi).toBe(oa.doi);
    expect(out).toHaveLength(2);
  });
});

describe("planTasks", () => {
  const terms = ["digital reading assessment", "디지털 읽기 평가"];
  const all = ["openalex", "s2", "eric", "crossref"] as const;

  it("sends Korean terms to OpenAlex (Korean only) and Crossref", () => {
    const t = planTasks({ terms, sources: [...all], scope: "all" });
    const ko = t.filter((x) => x.term === "디지털 읽기 평가").map((x) => x.source);
    expect(ko.sort()).toEqual(["crossref", "openalex"]);
    const en = t.filter((x) => x.term === "digital reading assessment").map((x) => x.source);
    expect(en.sort()).toEqual(["eric", "openalex", "s2"]);
  });

  it("drops Korean terms for international scope and foreign-only sources for Korean scope", () => {
    expect(planTasks({ terms, sources: [...all], scope: "intl" }).some((x) => x.term === "디지털 읽기 평가")).toBe(false);
    const ko = planTasks({ terms, sources: [...all], scope: "ko" });
    expect(ko.some((x) => x.source === "s2" || x.source === "eric")).toBe(false);
  });

  it("respects the chosen sources", () => {
    const t = planTasks({ terms, sources: ["openalex"], scope: "all" });
    expect(new Set(t.map((x) => x.source))).toEqual(new Set(["openalex"]));
  });

  it("filters merged results by scope", () => {
    const kr = parseCrossrefItem(crossrefItem)!;
    const en = parseOpenAlexWork(openAlexWork)!;
    expect(applyScope([kr, en], "ko")).toEqual([kr]);
    expect(applyScope([kr, en], "intl")).toEqual([en]);
  });
});

describe("impact tiers", () => {
  const now = new Date("2026-10-01");
  it("labels percentiles and protects recent papers", () => {
    expect(tierOf({ pct: 99.5 }, 2010, now)).toBe("top1");
    expect(tierOf({ pct: 93 }, 2010, now)).toBe("top10");
    expect(tierOf({ pct: 62 }, 2010, now)).toBe("other");
    expect(tierLabel("other", 62)).toBe("상위 38%");
    expect(tierOf({ pct: 99.9 }, 2026, now)).toBe("recent");
    expect(tierOf({}, 2010, now)).toBe("none");
  });
});

describe("Korean site links", () => {
  it("encodes the query into each site's search URL", () => {
    const links = koreanSearchLinks("기술 강화 문항");
    expect(links.map((l) => l.id)).toEqual(["kci", "riss", "dbpia", "scholar"]);
    for (const l of links) expect(l.href).toContain(encodeURIComponent("기술 강화 문항"));
  });
});

import { stripKoreanParticles } from "@/lib/text";

describe("Korean particle stripping", () => {
  it("removes common particles so words match titles", () => {
    expect(stripKoreanParticles("디지털 환경의 읽기 평가와 문항 설계")).toBe("디지털 환경 읽기 평가 문항 설계");
    expect(stripKoreanParticles("학생들의 읽기 능력에 대한 연구")).toBe("학생들 읽기 능력 대한 연구");
    expect(stripKoreanParticles("프로그램을 활용한 수업에서의 효과")).toBe("프로그램 활용한 수업 효과");
  });
  it("keeps nouns that end in particle-like syllables", () => {
    expect(stripKoreanParticles("자기평가 학습효과 구성주의 민주주의")).toBe("자기평가 학습효과 구성주의 민주주의");
    expect(stripKoreanParticles("평가 교사 reading의")).toBe("평가 교사 reading");
  });
});

describe("paging", () => {
  it("passes the page number to every source", async () => {
    const t = planTasks({ terms: ["digital assessment", "디지털 평가"], sources: ["openalex", "s2", "eric", "crossref"], scope: "all", page: 3 });
    expect(t.length).toBe(5);
  });
});

import { afterEach, vi } from "vitest";
import { searchCrossref } from "@/lib/sources/crossref";
import { searchEric } from "@/lib/sources/eric";
import { searchOpenAlex } from "@/lib/sources/openalex";
import { searchS2 } from "@/lib/sources/semanticscholar";

describe("source paging and totals", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (body: unknown) => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(u);
      return new Response(JSON.stringify(body), { status: 200 });
    });
    return urls;
  };

  it("OpenAlex: page parameter and meta.count", async () => {
    const urls = stub({ meta: { count: 52341 }, results: [openAlexWork] });
    const r = await searchOpenAlex("digital assessment", { page: 2 });
    expect(new URL(urls[0]).searchParams.get("page")).toBe("2");
    expect(r.total).toBe(52341);
    expect(r.items).toHaveLength(1);
  });
  it("Semantic Scholar: offset from page, stops past 1,000", async () => {
    const urls = stub({ total: 9000, data: [s2Paper] });
    const r = await searchS2("digital assessment", { page: 3 });
    expect(new URL(urls[0]).searchParams.get("offset")).toBe("200");
    expect(r.total).toBe(9000);
    expect((await searchS2("x", { page: 11 })).items).toEqual([]);
  });
  it("ERIC: start from page and numFound", async () => {
    const urls = stub({ response: { numFound: 3120, docs: [ericDoc] } });
    const r = await searchEric("digital assessment", { page: 2 });
    expect(new URL(urls[0]).searchParams.get("start")).toBe("100");
    expect(r.total).toBe(3120);
  });
  it("Crossref: offset from page and total-results", async () => {
    const urls = stub({ message: { "total-results": 800, items: [crossrefItem] } });
    const r = await searchCrossref("디지털 평가", { page: 2 });
    expect(new URL(urls[0]).searchParams.get("offset")).toBe("40");
    expect(r.total).toBe(800);
  });
});

describe("제목·초록 정리", () => {
  it("HTML 문자 표기를 글자로 바꾼다", async () => {
    const { decodeEntities, cleanTitle, stripTags } = await import("@/lib/text");
    expect(decodeEntities("Students&apos; Conceptions &amp; &quot;AaL&quot; &#39;x&#x27;")).toBe(`Students' Conceptions & "AaL" 'x'`);
    expect(cleanTitle("Assessment<i>as</i>learning: blurring")).toBe("Assessment as learning: blurring");
    expect(cleanTitle("H<sub>2</sub>O in <i>vitro</i>")).toBe("H2O in vitro");
    expect(stripTags("p < .05 and q > .1")).toBe("p < .05 and q > .1");
  });

  it("ERIC 학술지 논문은 'Reports - Research'가 같이 붙어 있어도 논문으로 본다", () => {
    expect(parseEricDoc({ id: "EJ1", title: "T", publicationtype: ["Journal Articles", "Reports - Research"] })?.kind).toBe("article");
    expect(parseEricDoc({ id: "EJ2", title: "T", publicationtype: ["Journal Articles", "Information Analyses"] })?.kind).toBe("review");
    expect(parseEricDoc({ id: "ED3", title: "T", publicationtype: ["Reports - Research"] })?.kind).toBe("report");
  });

  it("합칠 때 논문 종류는 OpenAlex 표기를 먼저 믿는다", () => {
    const base = { doi: "10.1/x", title: "Same paper title here", authors: [], year: 2020, venue: null, abstract: null, abstractSource: null, citations: null, url: null, oaUrl: null, lang: "en", ids: {}, impact: {} };
    const out = mergeAndRank([
      { source: "eric", term: "q", items: [{ ...base, key: "doi:10.1/x", kind: "report", sources: ["eric"] }] },
      { source: "openalex", term: "q", items: [{ ...base, key: "doi:10.1/x", kind: "article", sources: ["openalex"] }] },
    ]);
    expect(out[0].kind).toBe("article");
  });
});
