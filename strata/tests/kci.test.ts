// KCI 논문정보 서비스(공공데이터포털): 응답 읽기, 오류 문장, 검색어 쪼개기, 검색 계획을 검증한다.
// 응답 예시는 한국연구재단 기술문서(KCI 논문정보 서비스 17번 "KCI논문 정보 조회")의 예제를 옮긴 것이다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "@/lib/sources/http";
import { kciKey, parseKciXml, searchKci, yearFromTheme } from "@/lib/sources/kci";
import { kciQueries, planTasks } from "@/lib/search/run";

const sample = `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE</resultMsg></header>
<body><items><item><NUM>1</NUM><ARTI_ID>ART001756000</ARTI_ID>
<ARTI_KOR_TITL>디지털 텍스트 읽기 능력과 디지털 텍스트 읽기 평가에 대한 일고찰</ARTI_KOR_TITL>
<KOR_ABST>디지털 기술의 발달로 인해 디지털 텍스트 읽기 능력의 중요성이 대두되었다.</KOR_ABST>
<KOR_KEYW>디지털 읽기, 평가</KOR_KEYW><DOI>10.1234/ABC.2013.1</DOI>
<KCI_THEMEID_TMPL>001237201303001</KCI_THEMEID_TMPL></item>
<item><NUM>2</NUM><ARTI_ID>ART000954474</ARTI_ID><ARTI_KOR_TITL/><ARTI_ENG_TITL>Reading &amp; Assessment</ARTI_ENG_TITL><KCI_THEMEID_TMPL>abc</KCI_THEMEID_TMPL></item>
</items><totalCount>2</totalCount><recordCnt>10</recordCnt><pageNo>1</pageNo></body></response>`;

describe("KCI 응답 읽기", () => {
  it("제목·초록·DOI·연도를 읽고, 국문 제목이 없으면 영문 제목을 쓴다", () => {
    const r = parseKciXml(sample);
    expect(r.total).toBe(2);
    const [a, b] = r.items;
    expect(a.title).toBe("디지털 텍스트 읽기 능력과 디지털 텍스트 읽기 평가에 대한 일고찰");
    expect(a.abstract).toContain("디지털 기술의 발달");
    expect(a.doi).toBe("10.1234/abc.2013.1");
    expect(a.year).toBe(2013);
    expect(a.sources).toEqual(["kci"]);
    expect(a.lang).toBe("ko");
    expect(b.title).toBe("Reading & Assessment");
    expect(b.year).toBeNull();
    expect(b.url).toContain("ART000954474");
  });

  it("한 건만 오면 배열이 아니어도 읽는다", () => {
    const one = sample.replace(/<item><NUM>2<\/NUM>[\s\S]*?<\/item>/, "");
    expect(parseKciXml(one).items).toHaveLength(1);
  });

  it("인증키 오류를 알아들을 수 있는 말로 바꾼다", () => {
    const err = `<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
    expect(() => parseKciXml(err)).toThrow(SourceError);
    expect(() => parseKciXml(err)).toThrow(/인증키가 등록되지 않았습니다/);
  });

  it("연도는 테마 ID의 학술지 ID 뒤 네 자리", () => {
    expect(yearFromTheme("001237200203001")).toBe(2002);
    expect(yearFromTheme(null)).toBeNull();
  });
});

describe("KCI 검색", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("키가 없으면 KCI를 묻지 않는다", () => {
    vi.stubEnv("KCI_SERVICE_KEY", "");
    const tasks = planTasks({ terms: ["디지털 읽기 평가"], sources: ["kci", "crossref"], scope: "all" });
    expect(tasks.map((t) => t.source)).toEqual(["crossref"]);
  });

  it("세 낱말 이상이면 붙은 두 낱말씩도 묻고, 영어 검색어는 KCI에 보내지 않는다", () => {
    vi.stubEnv("KCI_SERVICE_KEY", "abc");
    expect(kciQueries("디지털 읽기 평가").map((q) => q.q)).toEqual(["디지털 읽기 평가", "디지털 읽기", "읽기 평가"]);
    const tasks = planTasks({ terms: ["디지털 읽기 평가를", "digital reading"], sources: ["kci"], scope: "all" });
    expect(tasks.map((t) => t.term)).toEqual(["디지털 읽기 평가", "디지털 읽기", "읽기 평가"]);
    expect(tasks[0].weight).toBeGreaterThan(tasks[1].weight);
  });

  it("Encoding 키를 넣어도 풀어서 한 번만 인코딩해 보낸다", async () => {
    vi.stubEnv("KCI_SERVICE_KEY", "ab%2Bc%3D%3D");
    expect(kciKey()).toBe("ab+c==");
    let asked = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked = url;
        return new Response(sample);
      }),
    );
    const r = await searchKci("읽기 평가", { page: 2 });
    const u = new URL(asked);
    expect(u.searchParams.get("serviceKey")).toBe("ab+c==");
    expect(u.searchParams.get("artiNm")).toBe("읽기 평가");
    expect(u.searchParams.get("pageNo")).toBe("2");
    expect(u.pathname).toContain("openApiM310List");
    expect(r.items).toHaveLength(2);
  });
});
