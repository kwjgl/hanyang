import { describe, expect, it } from "vitest";
import { bodyForAi, detectPageOffset, findDoi, locateQuote, looksScanned, pageTextFromItems, splitReferences } from "@/lib/pdf-text";

const item = (str: string, x: number, y: number, width = str.length * 5, size = 10, hasEOL = false) => ({ str, transform: [size, 0, 0, size, x, y], width, height: size, hasEOL });

describe("pageTextFromItems", () => {
  it("joins pieces on a line, spaces only at gaps, and breaks lines by height", () => {
    const t = pageTextFromItems([item("디", 0, 700, 10), item("지", 10, 700, 10), item("털", 20, 700, 10), item("읽기", 35, 700, 20), item("두 번째 줄", 0, 680)]);
    expect(t).toBe("디지털 읽기\n두 번째 줄");
  });
  it("respects end-of-line marks", () => {
    expect(pageTextFromItems([item("first", 0, 700, 25, 10, true), item("second", 0, 700)])).toBe("first\nsecond");
  });
});

const page = (no: number | null, body: string, head = "국어교육학연구 제50집") => [no ? `${head} ${no}` : head, body, "본문이 이어진다.", no ? String(no) : ""].join("\n");

describe("detectPageOffset", () => {
  it("finds printed journal page numbers", () => {
    const pages = [245, 246, 247, 248, 249].map((n) => page(n, "내용"));
    expect(detectPageOffset(pages)).toBe(244);
  });
  it("returns 0 when the PDF starts at page 1 and null when there are no numbers", () => {
    expect(detectPageOffset(["1\n가", "2\n나", "3\n다"])).toBe(0);
    expect(detectPageOffset(["가\n나", "다\n라", "마\n바"])).toBeNull();
  });
  it("ignores years and one-off numbers", () => {
    expect(detectPageOffset(["2023\n제목", "본문 12\n끝", "다른 쪽\n끝"])).toBeNull();
  });
});

describe("helpers", () => {
  it("spots scanned PDFs", () => {
    expect(looksScanned(["", " ", "3"])).toBe(true);
    expect(looksScanned(["가".repeat(500), "나".repeat(400)])).toBe(false);
  });
  it("finds a DOI", () => {
    expect(findDoi("DOI: https://doi.org/10.20880/kler.2023.58.2.245.")).toBe("10.20880/kler.2023.58.2.245");
    expect(findDoi("no doi here")).toBeNull();
  });
  it("cuts references from the back half only", () => {
    const pages = ["서론\n참고문헌 검토 방법을 설명한다", "본론", "결론\n\n참고문헌\n김철수(2020). 제목.", "Smith, J. (2019). Title."];
    const r = splitReferences(pages);
    expect(r.refsAt).toBe(2);
    expect(r.body).toEqual(["서론\n참고문헌 검토 방법을 설명한다", "본론", "결론"]);
    expect(r.refs).toContain("김철수(2020)");
    expect(r.refs).toContain("Smith, J.");
    expect(splitReferences(["a", "b", "c\nREFERENCES\nx"]).refsAt).toBe(2);
    expect(splitReferences(["References\nx", "b", "c"]).refsAt).toBeNull();
  });
  it("labels pages for the AI and cuts long text at page boundaries", () => {
    const r = bodyForAi(["가".repeat(100), "나".repeat(100), "다".repeat(100)], 244, 230);
    expect(r.text.startsWith("[p.245]\n")).toBe(true);
    expect(r.text).toContain("[p.246]");
    expect(r.text).not.toContain("[p.247]");
    expect(r).toMatchObject({ firstPage: 245, lastPage: 246, truncated: true });
  });
  it("verifies quotes against the text, ignoring spacing and line breaks", () => {
    const pages = ["첫 쪽", "디지털 읽기에서 독자는\n정보의 신뢰성을 판단해야 한다.", "끝"];
    expect(locateQuote("디지털 읽기에서 독자는 정보의 신뢰성을 판단해야 한다.", pages, 10)).toBe(12);
    expect(locateQuote("“디지털읽기에서 독자는 정보의 신뢰성을 판단해야 한다”", pages, null)).toBe(2);
    expect(locateQuote("독자는 정보를 반드시 의심해야 한다.", pages, null)).toBeNull();
  });
});

describe("sanitizeText", () => {
  it("removes characters Postgres cannot store, keeps text and emoji", async () => {
    const { sanitizeText } = await import("@/lib/pdf-text");
    expect(sanitizeText("가\u0000나\u0007다\n라\t마")).toBe("가나다\n라\t마");
    expect(sanitizeText("a\ud800b\udc00c 😀")).toBe("abc 😀");
  });
  it("lets the cleaned text into a jsonb column", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { sanitizeText } = await import("@/lib/pdf-text");
    const db = new PGlite();
    await db.exec("create table t (pages jsonb)");
    const raw = ["국어\u0000교육\ud800학"];
    await expect(db.query("insert into t values ($1)", [JSON.stringify(raw)])).rejects.toThrow();
    await db.query("insert into t values ($1)", [JSON.stringify(raw.map(sanitizeText))]);
    expect((await db.query<{ p: string }>("select pages->>0 as p from t")).rows[0].p).toBe("국어교육학");
  });
  it("cleans text built from pdf.js items", () => {
    expect(pageTextFromItems([item("국어\u0000교육", 0, 700)])).toBe("국어교육");
  });
});
