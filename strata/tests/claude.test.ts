import { describe, expect, it } from "vitest";
import { costUsd } from "@/lib/claude/pricing";
import { EXPAND_SYSTEM, expandUser, summaryUser } from "@/lib/claude/prompts";
import { SummarySchema } from "@/lib/claude/schemas";
import { decryptSecret, encryptSecret, last4 } from "@/lib/crypto";
import type { Candidate } from "@/lib/types";

describe("api key encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    process.env.API_KEY_ENCRYPTION_SECRET = "x".repeat(40);
    const a = encryptSecret("sk-ant-api03-secret-1234");
    const b = encryptSecret("sk-ant-api03-secret-1234");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("sk-ant-api03-secret-1234");
    expect(last4("sk-ant-api03-secret-1234 ")).toBe("1234");
  });
  it("refuses to decrypt with a different secret", () => {
    process.env.API_KEY_ENCRYPTION_SECRET = "x".repeat(40);
    const a = encryptSecret("k");
    process.env.API_KEY_ENCRYPTION_SECRET = "y".repeat(40);
    expect(() => decryptSecret(a)).toThrow();
  });
});

describe("pricing", () => {
  it("prices Sonnet 5.5 and Haiku 4.5 per million tokens", () => {
    expect(costUsd("claude-sonnet-5-5", 1_000_000, 0)).toBe(2);
    expect(costUsd("claude-sonnet-5-5", 1200, 700)).toBeCloseTo(0.0094, 4);
    expect(costUsd("claude-haiku-4-5", 0, 1_000_000)).toBe(5);
  });
});

describe("prompts", () => {
  const c: Candidate = {
    key: "k", doi: null, title: "T", authors: ["A", "B"], year: 2020, venue: "V", abstract: "Abstract text",
    abstractSource: null, citations: null, url: null, oaUrl: null, lang: null, kind: null, ids: {}, sources: [], impact: {},
  };
  it("includes the editable field list with descriptions", () => {
    const u = summaryUser(c, [{ name: "국어교육", description: "읽기·쓰기" }]);
    expect(u).toContain("- 국어교육: 읽기·쓰기");
    expect(u).toContain("초록:\nAbstract text");
  });
  it("passes project context to query expansion", () => {
    expect(expandUser("읽기 평가", { researchQuestion: "RQ", fields: ["교육평가"] })).toBe("검색 주제: 읽기 평가\n프로젝트 연구 질문: RQ\n프로젝트 분야: 교육평가");
    expect(EXPAND_SYSTEM).toContain("terms_ko");
  });
  it("validates summary output against the schema", () => {
    const ok = SummarySchema.safeParse({
      one_line: "x", participants: "x", design: "x", findings: "x", implications: "x", keywords: ["a"],
      study_type: "실험·준실험", levels: ["중등"], fields: ["국어교육"], suggested_field: "",
    });
    expect(ok.success).toBe(true);
    expect(SummarySchema.safeParse({ one_line: "x" }).success).toBe(false);
  });
});

import { apa, tsv } from "@/lib/export";

describe("citation export", () => {
  it("formats APA with initials and DOI", () => {
    expect(apa({ authors: ["Anne Mangen", "Bente R. Walgermo", "Kolbjørn Brønnick"], year: 2013, title: "Reading linear texts", venue: "IJER", doi: "10.1016/j.ijer.2012.12.002" }))
      .toBe("Mangen, A., Walgermo, B. R., & Brønnick, K. (2013). Reading linear texts. IJER. https://doi.org/10.1016/j.ijer.2012.12.002");
    expect(apa({ authors: ["김 민지"], year: null, title: "제목", venue: null, doi: null })).toBe("김민지 (n.d.). 제목.");
  });
  it("builds a tab-separated table without stray tabs or newlines", () => {
    const out = tsv([{ subtopic: "매체", cite: { authors: ["A B", "C D"], year: 2020, title: "T\tx", venue: null, doi: null }, impact: "상위 1%", summary: null }]);
    expect(out.split("\n")).toHaveLength(2);
    expect(out.split("\n")[1].split("\t")).toHaveLength(7);
  });
});

import { isAllowedEmail } from "@/lib/allow";

describe("email allowlist", () => {
  it("allows everyone when empty, otherwise exact emails and @domains", () => {
    expect(isAllowedEmail("a@x.com", "")).toBe(true);
    expect(isAllowedEmail("a@hanyang.ac.kr", "@hanyang.ac.kr")).toBe(true);
    expect(isAllowedEmail("A@Hanyang.ac.kr", " @hanyang.ac.kr , b@gmail.com")).toBe(true);
    expect(isAllowedEmail("b@gmail.com", "@hanyang.ac.kr,b@gmail.com")).toBe(true);
    expect(isAllowedEmail("c@gmail.com", "@hanyang.ac.kr,b@gmail.com")).toBe(false);
    expect(isAllowedEmail(null, "@hanyang.ac.kr")).toBe(false);
  });
});
