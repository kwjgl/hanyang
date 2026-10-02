// 연구 공백 지도: 칸 세기, 빈칸 찾기, 축별 값, 표 복사를 검증한다.
import { describe, expect, it } from "vitest";
import { buildMatrix, columnsOf, type GapItem, itemsIn, matrixTsv, periodOf, valuesOf } from "@/lib/gapmap";
import { gapUser } from "@/lib/claude/prompts";
import { GapSchema } from "@/lib/claude/schemas";

const it_ = (over: Partial<GapItem>): GapItem => ({
  key: Math.random().toString(36),
  title: "t",
  year: 2018,
  url: null,
  ko: false,
  subtopic: "매체 효과",
  levels: ["초등"],
  method: "실험·준실험",
  custom: null,
  saved: false,
  ...over,
});

describe("공백 지도", () => {
  const subtopics = ["읽기 이해 이론", "매체 효과", "디지털 문항 유형"];
  const items = [
    it_({ subtopic: "매체 효과", levels: ["초등", "중등"] }),
    it_({ subtopic: "매체 효과", levels: ["중등"], method: "메타분석·리뷰" }),
    it_({ subtopic: "읽기 이해 이론", levels: ["해당 없음"], method: "이론·설계", year: 1988 }),
    it_({ subtopic: null, levels: ["고등"] }),
  ];

  it("학교급은 한 논문이 여러 칸에 들어가고, 해당 없음·소주제 밖은 빠진 수로 센다", () => {
    const m = buildMatrix(items, subtopics, "level");
    expect(m.cols).toEqual(["유아", "초등", "중등", "고등", "대학·성인", "교사"]);
    expect(m.rows.find((r) => r.name === "매체 효과")!.counts).toEqual([0, 1, 2, 0, 0, 0]);
    expect(m.unplaced).toBe(2);
    expect(m.max).toBe(2);
    // 디지털 문항 유형 줄은 전부 빈칸
    expect(m.gaps.filter((g) => g.row === "디지털 문항 유형")).toHaveLength(6);
  });

  it("출판 시기·국내외는 논문 정보로 나눈다", () => {
    expect(periodOf(1988)).toBe("~2009");
    expect(periodOf(2021)).toBe("2020–24");
    expect(periodOf(null)).toBeNull();
    expect(valuesOf(it_({ ko: true }), "region")).toEqual(["국내"]);
    expect(buildMatrix(items, subtopics, "period").rows[0].counts).toEqual([1, 0, 0, 0, 0]);
  });

  it("직접 정의 축은 정한 범주가 칸이 된다", () => {
    const custom = { name: "평가 영역", categories: ["읽기", "쓰기"] };
    expect(columnsOf("custom", custom)).toEqual(["읽기", "쓰기"]);
    const m = buildMatrix([it_({ custom: "쓰기" })], subtopics, "custom", custom);
    expect(m.rows[1].counts).toEqual([0, 1]);
  });

  it("칸의 논문 목록과 표 복사", () => {
    expect(itemsIn(items, "매체 효과", "중등", "level")).toHaveLength(2);
    const tsv = matrixTsv(buildMatrix(items, subtopics, "method"), "연구 방법");
    expect(tsv.split("\n")[0]).toBe("소주제 \\ 연구 방법\t실험·준실험\t조사·상관\t질적\t혼합\t메타분석·리뷰\t이론·설계\t기타");
    expect(tsv.split("\n")[2]).toBe("매체 효과\t1\t0\t0\t0\t1\t0\t0");
  });

  it("AI에 소주제·직접 정의 축·논문 번호를 알려 주고, 응답 형식을 검사한다", () => {
    const u = gapUser(subtopics, { name: "평가 영역", categories: ["읽기", "쓰기"] }, [{ id: "1", title: "디지털 읽기 평가", year: 2013, abstract: null }]);
    expect(u).toContain("소주제 목록: 읽기 이해 이론 / 매체 효과 / 디지털 문항 유형");
    expect(u).toContain('직접 정의한 축 "평가 영역": 읽기 / 쓰기');
    expect(u).toContain("[1] 디지털 읽기 평가 (2013)");
    expect(GapSchema.safeParse({ items: [{ id: "1", subtopic: "매체 효과", levels: ["초등"], method: "질적", custom: "" }] }).success).toBe(true);
    // 목록 밖 값이 섞여도 묶음 전체가 실패하지 않는다 (서버에서 걸러 낸다)
    expect(GapSchema.safeParse({ items: [{ id: "1", subtopic: "x", levels: ["대학원"], method: "질적", custom: "" }] }).success).toBe(true);
    expect(GapSchema.safeParse({ items: [{ id: "1", subtopic: "x" }] }).success).toBe(false);
  });
});
