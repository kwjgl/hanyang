// 글쓰기 인용: 본문 인용 표기, 넣기·이어 붙이기, 참고문헌 목록을 검증한다.
import { describe, expect, it } from "vitest";
import { citedInBody, type CitedRef, inTextCitation, insertCitation, paragraphAt, referenceList } from "@/lib/cite";

const ref = (over: Partial<CitedRef>): CitedRef => ({ key: "k", inText: "", title: "T", authors: [], year: 2000, venue: null, doi: null, url: null, ...over });

describe("본문 인용 표기 (APA 7판)", () => {
  it("영문 저자 수에 따라", () => {
    expect(inTextCitation({ authors: ["Walter Kintsch"], year: 1988 })).toBe("(Kintsch, 1988)");
    expect(inTextCitation({ authors: ["Anne Mangen", "Bente R. Walgermo"], year: 2013 })).toBe("(Mangen & Walgermo, 2013)");
    expect(inTextCitation({ authors: ["Pablo Delgado", "C. Vargas", "R. Ackerman"], year: 2018 })).toBe("(Delgado et al., 2018)");
  });
  it("국문 저자 수에 따라", () => {
    expect(inTextCitation({ authors: ["옥현진"], year: 2013 })).toBe("(옥현진, 2013)");
    expect(inTextCitation({ authors: ["옥현진", "송미영"], year: 2013 })).toBe("(옥현진, 송미영, 2013)");
    expect(inTextCitation({ authors: ["김종윤", "서수현", "김인숙"], year: 2017 })).toBe("(김종윤 외, 2017)");
    expect(inTextCitation({ authors: [], year: null })).toBe("(저자 미상, n.d.)");
  });
});

describe("인용 넣기", () => {
  const body = "텍스트 이해는 배경지식과 상호작용한다. 화면 읽기는 종이보다 불리하다.";

  it("문장 마침표 바로 앞에 넣는다", () => {
    expect(insertCitation(body, "텍스트 이해는 배경지식과 상호작용한다.", "(Kintsch, 1988)")).toBe(
      "텍스트 이해는 배경지식과 상호작용한다 (Kintsch, 1988). 화면 읽기는 종이보다 불리하다.",
    );
  });

  it("같은 자리에 인용이 있으면 세미콜론으로 이어 붙이고, 같은 인용은 두 번 넣지 않는다", () => {
    const one = insertCitation(body, "화면 읽기는 종이보다 불리하다.", "(Delgado et al., 2018)");
    const two = insertCitation(one, "화면 읽기는 종이보다 불리하다", "(Clinton, 2019)");
    expect(two).toBe("텍스트 이해는 배경지식과 상호작용한다. 화면 읽기는 종이보다 불리하다 (Delgado et al., 2018; Clinton, 2019).");
    expect(insertCitation(two, "화면 읽기는 종이보다 불리하다", "(Clinton, 2019)")).toBe(two);
  });

  it("같은 문장(마침표 포함)에 두 번째 인용을 넣어도 같은 괄호에 이어 붙인다", () => {
    const s1 = "화면 읽기는 종이보다 불리하다.";
    const once = insertCitation(body, s1, "(Delgado et al., 2018)");
    expect(insertCitation(once, s1, "(Clinton, 2019)", once.length)).toBe(
      "텍스트 이해는 배경지식과 상호작용한다. 화면 읽기는 종이보다 불리하다 (Delgado et al., 2018; Clinton, 2019).",
    );
  });

  it("문장을 못 찾으면 커서 위치에", () => {
    expect(insertCitation("앞 뒤", "없는 문장", "(A, 2000)", 1)).toBe("앞 (A, 2000) 뒤");
  });
});

describe("참고문헌 목록", () => {
  it("본문에서 지운 인용은 빼고, 국문 먼저 가나다순 → 영문 알파벳순", () => {
    const refs = [
      ref({ key: "a", inText: "(Kintsch, 1988)", authors: ["Walter Kintsch"], year: 1988, title: "The role of knowledge" }),
      ref({ key: "b", inText: "(옥현진, 2013)", authors: ["옥현진"], year: 2013, title: "디지털 읽기" }),
      ref({ key: "c", inText: "(Clinton, 2019)", authors: ["Virginia Clinton"], year: 2019, title: "Reading from paper" }),
      ref({ key: "d", inText: "(지운, 2000)", authors: ["지운"], year: 2000 }),
    ];
    const used = citedInBody("…(Kintsch, 1988)… (옥현진, 2013; Clinton, 2019)", refs);
    expect(used.map((r) => r.key)).toEqual(["a", "b", "c"]);
    const list = referenceList(used);
    expect(list[0]).toMatch(/^옥현진 \(2013\)/);
    expect(list[1]).toMatch(/^Clinton, V\./);
    expect(list[2]).toMatch(/^Kintsch, W\./);
  });

  it("커서가 있는 문단만 고른다", () => {
    const b = "첫 문단.\n\n둘째 문단 첫 문장. 둘째 문장.\n\n셋째.";
    expect(paragraphAt(b, b.indexOf("둘째 문장"))).toBe("둘째 문단 첫 문장. 둘째 문장.");
  });
});

describe("추천 고르기 도우미", () => {
  it("대표 문헌: 8년 넘게 300회 이상 인용됐거나 상위 1%", async () => {
    const { isClassic } = await import("@/lib/server/cite");
    expect(isClassic({ citations: 9000, year: 1988, impact: {} }, 2026)).toBe(true);
    expect(isClassic({ citations: 500, year: 2023, impact: {} }, 2026)).toBe(false);
    expect(isClassic({ citations: 20, year: 2023, impact: { pct: 99.5 } }, 2026)).toBe(true);
  });

  it("보관함에서 주장과 낱말이 많이 겹치는 논문을 고른다", async () => {
    const { matchSaved } = await import("@/lib/server/cite");
    const mk = (id: string, text: string) => ({ paperId: id, text, candidate: { citations: 0 } as never });
    const out = matchSaved(
      [mk("a", "Reading from paper compared to screens: a meta-analysis"), mk("b", "Teacher workload survey"), mk("c", "디지털 텍스트 읽기 평가에 대한 일고찰")],
      ["screen reading comprehension paper", "디지털 읽기 평가", "화면 읽기는 종이보다 이해도가 낮다"],
    );
    expect(out.map((x) => x.paperId)).toEqual(["c", "a"]);
  });
});

describe("AI가 고른 번호 확인 (지어낸 논문 막기)", () => {
  it("후보 목록에 없는 번호는 버리고, 주장마다 3편까지, 같은 논문은 한 번만", async () => {
    const { applyPicks } = await import("@/lib/server/cite");
    const cand = (t: string, citations = 10) => ({ candidate: { title: t, doi: null, citations, year: 2010, impact: {} } as never, paperId: null });
    const claims = [{ sentence: "s1", claim: "c1", classic: true, query_en: "q", query_ko: "" }];
    const pools = [[cand("A", 9000), cand("B"), cand("C"), cand("D")]];
    const out = applyPicks(claims, pools, [
      { claim: 1, id: "1-1", reason: " 고전 ", fit: "직접" },
      { claim: 1, id: "1-9", reason: "없는 후보", fit: "직접" },
      { claim: 1, id: "2-1", reason: "없는 주장", fit: "직접" },
      { claim: 1, id: "1-1", reason: "중복", fit: "관련" },
      { claim: 1, id: "[1-2]", reason: "b", fit: "관련" },
      { claim: 1, id: "1-3", reason: "c", fit: "관련" },
      { claim: 1, id: "1-4", reason: "넷째", fit: "관련" },
    ]);
    expect(out[0].recs.map((r) => (r.candidate as { title: string }).title)).toEqual(["A", "B", "C"]);
    expect(out[0].recs[0]).toMatchObject({ reason: "고전", fit: "직접", classic: true });
    expect(out[0].recs[1].fit).toBe("관련");
  });
});
