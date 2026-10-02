import { XMLParser } from "fast-xml-parser";
import { cleanTitle, normalizeDoi, stripTags, titleKey } from "@/lib/text";
import type { Candidate, SearchPage } from "@/lib/types";
import { fetchText, SourceError } from "./http";

/**
 * 한국연구재단 KCI 논문정보 서비스 (공공데이터포털).
 * 제목(논문명)으로 찾고, 국문·영문 초록과 키워드, DOI를 돌려준다. 저자·학술지 이름은 이 응답에 없다.
 * 키: Vercel 환경 변수 KCI_SERVICE_KEY (공공데이터포털 "일반 인증키(Decoding)")
 */
const BASE = "https://apis.data.go.kr/B552540/KCIOpenApi/artiInfo/openApiM310List";

export function kciKey(): string | null {
  let v = (process.env.KCI_SERVICE_KEY ?? "").trim();
  if (v.startsWith("KCI_SERVICE_KEY=")) v = v.slice(16).trim();
  v = v.replace(/^["']|["']$/g, "").trim();
  if (!v) return null;
  // Encoding 키(%2B 등)를 넣었어도 한 번 풀어서 쓴다 (URLSearchParams가 다시 인코딩한다)
  if (/%[0-9A-F]{2}/i.test(v)) {
    try {
      v = decodeURIComponent(v);
    } catch {}
  }
  return v;
}

export interface KciItem {
  ARTI_ID?: string;
  ARTI_KOR_TITL?: string;
  ARTI_FOLA_TITL?: string;
  ARTI_ENG_TITL?: string;
  KOR_ABST?: string;
  FOLA_ABST?: string;
  ENG_ABST?: string;
  KOR_KEYW?: string;
  DOI?: string;
  KCI_THEMEID_TMPL?: string | number;
  URL?: string;
  ISSN?: string | number;
}

const str = (v: unknown) => (v == null ? "" : String(v).trim());

/** "001237200203001" → 2002 (학술지ID 6자리 + 연도 4자리 + …). 모르면 null */
export function yearFromTheme(theme: unknown): number | null {
  const m = str(theme).match(/^\d{6}((?:19|20)\d{2})/);
  return m ? Number(m[1]) : null;
}

export function parseKciItem(it: KciItem): Candidate | null {
  const title = cleanTitle(str(it.ARTI_KOR_TITL) || str(it.ARTI_FOLA_TITL) || str(it.ARTI_ENG_TITL));
  if (!title) return null;
  const doi = normalizeDoi(str(it.DOI));
  const year = yearFromTheme(it.KCI_THEMEID_TMPL);
  const abstract = stripTags(str(it.KOR_ABST) || str(it.FOLA_ABST) || str(it.ENG_ABST));
  const id = str(it.ARTI_ID);
  return {
    key: doi ? `doi:${doi}` : `t:${titleKey(title)}:${year ?? ""}`,
    doi,
    title,
    authors: [],
    year,
    venue: null,
    abstract,
    abstractSource: abstract ? "kci" : null,
    citations: null,
    url: doi ? `https://doi.org/${doi}` : id ? `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${id}` : str(it.URL) || null,
    oaUrl: null,
    lang: "ko",
    kind: "article",
    ids: id ? { kci: id } : {},
    sources: ["kci"],
    impact: {},
  };
}

/** 공공데이터포털 오류 코드 → 알아들을 수 있는 말 */
function portalError(code: string, msg: string): string {
  if (code === "30" || /NOT_REGISTERED/i.test(msg)) return "인증키가 등록되지 않았습니다 (발급 직후면 1~2시간 뒤 다시 해 보세요. Decoding 키를 넣었는지도 확인해 주세요)";
  if (code === "22" || /LIMITED_NUMBER/i.test(msg)) return "오늘 쓸 수 있는 호출 수를 넘었습니다";
  if (code === "20" || /ACCESS_DENIED/i.test(msg)) return "이 API 사용 승인이 안 되어 있습니다";
  if (code === "31" || /DEADLINE/i.test(msg)) return "인증키 사용 기간이 끝났습니다";
  return `오류 ${code || ""} ${msg}`.trim();
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

export function parseKciXml(xml: string): SearchPage {
  const doc = parser.parse(xml) as Record<string, any>;
  const err = doc.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (err) throw new SourceError("KCI", portalError(str(err.returnReasonCode), str(err.returnAuthMsg) || str(err.errMsg)));
  const res = doc.response ?? {};
  const code = str(res.header?.resultCode);
  if (code && code !== "00") throw new SourceError("KCI", portalError(code, str(res.header?.resultMsg)));
  const raw = res.body?.items?.item;
  const items: KciItem[] = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const total = Number(str(res.body?.totalCount) || NaN);
  return { items: items.map(parseKciItem).filter((c): c is Candidate => !!c), total: Number.isFinite(total) ? total : null };
}

/** 제목(논문명)에 검색어가 들어간 KCI 논문 */
export async function searchKci(term: string, opts: { page?: number; perPage?: number } = {}): Promise<SearchPage> {
  const key = kciKey();
  if (!key) return { items: [], total: null };
  const params = new URLSearchParams({ serviceKey: key, pageNo: String(opts.page ?? 1), recordCnt: String(opts.perPage ?? 30), artiNm: term });
  return parseKciXml(await fetchText("KCI", `${BASE}?${params}`, 20_000));
}
