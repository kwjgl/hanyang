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

// ---------------------------------------------------------------- 파일로 내보내기

/** 내보낼 논문 한 편 (비교표·서재 행에서 만든다) */
export interface ExportPaper {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  kind: string | null;
  citations?: number | null;
  impact?: string;
  summary?: SummaryData | null;
  subtopic?: string | null;
  fields?: string[];
  notes?: string[];
  status?: string;
  starred?: boolean;
}

const hangul = (s: string) => /[가-힣]/.test(s);

/** "Anne Mangen" → "Mangen, Anne". 한글 이름은 나누지 않도록 중괄호로 감싼다. */
function bibName(n: string): string {
  const t = n.trim();
  if (!t) return "";
  if (hangul(t)) return `{${t.replace(/\s+/g, "")}}`;
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts.pop()!;
  return `${last}, ${parts.join(" ")}`;
}

const bibEscape = (s: string) => s.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\s+/g, " ").trim();

const BIB_TYPE: Record<string, string> = { article: "article", review: "article", book: "book", "book-chapter": "incollection", dissertation: "phdthesis", report: "techreport", preprint: "misc" };

/** 인용 키: 첫 저자 성(영문만) + 연도 + 제목 첫 낱말. 한글이면 paper + 번호. 겹치면 a, b, c… */
export function citeKeys(papers: Pick<ExportPaper, "authors" | "year" | "title">[]): string[] {
  const used = new Map<string, number>();
  return papers.map((p, i) => {
    const last = (p.authors[0] ?? "").trim().split(/\s+/).pop() ?? "";
    const ascii = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
    const word = ascii(p.title.split(/\s+/).find((w) => w.length > 3 && /^[A-Za-z]/.test(w)) ?? "");
    let base = ascii(last).toLowerCase();
    base = base ? `${base}${p.year ?? "nd"}${word.toLowerCase()}` : `paper${i + 1}${p.year ?? ""}`;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}${String.fromCharCode(96 + n)}` : base;
  });
}

export function bibtex(papers: ExportPaper[]): string {
  const keys = citeKeys(papers);
  return papers
    .map((p, i) => {
      const type = BIB_TYPE[p.kind ?? ""] ?? "article";
      const venueField = type === "incollection" ? "booktitle" : type === "phdthesis" ? "school" : type === "techreport" ? "institution" : type === "book" ? "publisher" : "journal";
      const f: [string, string | null | undefined][] = [
        ["title", `{${bibEscape(p.title)}}`],
        ["author", p.authors.length ? p.authors.map(bibName).filter(Boolean).join(" and ") : null],
        ["year", p.year ? String(p.year) : null],
        [venueField, p.venue ? bibEscape(p.venue) : null],
        ["doi", p.doi],
        ["url", p.doi ? `https://doi.org/${p.doi}` : p.url],
        ["keywords", p.summary?.keywords?.length ? bibEscape(p.summary.keywords.join(", ")) : null],
        ["abstract", p.abstract ? bibEscape(p.abstract) : null],
      ];
      const body = f
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(",\n");
      return `@${type}{${keys[i]},\n${body}\n}`;
    })
    .join("\n\n");
}

const RIS_TYPE: Record<string, string> = { article: "JOUR", review: "JOUR", book: "BOOK", "book-chapter": "CHAP", dissertation: "THES", report: "RPRT", preprint: "UNPB" };

/** EndNote · Zotero · Mendeley 가져오기용 RIS */
export function ris(papers: ExportPaper[]): string {
  const line = (tag: string, v: string | null | undefined) => (v ? `${tag}  - ${v.replace(/[\r\n]+/g, " ").trim()}` : null);
  return papers
    .map((p) =>
      [
        line("TY", RIS_TYPE[p.kind ?? ""] ?? "JOUR"),
        ...p.authors.map((a) => line("AU", hangul(a) ? a : bibName(a))),
        line("PY", p.year ? String(p.year) : null),
        line("TI", p.title),
        line("T2", p.venue),
        line("DO", p.doi),
        line("UR", p.doi ? `https://doi.org/${p.doi}` : p.url),
        line("AB", p.abstract),
        ...(p.summary?.keywords ?? []).map((k) => line("KW", k)),
        ...(p.notes ?? []).map((n) => line("N1", n)),
        "ER  - ",
      ]
        .filter(Boolean)
        .join("\r\n"),
    )
    .join("\r\n\r\n");
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 엑셀에서 한글이 깨지지 않도록 BOM을 붙인 CSV */
export function csv(papers: ExportPaper[]): string {
  const head = ["소주제", "제목", "저자", "연도", "학술지", "DOI", "영향력", "피인용", "연구 유형", "대상", "설계", "주요 결과", "시사점", "한 줄 요약", "분야", "읽기 상태", "별표", "주소"];
  const rows = papers.map((p) => [
    p.subtopic,
    p.title,
    p.authors.join("; "),
    p.year,
    p.venue,
    p.doi,
    p.impact,
    p.citations,
    p.summary?.study_type,
    p.summary?.participants,
    p.summary?.design,
    p.summary?.findings,
    p.summary?.implications,
    p.summary?.one_line,
    (p.fields ?? []).join("; "),
    p.status,
    p.starred ? "★" : "",
    p.doi ? `https://doi.org/${p.doi}` : p.url,
  ]);
  return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** 노션·옵시디언·한글에 붙여 넣기 좋은 정리 문서 */
export function markdown(doc: { title: string; question?: string | null; groups: { name: string; papers: ExportPaper[] }[] }): string {
  const out: string[] = [`# ${doc.title}`, ""];
  if (doc.question) out.push(`**연구 질문** ${doc.question}`, "");
  out.push(`_Strata에서 내보냄 · ${new Date().toLocaleDateString("ko-KR")}_`, "");
  for (const g of doc.groups) {
    if (!g.papers.length) continue;
    out.push(`## ${g.name} (${g.papers.length}편)`, "");
    for (const p of g.papers) {
      out.push(`### ${apa(p)}`, "");
      const s = p.summary;
      if (s) {
        out.push(`- **한 줄 요약** ${s.one_line}`);
        if (s.participants) out.push(`- **대상** ${s.participants}`);
        if (s.design) out.push(`- **설계** ${s.design}`);
        if (s.findings) out.push(`- **주요 결과** ${s.findings}`);
        if (s.implications) out.push(`- **시사점** ${s.implications}`);
        if (s.keywords?.length) out.push(`- **키워드** ${s.keywords.join(", ")}`);
      } else if (p.abstract) {
        out.push(`- **초록** ${p.abstract}`);
      }
      if (p.impact) out.push(`- **영향력** ${p.impact}${p.citations != null ? ` · 피인용 ${p.citations}` : ""}`);
      for (const n of p.notes ?? []) out.push(`- **메모** ${n}`);
      out.push("");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}
