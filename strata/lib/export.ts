import type { SummaryData } from "@/lib/types";

interface CiteInput {
  authors: string[];
  year: number | null;
  title: string;
  venue: string | null;
  doi: string | null;
  url?: string | null;
}

/** "Anne Mangen" → "Mangen, A." (한글 이름은 그대로) */
function apaName(n: string): string {
  if (/[가-힣]/.test(n)) return n.replace(/\s+/g, "");
  const parts = n.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts.pop()!;
  return `${last}, ${parts.map((p) => `${p[0].toUpperCase()}.`).join(" ")}`;
}

function apaAuthors(a: string[]): string {
  const names = a.map(apaName);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(", ")}, ... ${names[names.length - 1]}`;
}

export function apa(p: CiteInput): string {
  const who = apaAuthors(p.authors);
  const link = p.doi ? ` https://doi.org/${p.doi}` : p.url ? ` ${p.url}` : "";
  return `${who ? who + " " : ""}(${p.year ?? "n.d."}). ${p.title}.${p.venue ? ` ${p.venue}.` : ""}${link}`.trim();
}

const cell = (s: string | null | undefined) => (s ?? "").replace(/[\t\n\r]+/g, " ").trim();

/** 한글·엑셀에 바로 붙여넣을 수 있는 탭 구분 표 */
export function tsv(rows: { subtopic: string; cite: CiteInput; impact: string; summary: SummaryData | null }[]): string {
  const head = ["소주제", "논문", "영향력", "대상", "설계", "주요 결과", "시사점"].join("\t");
  const body = rows.map((r) => {
    const s = r.summary;
    const short = `${r.cite.authors[0]?.split(" ").pop() ?? ""}${r.cite.authors.length > 1 ? " 외" : ""} (${r.cite.year ?? "n.d."}) ${r.cite.title}`;
    return [r.subtopic, short, r.impact, s?.participants, s?.design, s?.findings, s?.implications].map(cell).join("\t");
  });
  return [head, ...body].join("\n");
}
