import { describe, expect, it } from "vitest";
import type { DetailResult } from "@/lib/claude/schemas";
import { cleanDetails, pagesLabel, summaryFromDetails } from "@/lib/details";

const pages = ["서론. 디지털 읽기 평가가 늘고 있다.", "연구 대상은 중학생 312명이다. 도구의 신뢰도는 α=.87이었다.", "화면 읽기 집단의 이해 점수가 낮았다(d=0.42).", "후속 연구에서는 종단 설계가 필요하다."];

const raw: DetailResult = {
  one_line: " 매체에 따른 읽기 이해 차이 ",
  purpose: { text: "매체 효과 검증", pages: [245, 999] },
  questions: ["매체에 따라 이해가 다른가?", "매체에 따라 이해가 다른가?"],
  participants: { text: "중학생 312명", n: 312, levels: ["중등", "대학원"], pages: [246] },
  design: { type: "실험·준실험", text: "두 집단 비교", pages: [246.4] },
  instruments: [{ name: "읽기 이해 검사", measures: "이해", reliability: "α=.87", pages: [246] }, { name: "", measures: "", reliability: "", pages: [] }],
  variables: { independent: ["매체"], dependent: ["이해 점수"], other: [] },
  analysis: { text: "t검정", pages: [] },
  findings: [{ text: "화면 집단이 낮았다", stats: "d=0.42", pages: [247] }, { text: " ", stats: "", pages: [1] }],
  implications: "종이 병행 필요",
  limitations: [{ text: "단일 지역 표본", pages: [248] }],
  future: [{ text: "종단 설계 필요", pages: [248] }],
  quotes: [
    { text: "“화면 읽기 집단의 이해 점수가 낮았다(d=0.42).”", pages: [999] },
    { text: "화면 읽기는 언제나 나쁘다.", pages: [247] },
  ],
  keywords: ["디지털 읽기", "매체"],
  fields: ["국어교육"],
};

describe("cleanDetails", () => {
  const d = cleanDetails(raw, { pages, offset: 244, range: { from: 245, to: 248, truncated: false } });
  it("keeps only real pages and listed values", () => {
    expect(d.purpose.pages).toEqual([245]);
    expect(d.design.pages).toEqual([246]);
    expect(d.participants.levels).toEqual(["중등"]);
    expect(d.participants.n).toBe(312);
    expect(d.design.type).toBe("실험·준실험");
    expect(d.questions).toHaveLength(1);
    expect(d.instruments).toHaveLength(1);
    expect(d.findings).toHaveLength(1);
    expect(d.one_line).toBe("매체에 따른 읽기 이해 차이");
    expect(d.pageMode).toBe("print");
  });
  it("keeps only quotes found word for word, with the page where they were found", () => {
    expect(d.quotes).toEqual([{ text: "화면 읽기 집단의 이해 점수가 낮았다(d=0.42).", pages: [247] }]);
  });
  it("drops an unknown study type and uses PDF pages without an offset", () => {
    const x = cleanDetails({ ...raw, design: { type: "사례연구", text: "", pages: [] } }, { pages, offset: null, range: { from: 1, to: 4, truncated: false } });
    expect(x.design.type).toBeNull();
    expect(x.pageMode).toBe("pdf");
    expect(x.purpose.pages).toEqual([]);
  });
  it("turns details into a summary for papers without one", () => {
    const s = summaryFromDetails(d, ["국어교육"]);
    expect(s.study_type).toBe("실험·준실험");
    expect(s.levels).toEqual(["중등"]);
    expect(s.findings).toBe("화면 집단이 낮았다 (d=0.42)");
  });
});

describe("pagesLabel", () => {
  it("formats page references", () => {
    expect(pagesLabel([12])).toBe("p. 12");
    expect(pagesLabel([12, 13, 14])).toBe("pp. 12–14");
    expect(pagesLabel([3, 9])).toBe("pp. 3, 9");
    expect(pagesLabel([3], "pdf")).toBe("PDF p. 3");
    expect(pagesLabel([])).toBe("");
  });
});
