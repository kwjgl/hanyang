import { cleanTitle, normalizeDoi, titleKey } from "@/lib/text";
import type { Candidate, SearchPage } from "@/lib/types";
import { fetchJson, SourceError } from "./http";

/**
 * 구글 학술검색 결과 (SerpApi를 거쳐 받는다).
 * 키: Vercel 환경 변수 SERPAPI_KEY. 검색 한 번에 SerpApi 1회를 쓴다 (무료 월 250회, 같은 검색을 1시간 안에 다시 하면 세지 않음).
 * 구글 결과에는 초록 전문이 없고 짧은 발췌(snippet)만 온다.
 */
const BASE = "https://serpapi.com";

export function serpKey(): string | null {
  let v = (process.env.SERPAPI_KEY ?? "").trim();
  if (v.startsWith("SERPAPI_KEY=")) v = v.slice(12).trim();
  v = v.replace(/^["']|["']$/g, "").trim();
  return v || null;
}

export interface ScholarResult {
  position?: number;
  title?: string;
  result_id?: string;
  link?: string;
  snippet?: string;
  type?: string;
  publication_info?: { summary?: string; authors?: { name?: string }[] };
  inline_links?: { cited_by?: { total?: number } };
  resources?: { title?: string; file_format?: string; link?: string }[];
}

/**
 * "LH Schellekens, HGJ Bok… - Studies in Educational …, 2021 - Elsevier" 같은 요약 줄을 저자·학술지·연도로 나눈다.
 * 가운데 칸이 "2008"처럼 연도뿐이면 학술지는 없다.
 */
export function parseSummary(summary: string | undefined) {
  const parts = (summary ?? "").split(" - ").map((s) => s.trim());
  const authors = (parts[0] ?? "")
    .split(/,\s*/)
    .map((a) => a.replace(/[…]+$/, "").trim())
    .filter(Boolean);
  const mid = parts.length >= 2 ? parts[1] : "";
  const ym = mid.match(/(?:^|,\s*)((?:19|20)\d{2})\s*$/);
  const year = ym ? Number(ym[1]) : null;
  const venue = (ym ? mid.slice(0, ym.index) : mid).replace(/[…,\s]+$/, "").trim() || null;
  return { authors, venue, year };
}

const KIND: Record<string, string> = { book: "book", citation: "citation" };

export function parseScholarResult(r: ScholarResult, page = 1): Candidate | null {
  const title = cleanTitle(r.title?.replace(/^\[(pdf|html|book|citation|책|인용)\]\s*/i, ""));
  if (!title) return null;
  const info = parseSummary(r.publication_info?.summary);
  const authors = r.publication_info?.authors?.map((a) => a.name ?? "").filter(Boolean);
  const doi = normalizeDoi(r.link);
  const pdf = r.resources?.find((x) => /pdf/i.test(x.file_format ?? x.title ?? ""))?.link ?? null;
  return {
    key: doi ? `doi:${doi}` : `t:${titleKey(title)}:${info.year ?? ""}`,
    doi,
    title,
    authors: authors?.length ? authors : info.authors,
    year: info.year,
    venue: info.venue,
    abstract: null,
    abstractSource: null,
    snippet: r.snippet?.trim() || null,
    citations: r.inline_links?.cited_by?.total ?? null,
    url: r.link ?? null,
    oaUrl: pdf,
    lang: null,
    kind: KIND[(r.type ?? "").toLowerCase()] ?? null,
    ids: r.result_id ? { scholar: r.result_id } : {},
    sources: ["scholar"],
    impact: {},
    // 구글이 매긴 순위 (1부터, 페이지를 넘겨도 이어진다)
    gsRank: (r.position ?? 0) + 1 + (page - 1) * 20,
  };
}

export async function searchScholar(term: string, opts: { page?: number; yearFrom?: number; yearTo?: number } = {}): Promise<SearchPage> {
  const key = serpKey();
  if (!key) return { items: [], total: null };
  const page = opts.page ?? 1;
  const params = new URLSearchParams({ engine: "google_scholar", q: term, hl: "ko", num: "20", start: String((page - 1) * 20), api_key: key });
  if (opts.yearFrom) params.set("as_ylo", String(opts.yearFrom));
  if (opts.yearTo) params.set("as_yhi", String(opts.yearTo));
  const data = await fetchJson<{ error?: string; organic_results?: ScholarResult[]; search_information?: { total_results?: number } }>(
    "구글 학술검색",
    `${BASE}/search.json?${params}`,
    {},
    25_000,
  );
  if (data.error) {
    // 결과가 없을 때도 error로 온다
    if (/hasn't returned any results/i.test(data.error)) return { items: [], total: 0 };
    throw new SourceError("구글 학술검색", /run out|limit/i.test(data.error) ? "이번 달 무료 횟수를 다 썼습니다" : data.error);
  }
  return {
    items: (data.organic_results ?? []).map((r) => parseScholarResult(r, page)).filter((c): c is Candidate => !!c),
    total: data.search_information?.total_results ?? null,
  };
}

/** 이번 달 남은 횟수 (SerpApi 계정 정보, 이 조회는 횟수를 쓰지 않는다) */
export async function scholarAccount(): Promise<{ left: number | null; used: number | null; limit: number | null } | null> {
  const key = serpKey();
  if (!key) return null;
  const a = await fetchJson<{ plan_searches_left?: number; this_month_usage?: number; searches_per_month?: number; total_searches_left?: number }>(
    "구글 학술검색",
    `${BASE}/account.json?api_key=${encodeURIComponent(key)}`,
  );
  return { left: a.total_searches_left ?? a.plan_searches_left ?? null, used: a.this_month_usage ?? null, limit: a.searches_per_month ?? null };
}
