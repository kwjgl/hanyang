// 연구 동향: 연도별 집계 요청, 증감률, 지수 바꾸기를 검증한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { openAlexYearCounts } from "@/lib/sources/openalex";
import { changeLabel, indexed, niceStep, recentChange } from "@/lib/trends";

describe("연구 동향 계산", () => {
  it("최근 5년이 앞 5년보다 몇 % 늘었는지", () => {
    expect(recentChange([1, 1, 1, 1, 1, 2, 2, 2, 2, 2])).toBe(100);
    expect(recentChange([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])).toBeNull();
    expect(recentChange([1, 2, 3])).toBeNull();
    expect(changeLabel(100)).toBe("+100% ↑ 성장 중");
    expect(changeLabel(-20)).toBe("-20% ↓ 감소");
    expect(changeLabel(5)).toBe("+5% → 유지");
  });

  it("첫 5년 평균을 100으로 놓는다 (처음이 0이면 처음 0이 아닌 해 기준)", () => {
    expect(indexed([10, 10, 10, 10, 10, 20])).toEqual([100, 100, 100, 100, 100, 200]);
    expect(indexed([0, 0, 0, 0, 0, 4, 8])).toEqual([0, 0, 0, 0, 0, 100, 200]);
    expect(indexed([0, 0])).toEqual([0, 0]);
  });

  it("눈금 간격은 1·2·5 단위", () => {
    expect(niceStep(4000)).toBe(1000);
    expect(niceStep(1400)).toBe(500);
    expect(niceStep(7)).toBe(2);
    expect(niceStep(0)).toBe(1);
  });
});

describe("openAlexYearCounts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("연도별로 묶어 세고, 없는 해는 0으로 채운다", async () => {
    let asked = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked = url;
        return new Response(JSON.stringify({ meta: { count: 30 }, group_by: [{ key: "2021", count: 10 }, { key: "2023", count: 20 }, { key: "1999", count: 5 }] }));
      }),
    );
    const r = await openAlexYearCounts("디지털 읽기 평가", 2021, 2024);
    const u = new URL(asked);
    expect(u.searchParams.get("group_by")).toBe("publication_year");
    expect(u.searchParams.get("filter")).toBe("publication_year:2021-2024");
    expect(u.searchParams.get("search")).toBe("디지털 읽기 평가");
    expect(r).toEqual({ counts: [10, 0, 20, 0], total: 30 });
  });
});
