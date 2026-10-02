// 검색 순위 다듬기: 제목 일치, 해마다 받은 피인용, 목차 같은 잡음 빼기, 목록 무게를 검증한다.
import { describe, expect, it } from "vitest";
import { mergeAndRank } from "@/lib/search/merge";
import { coverage, hasPhrase, isJunk, queryWords, rerank } from "@/lib/search/rank";
import { planTasks } from "@/lib/search/run";
import type { Candidate } from "@/lib/types";

const c = (key: string, over: Partial<Candidate> = {}): Candidate => ({
  key,
  doi: null,
  title: key,
  authors: [],
  year: 2015,
  venue: null,
  abstract: null,
  abstractSource: null,
  citations: 0,
  url: null,
  oaUrl: null,
  lang: "en",
  kind: "article",
  ids: {},
  sources: ["openalex"],
  impact: {},
  ...over,
});

describe("낱말 일치", () => {
  it("불용어를 빼고 복수형을 맞춘다", () => {
    expect(queryWords("Effects of Digital Reading on Comprehension")).toEqual(["effect", "digital", "reading", "comprehension"]);
    expect(coverage(queryWords("digital reading assessments"), "Assessment of digital reading")).toBe(1);
    expect(coverage(queryWords("digital reading"), "Paper books")).toBe(0);
  });

  it("한국어는 붙여 쓴 합성어도 부분 일치로 센다", () => {
    expect(coverage(queryWords("디지털 평가"), "디지털기반 읽기평가 문항 개발")).toBe(1);
  });

  it("목차·편집 정보 같은 항목을 걸러 낸다", () => {
    expect(isJunk({ title: "Front Matter" })).toBe(true);
    expect(isJunk({ title: "Issue Information" })).toBe(true);
    expect(isJunk({ title: "편집후기" })).toBe(true);
    expect(isJunk({ title: "Index-based reading measures" })).toBe(false);
    expect(isJunk({ title: "읽기 교육" })).toBe(false);
    expect(isJunk({ title: "Contents of a reading test" })).toBe(false);
    expect(isJunk({ title: "Correction to: Digital reading" })).toBe(true);
    expect(isJunk({ title: "Editorial Board 12(3)" })).toBe(true);
  });
});

describe("rerank", () => {
  it("순위가 비슷하면 제목에 검색어가 다 들어 있는 논문이 위로", () => {
    const out = rerank(
      [c("Teacher workload survey", { score: 0.0164 }), c("Digital reading assessment design", { score: 0.0161 })],
      ["digital reading assessment"],
      2026,
    );
    expect(out[0].title).toBe("Digital reading assessment design");
  });

  it("같은 조건이면 해마다 많이 인용된 논문이 위로", () => {
    const out = rerank(
      [c("Reading on screens a", { score: 0.016, citations: 5 }), c("Reading on screens b", { score: 0.016, citations: 2000, year: 2010 })],
      ["reading on screens"],
      2026,
    );
    expect(out[0].title).toBe("Reading on screens b");
  });

  it("원래 검색어 일치가 AI가 넓힌 검색어 일치보다 무겁다", () => {
    const out = rerank(
      [c("Item response theory models", { score: 0.016 }), c("Digital literacy assessment", { score: 0.016 })],
      ["digital literacy assessment", "item response theory models"],
      2026,
    );
    expect(out[0].title).toBe("Digital literacy assessment");
  });

  it("목차 항목은 결과에서 빠진다", () => {
    expect(rerank([c("Front matter", { score: 1 }), c("Reading comprehension", { score: 0.1 })], ["reading"], 2026).map((x) => x.title)).toEqual(["Reading comprehension"]);
  });
});

describe("목록 무게", () => {
  it("원래 검색어는 1, 넓힌 검색어는 0.5, Crossref 영문은 낮게", () => {
    const tasks = planTasks({ terms: ["digital reading", "screen inferiority", "디지털 읽기"], sources: ["openalex", "s2", "eric", "crossref"], scope: "all" });
    const w = (s: string, t: string) => tasks.find((x) => x.source === s && x.term === t)?.weight;
    expect(w("openalex", "digital reading")).toBe(1);
    expect(w("openalex", "screen inferiority")).toBeCloseTo(0.5);
    expect(w("eric", "digital reading")).toBeCloseTo(0.8);
    expect(w("crossref", "디지털 읽기")).toBeCloseTo(0.5 * 0.85);
  });

  it("무게가 큰 목록의 1위가 더 높은 점수를 받는다", () => {
    const out = mergeAndRank([
      { source: "crossref", term: "x", items: [c("A")], weight: 0.5 },
      { source: "openalex", term: "x", items: [c("B")], weight: 1 },
    ]);
    expect(out[0].title).toBe("B");
  });
});

describe("구글 학술검색과 비교한 실제 사례 (assessment for learning)", () => {
  it("제목에 검색어가 구절 그대로 있는 논문이, 낱말만 흩어져 있거나 넓힌 검색어로만 걸린 논문보다 위로", () => {
    const terms = ["assessment for learning", "formative assessment practices", "learning analytics in formative assessment"];
    const filler = (n: number, tag: string) => Array.from({ length: n }, (_, i) => c(`${tag} filler paper number ${i}`));
    const scoping = c("A scoping review on the notions of Assessment as Learning (AaL), Assessment for Learning (AfL), and Assessment of Learning (AoL)", { year: 2021, citations: 367 });
    const chatgpt = c("Leadership is needed for ethical ChatGPT: Character, assessment, and learning using artificial intelligence (AI)", { year: 2023, citations: 547 });
    const analytics = c("Formative Assessment Strategies for Students' Conceptions: The Potential of Learning Analytics", { year: 2023, citations: 68 });
    const lists = [
      // 원래 검색어: 스코핑 리뷰는 40위쯤, ChatGPT 논평은 10위쯤
      { source: "openalex" as const, term: terms[0], weight: 1, items: [...filler(9, "a"), chatgpt, ...filler(30, "b"), scoping] },
      // 넓힌 검색어 두 개에서 학습 분석 논문이 1위
      { source: "openalex" as const, term: terms[1], weight: 0.5, items: [analytics] },
      { source: "openalex" as const, term: terms[2], weight: 0.5, items: [analytics] },
      { source: "s2" as const, term: terms[2], weight: 0.5, items: [analytics] },
    ];
    const out = rerank(mergeAndRank(lists), terms, 2026).map((x) => x.title);
    const at = (t: string) => out.indexOf(t);
    expect(at(scoping.title)).toBeLessThan(at(chatgpt.title));
    expect(at(scoping.title)).toBeLessThan(at(analytics.title));
  });

  it("구절 찾기는 대소문자·구두점을 무시하고, 낱말 하나짜리 검색어는 구절로 치지 않는다", () => {
    expect(hasPhrase(["assessment for learning"], "Assessment-for-Learning in practice")).toBe(true);
    expect(hasPhrase(["assessment for learning"], "Assessment, and learning")).toBe(false);
    expect(hasPhrase(["assessment"], "Assessment")).toBe(false);
  });
});
