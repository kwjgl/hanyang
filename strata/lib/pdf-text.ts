/**
 * PDF에서 뽑은 글자를 다루는 순수 함수 (브라우저·서버 공용).
 * 글자 뽑기 자체는 브라우저에서 pdf.js로 하고(lib/pdf-extract.ts), 여기서는 줄 맞추기·쪽 번호·참고문헌 자르기를 한다.
 */

export interface TextItem {
  str: string;
  /** [a, b, c, d, x, y] */
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

/**
 * DB에 넣을 수 없는 글자를 지운다. 한글(HWP)로 만든 PDF에는 보이지 않는 제어 문자(NUL 등)나
 * 짝이 깨진 문자가 섞여 있는 경우가 많은데, Postgres는 이런 글자가 든 값을 저장하지 못한다.
 */
export function sanitizeText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** pdf.js 글자 조각을 줄 단위 글로. 같은 줄의 조각은 간격이 있을 때만 띄어 쓴다 (한글은 글자마다 조각나는 PDF가 많다) */
export function pageTextFromItems(items: TextItem[]): string {
  let out = "";
  let prev: { x: number; y: number; end: number; size: number } | null = null;
  for (const it of items) {
    const x = it.transform[4] ?? 0;
    const y = it.transform[5] ?? 0;
    const size = Math.abs(it.transform[3] || it.height || 10) || 10;
    if (it.str) {
      if (prev) {
        if (Math.abs(y - prev.y) > size * 0.5) out = out.replace(/[ \t]+$/, "") + "\n";
        else if (x - prev.end > size * 0.2 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += " ";
      }
      out += it.str;
      prev = { x, y, end: x + (it.width ?? it.str.length * size * 0.5), size };
    }
    if (it.hasEOL) {
      out = out.replace(/[ \t]+$/, "") + "\n";
      if (prev) prev = { ...prev, y: Number.NaN };
    }
  }
  return sanitizeText(out)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PAGE_NO = /^[\s\-–—|·]*(\d{1,4})[\s\-–—|·]*$/;
/** 머리말·꼬리말 줄 끝이나 앞에 붙은 쪽 번호 ("국어교육학연구 50(2) 245", "12 Reading Research") */
const EDGE_NO = /^(\d{1,4})\s+\S.{0,80}$|^.{0,80}\S\s+(\d{1,4})$/;

function edgeNumbers(page: string): number[] {
  const lines = page
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const edge = [...lines.slice(0, 2), ...lines.slice(-2)];
  const nums: number[] = [];
  for (const l of edge) {
    const m = l.match(PAGE_NO);
    if (m) {
      nums.push(Number(m[1]));
      continue;
    }
    const e = l.length <= 90 ? l.match(EDGE_NO) : null;
    if (e) nums.push(Number(e[1] ?? e[2]));
  }
  return nums;
}

/**
 * 학술지에 인쇄된 쪽 번호와 PDF 쪽 번호의 차이를 찾는다 (인쇄 쪽 = PDF 쪽 + 차이).
 * 여러 쪽에서 같은 차이가 나와야 믿는다. 못 찾으면 null (PDF 쪽 번호를 쓴다).
 */
export function detectPageOffset(pages: string[]): number | null {
  if (pages.length < 2) return null;
  const votes = new Map<number, number>();
  pages.forEach((p, i) => {
    const seen = new Set<number>();
    for (const n of edgeNumbers(p)) {
      const off = n - (i + 1);
      // 연도(2023 등)나 권·호는 차이가 엉뚱하게 크다. 쪽 번호 차이는 0 이상 3000 미만
      if (off < 0 || off > 3000 || seen.has(off)) continue;
      seen.add(off);
      votes.set(off, (votes.get(off) ?? 0) + 1);
    }
  });
  let best: [number, number] | null = null;
  for (const [off, n] of votes) if (!best || n > best[1] || (n === best[1] && off < best[0])) best = [off, n];
  if (!best) return null;
  return best[1] >= Math.max(2, Math.ceil(pages.length * 0.4)) ? best[0] : null;
}

/** 글자가 거의 없으면 스캔한 이미지 PDF다 (글자를 뽑을 수 없다) */
export function looksScanned(pages: string[]): boolean {
  const chars = pages.reduce((n, p) => n + p.replace(/\s/g, "").length, 0);
  return pages.length > 0 && chars / pages.length < 80;
}

/** 본문에서 DOI 찾기 (첫 두 쪽에 보통 있다) */
export function findDoi(text: string): string | null {
  const m = text.match(/\b(10\.\d{4,9}\/[^\s"<>,;]+)/);
  return m ? m[1].replace(/[.)\]]+$/, "") : null;
}

const REF_HEAD = /^\s*(?:[IVXⅠ-Ⅻ\d]+[.)]?\s*)?(?:참\s*고\s*문\s*헌|References?|REFERENCES?|Bibliography|BIBLIOGRAPHY|Works Cited|인용\s*문헌)\s*$/m;

/**
 * 참고문헌부터 끝까지를 떼어 낸다 (분석 비용을 줄이려고). 글 뒤쪽 절반에서 찾은 제목만 믿는다.
 * refsAt: 참고문헌이 시작하는 PDF 쪽 (0부터), 없으면 null
 */
export function splitReferences(pages: string[]): { body: string[]; refs: string; refsAt: number | null } {
  const from = Math.floor(pages.length / 2);
  for (let i = from; i < pages.length; i++) {
    const m = REF_HEAD.exec(pages[i]);
    if (!m) continue;
    const cut = m.index;
    const body = [...pages.slice(0, i), pages[i].slice(0, cut).trim()].filter((p, k) => k < i || p);
    const refs = [pages[i].slice(cut), ...pages.slice(i + 1)].join("\n").trim();
    return { body, refs, refsAt: i };
  }
  return { body: pages, refs: "", refsAt: null };
}

/** 쪽 번호 표시: 인쇄 쪽을 알면 그 번호, 아니면 PDF 쪽 */
export const pageNo = (index: number, offset: number | null) => index + 1 + (offset ?? 0);

/**
 * AI에 보낼 본문: 쪽마다 [p.N] 표시를 붙이고, 길면 쪽 단위로 자른다.
 * 쪽 번호는 인쇄 쪽 번호(알면)라서 AI가 답에 그대로 쓸 수 있다.
 */
export function bodyForAi(pages: string[], offset: number | null, maxChars: number): { text: string; firstPage: number; lastPage: number; truncated: boolean } {
  const parts: string[] = [];
  let len = 0;
  let last = 0;
  for (let i = 0; i < pages.length; i++) {
    const chunk = `[p.${pageNo(i, offset)}]\n${pages[i].trim()}`;
    if (len + chunk.length > maxChars && parts.length) break;
    parts.push(chunk.slice(0, maxChars));
    len += chunk.length;
    last = i;
  }
  return { text: parts.join("\n\n"), firstPage: pageNo(0, offset), lastPage: pageNo(last, offset), truncated: last < pages.length - 1 };
}

const squash = (s: string) => s.replace(/[\s­]+/g, "").replace(/[“”"'‘’「」『』]/g, "");

/**
 * 인용문이 원문에 정말 있는지 (띄어쓰기·줄바꿈·따옴표 차이는 무시). 있으면 그 쪽 번호를, 없으면 null.
 * AI가 바꿔 쓴 문장을 직접 인용으로 내놓지 않게 한다.
 */
export function locateQuote(quote: string, pages: string[], offset: number | null): number | null {
  const q = squash(quote);
  if (q.length < 8) return null;
  for (let i = 0; i < pages.length; i++) if (squash(pages[i]).includes(q)) return pageNo(i, offset);
  // 쪽 경계에 걸친 문장
  for (let i = 0; i + 1 < pages.length; i++) if (squash(pages[i] + pages[i + 1]).includes(q)) return pageNo(i, offset);
  return null;
}
