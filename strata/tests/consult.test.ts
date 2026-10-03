import { describe, expect, it } from "vitest";
import { authorMatches, type ConsultMsg, historyText, outlineBody, pickWork, sameWork, surnameOf, verifiedWorks } from "@/lib/consult";
import type { Candidate } from "@/lib/types";

const cand = (p: Partial<Candidate>): Candidate => ({
  key: p.title ?? "k",
  doi: null,
  title: "",
  authors: [],
  year: null,
  venue: null,
  abstract: null,
  abstractSource: null,
  citations: null,
  url: null,
  oaUrl: null,
  lang: null,
  kind: null,
  ids: {},
  sources: ["openalex"],
  impact: {},
  ...p,
});

describe("surnameOf / authorMatches", () => {
  it("reads common name forms", () => {
    expect(surnameOf("Kintsch, W.")).toBe("kintsch");
    expect(surnameOf("Walter Kintsch")).toBe("kintsch");
    expect(surnameOf("Kintsch, W., & van Dijk, T. A.")).toBe("kintsch");
    expect(surnameOf("Vygotsky")).toBe("vygotsky");
    expect(surnameOf("옥현진")).toBe("옥현진");
    expect(surnameOf("김종윤 외")).toBe("김종윤");
  });
  it("matches against database author names", () => {
    expect(authorMatches("Kintsch", ["Walter Kintsch"])).toBe(true);
    expect(authorMatches("van Dijk", ["Teun A. van Dijk"])).toBe(true);
    expect(authorMatches("Vygotskij", ["Lev Vygotsky"])).toBe(false);
    expect(authorMatches("Rosenblatt", ["Louise M. Rosenblatt"])).toBe(true);
    expect(authorMatches("Piaget", ["Jean Piagét"])).toBe(true);
    expect(authorMatches("옥현진", ["옥현진", "서수현"])).toBe(true);
    expect(authorMatches("옥현진", ["김종윤"])).toBe(false);
  });
});

describe("sameWork / pickWork", () => {
  const named = { author: "Kintsch", year: 1988, title: "The role of knowledge in discourse comprehension: A construction-integration model" };
  it("accepts the real paper and rejects look-alikes", () => {
    const real = cand({ title: "The role of knowledge in discourse comprehension: A construction-integration model.", authors: ["Walter Kintsch"], year: 1988, citations: 6000 });
    const other = cand({ title: "Applying the construction-integration model to reading comprehension", authors: ["Someone Else"], year: 2010, citations: 50 });
    const wrongAuthor = cand({ title: "The role of knowledge in discourse comprehension", authors: ["Jane Doe"], year: 1988 });
    expect(sameWork(named, real)).toBe(true);
    expect(sameWork(named, other)).toBe(false);
    expect(sameWork(named, wrongAuthor)).toBe(false);
    expect(pickWork(named, [other, wrongAuthor, real])?.citations).toBe(6000);
    expect(pickWork(named, [other, wrongAuthor])).toBeNull();
  });
  it("allows reprint years when the title is the same, not when it is only similar", () => {
    const reprint = cand({ title: "Mind in Society: The Development of Higher Psychological Processes", authors: ["L. S. Vygotsky"], year: 1980 });
    expect(sameWork({ author: "Vygotsky", year: 1978, title: "Mind in society: The development of higher psychological processes" }, reprint)).toBe(true);
    expect(sameWork({ author: "Vygotsky", year: 1934, title: "Thought and language" }, reprint)).toBe(false);
  });
  it("handles a missing subtitle", () => {
    const c = cand({ title: "Situation models in language comprehension and memory", authors: ["Rolf A. Zwaan", "Gabriel A. Radvansky"], year: 1998 });
    expect(sameWork({ author: "Zwaan", year: 1998, title: "Situation models in language comprehension and memory" }, c)).toBe(true);
    expect(sameWork({ author: "Zwaan", year: 1998, title: "Situation models" }, c)).toBe(false);
    const sub = cand({ title: "The role of knowledge in discourse comprehension: A construction-integration model", authors: ["W. Kintsch"], year: 1988 });
    expect(sameWork({ author: "Kintsch", year: 1988, title: "The role of knowledge in discourse comprehension" }, sub)).toBe(true);
    expect(sameWork({ author: "Kintsch", year: 1998, title: "The role of knowledge in discourse comprehension" }, sub)).toBe(false);
  });
});

const verified = (title: string, authors: string[], year: number, doi: string | null = null) => ({
  author: authors[0],
  year,
  title,
  status: "verified" as const,
  candidate: cand({ title, authors, year, doi }),
});

describe("verifiedWorks / historyText", () => {
  const msgs: ConsultMsg[] = [
    { role: "user", text: "읽기 이해 이론을 알려 주세요", at: "" },
    {
      role: "assistant",
      text: "구성-통합 모형을 권합니다.",
      at: "",
      theories: [
        {
          name: "구성-통합 모형",
          summary: "",
          fit: "",
          query_en: "",
          query_ko: "",
          works: [verified("The role of knowledge", ["Walter Kintsch"], 1988, "10.1037/0033-295x.95.2.163"), { author: "Nobody", year: 2000, title: "Made up", status: "unverified" }],
        },
        { name: "상황 모형", summary: "", fit: "", query_en: "", query_ko: "", works: [verified("The role of knowledge", ["Walter Kintsch"], 1988, "10.1037/0033-295x.95.2.163")] },
      ],
    },
  ];
  it("keeps verified works once each", () => {
    const v = verifiedWorks(msgs);
    expect(v).toHaveLength(1);
    expect(v[0].theory).toBe("구성-통합 모형");
  });
  it("summarises the conversation with verification marks and trims old turns", () => {
    const h = historyText(msgs);
    expect(h).toContain("연구자: 읽기 이해 이론");
    expect(h).toContain("Walter Kintsch (1988) [확인됨]");
    expect(h).toContain("Nobody (2000) [확인 안 됨]");
    const long: ConsultMsg[] = Array.from({ length: 30 }, (_, i) => ({ role: "user" as const, text: `${i}번째 ${"가".repeat(500)}`, at: "" }));
    const t = historyText(long, 3000);
    expect(t.length).toBeLessThanOrEqual(3200);
    expect(t).toContain("29번째");
    expect(t).not.toContain("0번째 ");
  });
});

describe("outlineBody", () => {
  it("cites only listed works and builds the reference data", () => {
    const works = [cand({ title: "A", authors: ["Walter Kintsch"], year: 1988, doi: "10.1/a" }), cand({ title: "B", authors: ["옥현진", "서수현"], year: 2013 })];
    const { body, citations } = outlineBody(
      [
        { heading: "읽기 이해의 이론", points: [{ text: "읽기 이해는 텍스트 기반과 상황 모형의 구성이다.", ids: [1] }, { text: "디지털 읽기는 다른 전략을 요구한다", ids: [2, 1, 9] }] },
        { heading: "연구와의 연결", points: [{ text: "이 연구는 평가 과정에 초점을 둔다.", ids: [] }] },
      ],
      works,
    );
    expect(body).toContain("1. 읽기 이해의 이론");
    expect(body).toContain("상황 모형의 구성이다 (Kintsch, 1988).");
    expect(body).toContain("다른 전략을 요구한다 (옥현진, 서수현, 2013; Kintsch, 1988).");
    expect(body).toContain("2. 연구와의 연결\n\n이 연구는 평가 과정에 초점을 둔다.");
    expect(citations.map((c) => c.inText)).toEqual(["(Kintsch, 1988)", "(옥현진, 서수현, 2013)"]);
  });
});

describe("Korean authors written in English", () => {
  it("matches romanized surnames", async () => {
    const { koreanSurname, romanizedHas } = await import("@/lib/korean-names");
    expect(koreanSurname("옥현진")?.romans).toContain("ok");
    expect(koreanSurname("남궁민")?.surname).toBe("남궁");
    expect(koreanSurname("이")?.surname).toBe("이");
    expect(romanizedHas("옥현진", "Hyunjin Ok")).toBe(true);
    expect(romanizedHas("옥현진", "Ok, Hyun-Jin")).toBe(true);
    expect(romanizedHas("이수진", "Soojin Lee")).toBe(true);
    expect(romanizedHas("이수진", "Soojin Rhee")).toBe(true);
    expect(romanizedHas("옥현진", "Minji Kim")).toBe(false);
    expect(authorMatches("옥현진", ["HJ Ok", "SH Seo"])).toBe(true);
    expect(authorMatches("김종윤", ["Jongyun Kim"])).toBe(true);
    expect(authorMatches("김종윤", ["Jongyun Park"])).toBe(false);
    expect(authorMatches("Ok", ["옥현진"])).toBe(true);
  });
  it("verifies a Korean paper listed with English authors or an English first title", () => {
    const named = { author: "옥현진", year: 2013, title: "디지털 텍스트 읽기 평가의 방향" };
    const english = cand({ title: "디지털 텍스트 읽기 평가의 방향", authors: ["Hyunjin Ok"], year: 2013, sources: ["crossref"] });
    const altFirst = cand({ title: "Directions for assessing digital text reading", altTitles: ["디지털 텍스트 읽기 평가의 방향"], authors: ["옥현진"], year: 2013 });
    const different = cand({ title: "디지털 교과서의 활용 방안", authors: ["Hyunjin Ok"], year: 2013 });
    expect(sameWork(named, english)).toBe(true);
    expect(sameWork(named, altFirst)).toBe(true);
    expect(sameWork(named, different)).toBe(false);
  });
});

describe("Crossref alternate titles", () => {
  it("keeps the other-language title", async () => {
    const { parseCrossrefItem } = await import("@/lib/sources/crossref");
    const c = parseCrossrefItem({ DOI: "10.1234/kr.1", title: ["Directions for assessing digital text reading", "디지털 텍스트 읽기 평가의 방향"], author: [{ given: "Hyunjin", family: "Ok" }] });
    expect(c?.altTitles).toEqual(["디지털 텍스트 읽기 평가의 방향"]);
    expect(parseCrossrefItem({ DOI: "10.1234/kr.2", title: ["Only one"] })?.altTitles).toBeUndefined();
  });
});
