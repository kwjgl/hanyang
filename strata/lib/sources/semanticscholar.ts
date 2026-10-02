import { cleanTitle, normalizeDoi, stripTags, titleKey } from "@/lib/text";
import type { Candidate, SearchPage } from "@/lib/types";
import { domainOfS2 } from "@/lib/search/domain";
import { fetchJson } from "./http";

const BASE = "https://api.semanticscholar.org";
const FIELDS =
  "title,authors,year,venue,abstract,citationCount,influentialCitationCount,externalIds,openAccessPdf,url,publicationTypes,s2FieldsOfStudy";

export interface S2Paper {
  paperId: string;
  title?: string | null;
  authors?: { name?: string | null }[];
  year?: number | null;
  venue?: string | null;
  abstract?: string | null;
  citationCount?: number | null;
  influentialCitationCount?: number | null;
  externalIds?: Record<string, string | number> | null;
  openAccessPdf?: { url?: string | null } | null;
  url?: string | null;
  publicationTypes?: string[] | null;
  tldr?: { text?: string | null } | null;
  s2FieldsOfStudy?: { category?: string | null }[] | null;
}

const headers = (): Record<string, string> => (process.env.S2_API_KEY ? { "x-api-key": process.env.S2_API_KEY } : {});

function kindOf(types: string[] | null | undefined): string | null {
  if (!types?.length) return null;
  if (types.includes("Review") || types.includes("MetaAnalysis")) return "review";
  if (types.includes("Book") || types.includes("BookSection")) return "book-chapter";
  return "article";
}

export function parseS2Paper(p: S2Paper): Candidate | null {
  const title = cleanTitle(p.title);
  if (!title) return null;
  const doi = normalizeDoi(p.externalIds?.DOI ? String(p.externalIds.DOI) : null);
  return {
    key: doi ? `doi:${doi}` : `t:${titleKey(title)}:${p.year ?? ""}`,
    doi,
    title,
    authors: (p.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
    year: p.year ?? null,
    venue: p.venue || null,
    abstract: stripTags(p.abstract),
    abstractSource: p.abstract ? "s2" : null,
    citations: p.citationCount ?? null,
    url: doi ? `https://doi.org/${doi}` : (p.url ?? null),
    oaUrl: p.openAccessPdf?.url ?? null,
    lang: null,
    kind: kindOf(p.publicationTypes),
    ids: { s2: p.paperId },
    sources: ["s2"],
    impact: { influential: p.influentialCitationCount ?? null },
    domain: domainOfS2(p.s2FieldsOfStudy?.map((f) => f.category)),
  };
}

export async function searchS2(term: string, opts: { yearFrom?: number; yearTo?: number; limit?: number; page?: number } = {}): Promise<SearchPage> {
  const limit = opts.limit ?? 100;
  // Semantic Scholar 검색은 앞쪽 1,000건까지만 넘겨볼 수 있다
  const offset = ((opts.page ?? 1) - 1) * limit;
  if (offset + limit > 1000) return { items: [], total: null };
  const params = new URLSearchParams({ query: term, limit: String(limit), offset: String(offset), fields: FIELDS });
  if (opts.yearFrom || opts.yearTo) params.set("year", `${opts.yearFrom ?? ""}-${opts.yearTo ?? ""}`);
  const data = await fetchJson<{ total?: number; data?: S2Paper[] }>("Semantic Scholar", `${BASE}/graph/v1/paper/search?${params}`, {
    headers: headers(),
  });
  return { items: (data.data ?? []).map(parseS2Paper).filter((c): c is Candidate => !!c), total: data.total ?? null };
}

/** 초록이 없을 때 DOI로 다시 찾는다. 초록이 없으면 TLDR(한 줄 요약)이라도 돌려준다. */
export async function s2AbstractByDoi(doi: string): Promise<{ abstract: string | null; tldr: string | null; influential: number | null }> {
  try {
    const p = await fetchJson<S2Paper>(
      "Semantic Scholar",
      `${BASE}/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=abstract,tldr,influentialCitationCount`,
      { headers: headers() },
    );
    return { abstract: p.abstract || null, tldr: p.tldr?.text || null, influential: p.influentialCitationCount ?? null };
  } catch {
    return { abstract: null, tldr: null, influential: null };
  }
}

/** 비슷한 논문 추천 */
export async function s2Recommendations(doi: string, limit = 30): Promise<Candidate[]> {
  const data = await fetchJson<{ recommendedPapers?: S2Paper[] }>(
    "Semantic Scholar",
    `${BASE}/recommendations/v1/papers/forpaper/DOI:${encodeURIComponent(doi)}?limit=${limit}&fields=${FIELDS}`,
    { headers: headers() },
  );
  return (data.recommendedPapers ?? []).map(parseS2Paper).filter((c): c is Candidate => !!c);
}
