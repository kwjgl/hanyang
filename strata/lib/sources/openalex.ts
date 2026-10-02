import { normalizeDoi, reconstructAbstract, titleKey } from "@/lib/text";
import type { Candidate, SearchPage } from "@/lib/types";
import { fetchJson } from "./http";

const BASE = "https://api.openalex.org";
const SELECT = [
  "id",
  "doi",
  "display_name",
  "publication_year",
  "authorships",
  "primary_location",
  "cited_by_count",
  "open_access",
  "abstract_inverted_index",
  "language",
  "type",
  "citation_normalized_percentile",
  "fwci",
].join(",");

export interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  authorships?: { author?: { display_name?: string | null } | null }[];
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null } | null;
  } | null;
  cited_by_count?: number | null;
  open_access?: { oa_url?: string | null } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  language?: string | null;
  type?: string | null;
  citation_normalized_percentile?: { value?: number | null } | null;
  fwci?: number | null;
}

function withAuth(params: URLSearchParams) {
  if (process.env.OPENALEX_EMAIL) params.set("mailto", process.env.OPENALEX_EMAIL);
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  return params;
}

/** OpenAlex 백분위는 0–1 값이다. 0–100으로 맞춘다. */
function percentile(v: number | null | undefined): number | null {
  if (v == null) return null;
  return v <= 1 ? Math.round(v * 1000) / 10 : v;
}

export function parseOpenAlexWork(w: OpenAlexWork): Candidate | null {
  const title = w.display_name?.trim();
  if (!title) return null;
  const doi = normalizeDoi(w.doi);
  const shortId = w.id.replace("https://openalex.org/", "");
  const abstract = reconstructAbstract(w.abstract_inverted_index);
  return {
    key: doi ? `doi:${doi}` : `t:${titleKey(title)}:${w.publication_year ?? ""}`,
    doi,
    title,
    authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    abstract,
    abstractSource: abstract ? "openalex" : null,
    citations: w.cited_by_count ?? null,
    url: doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url ?? w.id),
    oaUrl: w.open_access?.oa_url ?? null,
    lang: w.language ?? null,
    kind: w.type ?? null,
    ids: { openalex: shortId },
    sources: ["openalex"],
    impact: { pct: percentile(w.citation_normalized_percentile?.value), fwci: w.fwci ?? null },
  };
}

export async function searchOpenAlex(
  term: string,
  opts: { yearFrom?: number; yearTo?: number; koreanOnly?: boolean; perPage?: number; page?: number } = {},
): Promise<SearchPage> {
  const filters: string[] = [];
  if (opts.yearFrom || opts.yearTo) filters.push(`publication_year:${opts.yearFrom ?? ""}-${opts.yearTo ?? ""}`);
  if (opts.koreanOnly) filters.push("language:ko");
  const params = withAuth(
    new URLSearchParams({ search: term, "per-page": String(opts.perPage ?? 100), page: String(opts.page ?? 1), select: SELECT }),
  );
  if (filters.length) params.set("filter", filters.join(","));
  const data = await fetchJson<{ meta?: { count?: number }; results: OpenAlexWork[] }>("OpenAlex", `${BASE}/works?${params}`);
  return { items: (data.results ?? []).map(parseOpenAlexWork).filter((c): c is Candidate => !!c), total: data.meta?.count ?? null };
}

export async function openAlexByDoi(doi: string): Promise<Candidate | null> {
  const params = withAuth(new URLSearchParams({ select: SELECT }));
  try {
    const w = await fetchJson<OpenAlexWork>("OpenAlex", `${BASE}/works/doi:${encodeURIComponent(doi)}?${params}`);
    return parseOpenAlexWork(w);
  } catch {
    return null;
  }
}

/** 이 논문을 인용한 논문 */
export async function openAlexCitedBy(openalexId: string, perPage = 50): Promise<Candidate[]> {
  const params = withAuth(
    new URLSearchParams({ filter: `cites:${openalexId}`, sort: "cited_by_count:desc", "per-page": String(perPage), select: SELECT }),
  );
  const data = await fetchJson<{ results: OpenAlexWork[] }>("OpenAlex", `${BASE}/works?${params}`);
  return (data.results ?? []).map(parseOpenAlexWork).filter((c): c is Candidate => !!c);
}

/** 이 논문의 참고문헌 */
export async function openAlexReferences(openalexId: string): Promise<Candidate[]> {
  const params = withAuth(new URLSearchParams({ select: "referenced_works" }));
  const w = await fetchJson<{ referenced_works?: string[] }>("OpenAlex", `${BASE}/works/${openalexId}?${params}`);
  const ids = (w.referenced_works ?? []).map((u) => u.replace("https://openalex.org/", "")).slice(0, 100);
  if (!ids.length) return [];
  const out: Candidate[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const p = withAuth(
      new URLSearchParams({ filter: `openalex:${ids.slice(i, i + 50).join("|")}`, "per-page": "50", select: SELECT }),
    );
    const data = await fetchJson<{ results: OpenAlexWork[] }>("OpenAlex", `${BASE}/works?${p}`);
    out.push(...(data.results ?? []).map(parseOpenAlexWork).filter((c): c is Candidate => !!c));
  }
  return out.sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0));
}

export interface WorkWithRefs {
  candidate: Candidate;
  /** 참고문헌의 OpenAlex ID (W…) */
  refs: string[];
}

/**
 * OpenAlex ID나 DOI로 여러 논문을 한꺼번에 가져온다 (50개씩 묶어서 요청).
 * withRefs면 각 논문의 참고문헌 목록도 함께 받는다.
 */
export async function openAlexWorks(q: { ids?: string[]; dois?: string[] }, withRefs = false): Promise<WorkWithRefs[]> {
  const batches: string[] = [];
  const ids = [...new Set(q.ids ?? [])];
  const dois = [...new Set(q.dois ?? [])];
  for (let i = 0; i < ids.length; i += 50) batches.push(`openalex:${ids.slice(i, i + 50).join("|")}`);
  for (let i = 0; i < dois.length; i += 50) batches.push(`doi:${dois.slice(i, i + 50).join("|")}`);
  const select = withRefs ? `${SELECT},referenced_works` : SELECT;
  const pages = await Promise.all(
    batches.map((filter) =>
      fetchJson<{ results: (OpenAlexWork & { referenced_works?: string[] })[] }>(
        "OpenAlex",
        `${BASE}/works?${withAuth(new URLSearchParams({ filter, "per-page": "50", select }))}`,
      ),
    ),
  );
  const out: WorkWithRefs[] = [];
  for (const w of pages.flatMap((p) => p.results ?? [])) {
    const candidate = parseOpenAlexWork(w);
    if (candidate) out.push({ candidate, refs: (w.referenced_works ?? []).map((u) => u.replace("https://openalex.org/", "")) });
  }
  return out;
}

/** 검색어에 맞는 논문 수를 출판 연도별로 센다 (OpenAlex 전체 집계) */
export async function openAlexYearCounts(term: string, from: number, to: number): Promise<{ counts: number[]; total: number }> {
  const params = withAuth(new URLSearchParams({ search: term, filter: `publication_year:${from}-${to}`, group_by: "publication_year" }));
  const data = await fetchJson<{ meta?: { count?: number }; group_by?: { key: string; count: number }[] }>("OpenAlex", `${BASE}/works?${params}`);
  const counts = new Array<number>(to - from + 1).fill(0);
  for (const g of data.group_by ?? []) {
    const y = Number(g.key);
    if (y >= from && y <= to) counts[y - from] = g.count;
  }
  return { counts, total: data.meta?.count ?? counts.reduce((a, b) => a + b, 0) };
}
