// 새 논문 알림: 확인할 때가 됐는지, 새 논문만 고르는지 검증한다.
import { describe, expect, it } from "vitest";
import { isDue, pickNew } from "@/lib/server/alerts";
import type { Candidate } from "@/lib/types";

const c = (key: string, year: number, doi: string | null = null): Candidate => ({
  key,
  doi,
  title: key,
  authors: [],
  year,
  venue: null,
  abstract: null,
  abstractSource: null,
  citations: null,
  url: null,
  oaUrl: null,
  lang: "en",
  kind: "article",
  ids: {},
  sources: ["openalex"],
  impact: {},
});

describe("새 논문 알림", () => {
  it("저장하거나 마지막으로 확인한 지 7일이 지나면 확인한다", () => {
    const now = new Date("2026-10-10T00:00:00Z").getTime();
    expect(isDue({ checked_at: null, created_at: "2026-10-01T00:00:00Z" }, now)).toBe(true);
    expect(isDue({ checked_at: null, created_at: "2026-10-05T00:00:00Z" }, now)).toBe(false);
    expect(isDue({ checked_at: "2026-10-02T23:00:00Z", created_at: "2026-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isDue({ checked_at: "2026-10-08T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }, now)).toBe(false);
  });

  it("이미 본 논문과 오래된 논문은 빼고, 작년·올해 논문만 고른다", () => {
    const known = new Set(["doi:10.1/seen", "t:old-key"]);
    const out = pickNew([c("doi:10.1/seen", 2026, "10.1/seen"), c("t:old-key", 2026), c("t:classic", 2010), c("t:new", 2026), c("t:last-year", 2025), c("t:two-years", 2024)], known, 2026);
    expect(out.map((x) => x.key)).toEqual(["t:new", "t:last-year"]);
  });

  it("DOI가 같으면 키가 달라도 이미 본 논문으로 친다", () => {
    expect(pickNew([c("t:other-title", 2026, "10.1/seen")], new Set(["doi:10.1/seen"]), 2026)).toEqual([]);
  });

  it("관련도 상위 60편 안에서만, 최대 20편 고른다", () => {
    const many = Array.from({ length: 100 }, (_, i) => c(`t:${i}`, 2026));
    const out = pickNew(many, new Set(), 2026);
    expect(out).toHaveLength(20);
    const deep = [...Array.from({ length: 60 }, (_, i) => c(`t:seen${i}`, 2026)), c("t:deep", 2026)];
    expect(pickNew(deep, new Set(deep.slice(0, 60).map((x) => x.key)), 2026)).toEqual([]);
  });
});

describe("새 논문 알림 — 다른 분야", () => {
  it("다른 분야로 판별된 논문은 알림에 넣지 않는다", () => {
    const off = { ...c("t:med", 2026), domain: "out" as const };
    expect(pickNew([off, c("t:edu", 2026)], new Set(), 2026).map((x) => x.key)).toEqual(["t:edu"]);
  });
});
