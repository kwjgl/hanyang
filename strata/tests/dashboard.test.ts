// 대시보드 집계와 핵심 문헌 후보(함께 인용된 논문) 찾기를 검증한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { citationGraph } from "@/lib/citations";
import { countBy, tierCounts, weeklyCounts, yearBins } from "@/lib/dashboard";
import { forceLayout, type GNode, nodeLabel, timelineLayout, visibleGraph } from "@/lib/graph";
import { openAlexWorks } from "@/lib/sources/openalex";

describe("citationGraph", () => {
  const saved = [
    { paperId: "p1", oa: "W1", refs: ["W2", "W9", "W8", "W9"] },
    { paperId: "p2", oa: "W2", refs: ["W9", "W8", "W7"] },
    { paperId: "p3", oa: "W3", refs: ["W9", "W1", "W3"] },
  ];

  it("보관한 논문끼리의 인용을 연결로 만든다 (자기 인용은 뺀다)", () => {
    const { links } = citationGraph(saved);
    expect(links).toEqual([
      { from: "p1", to: "p2" },
      { from: "p3", to: "p1" },
    ]);
  });

  it("두 편 이상이 함께 인용한, 보관하지 않은 논문을 많이 인용된 순으로 고른다", () => {
    const { core } = citationGraph(saved);
    expect(core.map((c) => c.oa)).toEqual(["W9", "W8"]);
    expect(core[0].citedBy).toEqual(["p1", "p2", "p3"]);
    // 한 논문의 참고문헌에 같은 항목이 두 번 있어도 한 번으로 센다
    expect(core[1].citedBy).toEqual(["p1", "p2"]);
  });

  it("최대 개수를 지킨다", () => {
    expect(citationGraph(saved, { max: 1 }).core).toHaveLength(1);
  });
});

describe("대시보드 집계", () => {
  it("연도 범위가 좁으면 해마다, 넓으면 5년·10년 단위로 묶는다", () => {
    expect(yearBins([2020, 2021, 2021, null]).map((b) => [b.label, b.n])).toEqual([
      ["'20", 1],
      ["'21", 2],
    ]);
    const five = yearBins([1998, 2003, 2019]);
    expect(five[0].label).toBe("1995");
    expect(five.reduce((s, b) => s + b.n, 0)).toBe(3);
    expect(five).toHaveLength(5);
    expect(yearBins([1960, 2020])[0].tip).toBe("1960년대: 1편");
    expect(yearBins([])).toEqual([]);
  });

  it("주별 보관 수는 마지막 칸이 이번 주다", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const w = weeklyCounts(["2026-10-01T00:00:00Z", "2026-09-30T00:00:00Z", "2026-09-20T00:00:00Z", "2026-01-01T00:00:00Z"], 8, now);
    expect(w).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
  });

  it("영향력 구간을 센다 (최근 2년 논문은 따로)", () => {
    const now = new Date("2026-10-02");
    const t = tierCounts(
      [
        { impact: { pct: 99.5 }, year: 2015 },
        { impact: { pct: 92 }, year: 2015 },
        { impact: { pct: 50 }, year: 2015 },
        { impact: { pct: 99 }, year: 2026 },
        { impact: null, year: 2010 },
      ],
      now,
    );
    expect(t).toEqual({ top1: 1, top10: 1, other: 1, recent: 1, none: 1 });
  });

  it("여러 값을 가진 항목도 센다", () => {
    expect(countBy([{ l: ["초등", "중등"] }, { l: ["초등"] }, { l: [] }], (x) => x.l)).toEqual([
      { label: "초등", n: 2 },
      { label: "중등", n: 1 },
    ]);
  });
});

describe("openAlexWorks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ID와 DOI를 50개씩 묶어 요청하고 참고문헌을 짧은 ID로 돌려준다", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "https://openalex.org/W1",
                doi: "https://doi.org/10.1/a",
                display_name: "A",
                referenced_works: ["https://openalex.org/W9"],
              },
            ],
          }),
        );
      }),
    );
    const ids = Array.from({ length: 60 }, (_, i) => `W${i + 1}`);
    const out = await openAlexWorks({ ids, dois: ["10.1/a"] }, true);
    expect(urls).toHaveLength(3);
    const filters = urls.map((u) => new URL(u).searchParams.get("filter")!);
    expect(filters[0].startsWith("openalex:W1|W2|")).toBe(true);
    expect(filters[0].split("|")).toHaveLength(50);
    expect(filters[2]).toBe("doi:10.1/a");
    expect(new URL(urls[0]).searchParams.get("select")).toContain("referenced_works");
    expect(out[0].refs).toEqual(["W9"]);
    expect(out[0].candidate.ids.openalex).toBe("W1");
  });
});

describe("관계도 배치", () => {
  const node = (id: string, year: number | null, lane = "A"): GNode => ({ id, title: id, authors: ["Anne Mangen"], year, citations: 10, cand: false, lane, x: 0, y: 0 });

  it("이름표는 첫 저자 성 + 연도, 한글 이름은 그대로", () => {
    expect(nodeLabel({ authors: ["Anne Mangen"], year: 2013 })).toBe("Mangen 2013");
    expect(nodeLabel({ authors: ["김 민지"], year: 2020 })).toBe("김민지 2020");
    expect(nodeLabel({ authors: [], year: null })).toBe("저자 미상");
  });

  it("연결 없는 논문은 기본으로 숨기고, 없는 노드로 가는 선과 중복 선은 뺀다", () => {
    const nodes = [node("a", 2000), node("b", 2001), node("c", 2002)];
    const links = [
      { from: "a", to: "b" },
      { from: "a", to: "b" },
      { from: "a", to: "zz" },
    ];
    const g = visibleGraph(nodes, links, false);
    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(g.edges).toEqual([{ a: "a", b: "b" }]);
    expect(visibleGraph(nodes, links, true).nodes).toHaveLength(3);
  });

  it("힘 배치는 화면 안에 놓고, 같은 입력이면 같은 결과를 낸다", () => {
    const make = () => [node("a", 2000), node("b", 2001), node("c", 2002)];
    const e = [{ a: "a", b: "b" }];
    const n1 = make();
    const n2 = make();
    forceLayout(n1, e, 900, 520);
    forceLayout(n2, e, 900, 520);
    expect(n1.map((n) => [n.x, n.y])).toEqual(n2.map((n) => [n.x, n.y]));
    for (const n of n1) {
      expect(n.x).toBeGreaterThanOrEqual(40);
      expect(n.x).toBeLessThanOrEqual(750);
      expect(n.y).toBeGreaterThanOrEqual(30);
      expect(n.y).toBeLessThanOrEqual(490);
    }
  });

  it("연도 계보: 연도 순으로 왼쪽→오른쪽, 이름표가 겹치면 아래 칸으로", () => {
    const nodes = [node("old", 1990), node("new", 2020), node("near", 2021), node("other", 2000, "B")];
    const t = timelineLayout(nodes, ["A", "B", "C"], 900);
    const [old, nw, near, other] = nodes;
    expect(old.x).toBeLessThan(nw.x);
    expect(near.y).toBeGreaterThan(nw.y);
    expect(t.lanes.map((l) => l.name)).toEqual(["A", "B"]);
    expect(other.y).toBeGreaterThan(t.lanes[1].top);
    expect(t.ticks[0].label).toBe("1990");
  });
});
