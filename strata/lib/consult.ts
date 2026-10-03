import { type CitedRef, inTextCitation } from "@/lib/cite";
import { coverage, queryWords } from "@/lib/search/rank";
import { koreanSurname, romanizedHas } from "@/lib/korean-names";
import { hasHangul } from "@/lib/text";
import type { Candidate } from "@/lib/types";

/** AI가 이름을 댄 대표 문헌. 데이터베이스에서 찾아야 "확인됨"이 되고, 그때만 인용·보관할 수 있다 */
export interface ConsultWork {
  author: string;
  year: number | null;
  title: string;
  status: "verified" | "unverified";
  /** 보관한 프로젝트 표시용 자리 정보가 붙어 있을 수 있다 */
  candidate?: Candidate & { placements?: { projectId: string; projectName: string }[] };
  /** 이 프로젝트에 이미 보관한 논문이면 그 id */
  paperId?: string | null;
  /** 구글 학술검색으로도 찾아봤는지 */
  scholar?: boolean;
}

export interface ConsultTheory {
  name: string;
  summary: string;
  fit: string;
  query_en: string;
  query_ko: string;
  works: ConsultWork[];
}

export interface ConsultMsg {
  role: "user" | "assistant";
  text: string;
  at: string;
  theories?: ConsultTheory[];
  questions?: string[];
}

export interface Consult {
  id: string;
  title: string;
  messages: ConsultMsg[];
  updated_at: string;
}

/** 한 상담에서 주고받을 수 있는 최대 메시지 수 (넘으면 새 상담) */
export const MAX_MESSAGES = 40;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, "")
    .trim();

/** "Kintsch, W." · "Walter Kintsch" · "van Dijk" · "옥현진" → 비교할 성 */
export function surnameOf(name: string): string {
  const t = name.trim().split(/\s*(?:&|,?\s+and\s+|;|외|et al\.?)\s*/)[0].trim();
  if (hasHangul(t)) return t.replace(/\s+/g, "");
  if (t.includes(",")) return norm(t.split(",")[0]);
  const parts = norm(t).split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** 후보 논문의 저자 중에 이 성을 가진 사람이 있나 */
export function authorMatches(named: string, authors: string[]): boolean {
  const s = surnameOf(named);
  if (s.length < 2) return false;
  return authors.some((a) => {
    // 국내 학술지는 저자를 영문으로 올리는 일이 많다: "옥현진" ↔ "Hyunjin Ok"
    if (hasHangul(s)) return hasHangul(a) ? a.replace(/\s+/g, "").includes(s) : romanizedHas(s, a);
    if (hasHangul(a)) return !!koreanSurname(a)?.romans.includes(s);
    const n = norm(a);
    const tokens = n.split(/[\s-]+/);
    return tokens.includes(s) || n.replace(/\s+/g, "") === s.replace(/\s+/g, "") || n.endsWith(` ${s}`);
  });
}

const both = (x: string, y: string) => {
  const a = queryWords(x);
  const b = queryWords(y);
  return a.length && b.length ? Math.min(coverage(a, y), coverage(b, x)) : 0;
};
const mainTitle = (t: string) => t.split(/[:：?？]|\s[-–—]\s/)[0];

/**
 * 제목이 얼마나 같은가 (양쪽 낱말 겹침, 0~1).
 * 한쪽에만 부제(콜론 뒤)가 있는 경우는 본제목끼리 같으면 0.8로 본다.
 */
export function titleMatch(named: string, found: string): number {
  const whole = both(named, found);
  const sub = Math.max(both(mainTitle(named), found), both(named, mainTitle(found)), both(mainTitle(named), mainTitle(found)));
  return Math.max(whole, sub >= 0.9 ? 0.8 : 0);
}

/**
 * AI가 말한 문헌과 데이터베이스에서 찾은 논문이 같은 것인지.
 * 저자 성이 맞고 제목이 거의 같아야 한다. 연도는 재판·번역판이 있어 제목이 아주 같으면 조금 달라도 된다.
 */
export function sameWork(w: Pick<ConsultWork, "author" | "year" | "title">, c: Pick<Candidate, "authors" | "year" | "title" | "altTitles">): boolean {
  if (!authorMatches(w.author, c.authors)) return false;
  const t = Math.max(...[c.title, ...(c.altTitles ?? [])].map((x) => titleMatch(w.title, x)));
  const gap = w.year && c.year ? Math.abs(w.year - c.year) : 0;
  return t >= 0.85 || (t >= 0.6 && gap <= 2);
}

/** 같은 문헌으로 보이는 후보 중 가장 많이 인용된 것 (원본일 가능성이 높다) */
export function pickWork(w: Pick<ConsultWork, "author" | "year" | "title">, cands: Candidate[]): Candidate | null {
  const ok = cands.filter((c) => sameWork(w, c));
  ok.sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0) || Math.abs((a.year ?? 0) - (w.year ?? 0)) - Math.abs((b.year ?? 0) - (w.year ?? 0)));
  return ok[0] ?? null;
}

/** AI에게 넘길 지난 대화 (최근 것 위주로, 길면 앞을 자른다) */
export function historyText(messages: ConsultMsg[], limit = 9000): string {
  const lines = messages.map((m) => {
    if (m.role === "user") return `연구자: ${m.text}`;
    const th = (m.theories ?? [])
      .map((t) => `  - ${t.name}: ${t.works.map((w) => `${w.author} (${w.year ?? "?"}) ${w.status === "verified" ? "[확인됨]" : "[확인 안 됨]"}`).join(", ") || "문헌 없음"}`)
      .join("\n");
    return `상담자: ${m.text}${th ? `\n  (권한 이론)\n${th}` : ""}`;
  });
  const out: string[] = [];
  let len = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    len += lines[i].length;
    if (len > limit && out.length) break;
    out.unshift(lines[i].slice(0, limit));
  }
  return out.join("\n\n");
}

/** 지금까지 확인된 문헌 (같은 논문은 한 번만) */
export function verifiedWorks(messages: ConsultMsg[]): { theory: string; work: ConsultWork & { candidate: Candidate } }[] {
  const seen = new Set<string>();
  const out: { theory: string; work: ConsultWork & { candidate: Candidate } }[] = [];
  for (const m of messages)
    for (const t of m.theories ?? [])
      for (const w of t.works) {
        if (w.status !== "verified" || !w.candidate) continue;
        const k = refKey(w.candidate);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ theory: t.name, work: w as ConsultWork & { candidate: Candidate } });
      }
  return out;
}

export const refKey = (c: Pick<Candidate, "doi" | "key">) => (c.doi ? `doi:${c.doi}` : c.key);

export const toCitedRef = (c: Candidate): CitedRef => ({
  key: refKey(c),
  inText: inTextCitation(c),
  title: c.title,
  authors: c.authors,
  year: c.year,
  venue: c.venue,
  doi: c.doi,
  url: c.url,
});

export interface OutlineSection {
  heading: string;
  points: { text: string; ids: number[] }[];
}

/**
 * 개요를 글 본문으로. 번호는 확인된 문헌 목록의 번호이고, 목록 밖 번호는 버린다.
 * 연구자가 풀어 쓸 뼈대라서 항목마다 한 문단씩 둔다.
 */
export function outlineBody(sections: OutlineSection[], works: Candidate[]): { body: string; citations: CitedRef[] } {
  const used = new Map<string, CitedRef>();
  const parts = sections
    .filter((s) => s.heading.trim() || s.points.length)
    .map((s, i) => {
      const pts = s.points
        .filter((p) => p.text.trim())
        .map((p) => {
          const refs = [...new Set(p.ids)].map((n) => works[n - 1]).filter((c): c is Candidate => !!c).map(toCitedRef);
          refs.forEach((r) => used.set(r.key, r));
          const text = p.text.trim();
          if (!refs.length) return text;
          const cite = `(${refs.map((r) => r.inText.slice(1, -1)).join("; ")})`;
          const m = text.match(/[.!?。]\s*$/);
          return m ? `${text.slice(0, text.length - m[0].length)} ${cite}${m[0].trim()}` : `${text} ${cite}.`;
        });
      return [`${i + 1}. ${s.heading.trim()}`, ...pts].join("\n\n");
    });
  return { body: parts.join("\n\n\n"), citations: [...used.values()] };
}

/** 구글 학술검색에서 직접 확인해 볼 주소 (확인 안 된 문헌용) */
export const scholarLink = (w: Pick<ConsultWork, "author" | "year" | "title">) =>
  `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${w.title}" ${surnameOf(w.author)}`)}`;
