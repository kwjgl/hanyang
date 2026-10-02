import { cleanTitle, normalizeDoi, stripTags, titleKey } from "@/lib/text";
import type { Candidate, SearchPage } from "@/lib/types";
import { fetchJson } from "./http";

const BASE = "https://api.ies.ed.gov/eric/";
const FIELDS = "id,title,author,source,publicationdateyear,description,peerreviewed,educationlevel,url,e_fulltextauth,publicationtype";

export interface EricDoc {
  id: string;
  title?: string | null;
  author?: string[] | null;
  source?: string | null;
  publicationdateyear?: number | string | null;
  description?: string | null;
  peerreviewed?: string | null;
  educationlevel?: string[] | null;
  url?: string | null;
  e_fulltextauth?: number | string | null;
  publicationtype?: string[] | null;
}

function kindOf(d: EricDoc): string | null {
  const t = (d.publicationtype ?? []).join(" ").toLowerCase();
  if (t.includes("dissertation")) return "dissertation";
  // ERIC은 학술지 논문에도 "Reports - Research"를 함께 붙인다. 학술지 논문이 먼저다.
  if (t.includes("journal articles")) return t.includes("information analyses") ? "review" : "article";
  if (t.includes("report")) return "report";
  if (t.includes("book")) return "book-chapter";
  if (t.includes("review")) return "review";
  return "article";
}

/** ERIC 저자는 "Kim, Minji" 형식이다. 다른 출처와 맞춰 "Minji Kim"으로 바꾼다. */
const flipName = (n: string) => {
  const [last, first] = n.split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : last;
};

export function parseEricDoc(d: EricDoc): Candidate | null {
  const title = cleanTitle(d.title);
  if (!title) return null;
  const doi = normalizeDoi(d.url);
  const year = d.publicationdateyear ? Number(d.publicationdateyear) || null : null;
  const fulltext = String(d.e_fulltextauth ?? "") === "1";
  return {
    key: doi ? `doi:${doi}` : `t:${titleKey(title)}:${year ?? ""}`,
    doi,
    title,
    authors: (d.author ?? []).map(flipName),
    year,
    venue: d.source ?? null,
    abstract: stripTags(d.description),
    abstractSource: d.description ? "eric" : null,
    citations: null,
    url: doi ? `https://doi.org/${doi}` : `https://eric.ed.gov/?id=${d.id}`,
    oaUrl: fulltext && d.id.startsWith("ED") ? `https://files.eric.ed.gov/fulltext/${d.id}.pdf` : null,
    lang: "en",
    kind: kindOf(d),
    ids: { eric: d.id },
    sources: ["eric"],
    impact: {},
    eduLevel: d.educationlevel ?? undefined,
    // ERIC은 교육 문헌만 모은 곳이다
    domain: "in",
  };
}

export async function searchEric(term: string, opts: { rows?: number; page?: number } = {}): Promise<SearchPage> {
  const rows = opts.rows ?? 100;
  const start = ((opts.page ?? 1) - 1) * rows;
  const params = new URLSearchParams({ search: term, format: "json", rows: String(rows), start: String(start), fields: FIELDS });
  const data = await fetchJson<{ response?: { numFound?: number; docs?: EricDoc[] } }>("ERIC", `${BASE}?${params}`);
  return { items: (data.response?.docs ?? []).map(parseEricDoc).filter((c): c is Candidate => !!c), total: data.response?.numFound ?? null };
}
