// 내보내기: BibTeX · RIS · CSV · Markdown 모양을 검증한다.
import { describe, expect, it } from "vitest";
import { bibtex, citeKeys, csv, type ExportPaper, markdown, ris } from "@/lib/export";

const en: ExportPaper = {
  title: "Reading on paper & screens: 50% of {cases}",
  authors: ["Anne Mangen", "Bente R. Walgermo"],
  year: 2013,
  venue: "International Journal of Educational Research",
  doi: "10.1016/j.ijer.2012.12.002",
  url: null,
  abstract: "Tenth graders read texts.",
  kind: "article",
  citations: 900,
  impact: "상위 1%",
  summary: { one_line: "종이가 화면보다 낫다", participants: "10학년 72명", design: "실험", findings: "종이 집단 우세", implications: "평가 매체 고려", keywords: ["reading", "screen"], study_type: "실험·준실험", levels: ["중등"], fields: [], suggested_field: "" },
  subtopic: "매체 효과",
  fields: ["국어교육"],
  notes: ["문항 분류에 활용"],
  status: "읽음",
  starred: true,
};
const ko: ExportPaper = { title: "디지털 텍스트 읽기 평가에 대한 일고찰", authors: ["옥 현진"], year: 2013, venue: "새국어교육", doi: null, url: "https://example.kr/a", abstract: null, kind: "book-chapter" };

describe("BibTeX", () => {
  it("영문 성+연도+제목 낱말로 키를 만들고, 한글은 번호 키, 겹치면 a·b", () => {
    expect(citeKeys([en, ko, en])).toEqual(["mangen2013reading", "paper22013", "mangen2013readinga"]);
  });

  it("특수 문자를 이스케이프하고 한글 이름은 중괄호로 감싼다", () => {
    const b = bibtex([en, ko]);
    expect(b).toContain("@article{mangen2013reading,");
    expect(b).toContain("title = {{Reading on paper \\& screens: 50\\% of \\{cases\\}}}");
    expect(b).toContain("author = {Mangen, Anne and Walgermo, Bente R.}");
    expect(b).toContain("doi = {10.1016/j.ijer.2012.12.002}");
    expect(b).toContain("@incollection{paper22013,");
    expect(b).toContain("author = {{옥현진}}");
    expect(b).toContain("booktitle = {새국어교육}");
  });
});

describe("RIS", () => {
  it("한 논문이 TY로 시작해 ER로 끝나고, 저자·키워드·메모를 줄마다 넣는다", () => {
    const r = ris([en, ko]);
    const first = r.split("\r\n\r\n")[0].split("\r\n");
    expect(first[0]).toBe("TY  - JOUR");
    expect(first).toContain("AU  - Mangen, Anne");
    expect(first).toContain("KW  - screen");
    expect(first).toContain("N1  - 문항 분류에 활용");
    expect(first.at(-1)).toBe("ER  - ");
    expect(r).toContain("TY  - CHAP");
    expect(r).toContain("AU  - 옥 현진");
  });
});

describe("CSV", () => {
  it("엑셀용 BOM을 붙이고, 쉼표·따옴표가 있는 칸을 감싼다", () => {
    const c = csv([{ ...en, title: 'He said "hi", ok' }]);
    expect(c.startsWith("﻿소주제,제목,")).toBe(true);
    expect(c).toContain('"He said ""hi"", ok"');
    expect(c).toContain("Anne Mangen; Bente R. Walgermo");
    expect(c).toContain("★");
  });
});

describe("Markdown", () => {
  it("소주제별 제목 아래 APA 인용과 요약·메모를 정리한다", () => {
    const m = markdown({ title: "학위논문", question: "디지털 읽기 평가는?", groups: [{ name: "매체 효과", papers: [en] }, { name: "빈 소주제", papers: [] }] });
    expect(m).toContain("# 학위논문");
    expect(m).toContain("**연구 질문** 디지털 읽기 평가는?");
    expect(m).toContain("## 매체 효과 (1편)");
    expect(m).toContain("### Mangen, A., & Walgermo, B. R. (2013).");
    expect(m).toContain("- **한 줄 요약** 종이가 화면보다 낫다");
    expect(m).toContain("- **메모** 문항 분류에 활용");
    expect(m).not.toContain("빈 소주제");
  });
});
