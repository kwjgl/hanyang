import { apa } from "@/lib/export";

/** 글에 넣은 인용 하나 (참고문헌 목록을 만들 때 쓴다) */
export interface CitedRef {
  key: string;
  inText: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
}

const hangul = (s: string) => /[가-힣]/.test(s);

/** 본문 인용 표기의 저자 부분. 영문은 성만, 한글은 이름 전체 */
function surname(n: string): string {
  const t = n.trim();
  if (hangul(t)) return t.replace(/\s+/g, "");
  return t.split(/\s+/).pop() ?? t;
}

/**
 * APA 7판 본문 인용.
 * 영문: (Kintsch, 1988) · (Mangen & Walgermo, 2013) · (Delgado et al., 2018)
 * 국문: (옥현진, 2013) · (옥현진, 송미영, 2013) · (김종윤 외, 2017)
 */
export function inTextCitation(p: { authors: string[]; year: number | null }): string {
  const year = p.year ?? "n.d.";
  const names = p.authors.filter(Boolean).map(surname);
  if (!names.length) return `(저자 미상, ${year})`;
  const ko = hangul(p.authors[0]);
  if (names.length === 1) return `(${names[0]}, ${year})`;
  if (names.length === 2) return ko ? `(${names[0]}, ${names[1]}, ${year})` : `(${names[0]} & ${names[1]}, ${year})`;
  return ko ? `(${names[0]} 외, ${year})` : `(${names[0]} et al., ${year})`;
}

/**
 * 문장 끝(마침표 바로 앞)에 본문 인용을 넣는다. 이미 그 자리에 인용 괄호가 있으면 "; "로 이어 붙인다.
 * 문장을 찾지 못하면(그새 고쳤으면) at 위치에, 그것도 없으면 맨 끝에 넣는다.
 */
export function insertCitation(body: string, sentence: string, cite: string, at?: number): string {
  const inner = cite.slice(1, -1);
  // 이미 인용을 넣은 문장은 마침표 앞이 바뀌어 있으므로, 마침표를 뗀 모양으로도 찾는다
  const target = [sentence.trim(), sentence.trim().replace(/[.!?。．]\s*$/, "")].find((t) => t && body.includes(t)) ?? "";
  const start = target ? body.indexOf(target) : -1;
  let pos: number;
  if (start >= 0) {
    const s = body.slice(start, start + target.length);
    const m = s.match(/[.!?。．]\s*$/);
    pos = start + (m ? s.length - m[0].length : s.length);
  } else pos = at ?? body.length;
  // 문장 바로 뒤에 이미 인용 괄호가 있으면 그 괄호에 이어 붙인다
  const after = body.slice(pos).match(/^\s?\(([^()]*\d{4}[a-z]?|[^()]*n\.d\.)\)/);
  if (after) {
    if (after[1].split(/;\s*/).includes(inner)) return body;
    return `${body.slice(0, pos)} (${after[1]}; ${inner})${body.slice(pos + after[0].length)}`;
  }
  // 바로 앞에 같은 인용이 있으면 넣지 않는다
  const before = body.slice(0, pos);
  if (before.trimEnd().endsWith(cite)) return body;
  const prev = before.match(/\s?\(([^()]*\d{4}[a-z]?|[^()]*n\.d\.)\)\s*$/);
  if (prev) {
    if (prev[1].split(/;\s*/).includes(inner)) return body;
    const open = pos - prev[0].length;
    return `${body.slice(0, open)} (${prev[1]}; ${inner})${body.slice(pos)}`;
  }
  const space = before.length && !/\s$/.test(before) ? " " : "";
  return `${before}${space}${cite}${body.slice(pos)}`;
}

/** 본문에 아직 남아 있는 인용만 (지운 인용은 참고문헌에서 뺀다) */
export function citedInBody(body: string, refs: CitedRef[]): CitedRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const inner = r.inText.slice(1, -1);
    if (seen.has(r.key) || !body.includes(inner)) return false;
    seen.add(r.key);
    return true;
  });
}

/** 참고문헌 목록 (APA, 국문 먼저 가나다순 → 영문 알파벳순, 관례에 따라) */
export function referenceList(refs: CitedRef[]): string[] {
  const lines = refs.map((r) => apa(r));
  const ko = lines.filter(hangul).sort((a, b) => a.localeCompare(b, "ko"));
  const en = lines.filter((l) => !hangul(l)).sort((a, b) => a.localeCompare(b, "en"));
  return [...ko, ...en];
}

/** 커서 주변 문단 (빈 줄로 나뉜 덩어리). 인용을 찾을 범위로 쓴다 */
export function paragraphAt(body: string, cursor: number): string {
  const start = body.lastIndexOf("\n\n", Math.max(0, cursor - 1));
  const end = body.indexOf("\n\n", cursor);
  return body.slice(start < 0 ? 0 : start + 2, end < 0 ? body.length : end).trim();
}
