import { cleanTitle, normalizeDoi, stripTags, titleKey } from "@/lib/text";
import type { Candidate, SearchPage } from "@/lib/types";
import { fetchJson } from "./http";

const BASE = "https://api.crossref.org";
const SELECT = "DOI,title,author,issued,container-title,abstract,is-referenced-by-count,URL,language,type";

export interface CrossrefItem {
  DOI: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  issued?: { "date-parts"?: (number | null)[][] };
  "container-title"?: string[];
  abstract?: string;
  "is-referenced-by-count"?: number;
  URL?: string;
  language?: string;
  type?: string;
}

const mailto = () => (process.env.OPENALEX_EMAIL ? `&mailto=${encodeURIComponent(process.env.OPENALEX_EMAIL)}` : "");

function kindOf(type: string | undefined): string | null {
  if (!type) return null;
  if (type === "journal-article") return "article";
  if (type === "dissertation") return "dissertation";
  if (type === "report") return "report";
  if (type.startsWith("book")) return "book-chapter";
  return type;
}

export function parseCrossrefItem(it: CrossrefItem): Candidate | null {
  // 국내 학술지는 제목 배열에 국문·영문이 함께 오는 경우가 많다. 첫 번째(원제)를 쓴다.
  const title = cleanTitle(it.title?.[0]);
  if (!title) return null;
  const doi = normalizeDoi(it.DOI);
  const year = it.issued?.["date-parts"]?.[0]?.[0] ?? null;
  const abstract = stripTags(it.abstract);
  return {
    key: doi ? `doi:${doi}` : `t:${titleKey(title)}:${year ?? ""}`,
    doi,
    title,
    authors: (it.author ?? [])
      .map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" "))
      .filter(Boolean),
    year,
    venue: it["container-title"]?.[0] ?? null,
    abstract,
    abstractSource: abstract ? "crossref" : null,
    citations: it["is-referenced-by-count"] ?? null,
    url: doi ? `https://doi.org/${doi}` : (it.URL ?? null),
    oaUrl: null,
    lang: it.language ?? null,
    kind: kindOf(it.type),
    ids: { crossref: doi ?? undefined },
    sources: ["crossref"],
    impact: {},
  };
}

export async function searchCrossref(term: string, opts: { rows?: number; yearFrom?: number; page?: number } = {}): Promise<SearchPage> {
  const rows = opts.rows ?? 60;
  const params = new URLSearchParams({ "query.bibliographic": term, rows: String(rows), offset: String(((opts.page ?? 1) - 1) * rows), select: SELECT });
  if (opts.yearFrom) params.set("filter", `from-pub-date:${opts.yearFrom}`);
  const data = await fetchJson<{ message?: { "total-results"?: number; items?: CrossrefItem[] } }>("Crossref", `${BASE}/works?${params}${mailto()}`);
  return { items: (data.message?.items ?? []).map(parseCrossrefItem).filter((c): c is Candidate => !!c), total: data.message?.["total-results"] ?? null };
}

export async function crossrefByDoi(doi: string): Promise<Candidate | null> {
  try {
    const data = await fetchJson<{ message: CrossrefItem }>("Crossref", `${BASE}/works/${encodeURIComponent(doi)}?${mailto().slice(1)}`);
    return parseCrossrefItem(data.message);
  } catch {
    return null;
  }
}
