const HANGUL = /[ㄱ-ㆎ가-힣]/;

export const hasHangul = (s: string | null | undefined) => !!s && HANGUL.test(s);

/** "https://doi.org/10.1/ABC" · "doi:10.1/abc" · "10.1/abc" → "10.1/abc" */
export function normalizeDoi(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(/10\.\d{4,9}\/[^\s"<>]+/i);
  if (!m) return null;
  return m[0].replace(/[).,;]+$/, "").toLowerCase();
}

/** 출처마다 다른 제목 표기를 비교할 수 있게 소문자·영숫자·한글만 남긴다 */
export function titleKey(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^0-9a-zㄱ-ㆎ가-힣]+/g, "");
}

/** 진짜 태그만 (꺾쇠 바로 뒤에 영문자). "p < .05" 같은 부등호는 건드리지 않는다 */
const TAG = /<\/?[a-z][\w:-]*(\s[^<>]*)?\/?>/gi;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** &amp; · &apos; · &#39; · &#x27; 같은 HTML 문자 표기를 글자로 바꾼다 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

/** JATS·HTML 태그와 군더더기 공백을 걷어낸다 (Crossref 초록 등) */
export function stripTags(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = decodeEntities(
    s
      .replace(/<jats:title>[^<]*<\/jats:title>/gi, " ")
      .replace(TAG, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return out || null;
}

/**
 * 제목 정리. 기울임 태그가 낱말 사이에 붙어 있으면("Assessment<i>as</i>learning") 띄어 주고,
 * 아래·위 첨자(H<sub>2</sub>O)는 붙인 채로 태그만 지운다.
 */
export function cleanTitle(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = decodeEntities(s)
    .replace(/(\p{L})<\/?(i|em|b|strong)>(?=\p{L})/giu, "$1 ")
    .replace(TAG, "")
    .replace(/\s+/g, " ")
    .trim();
  return out || null;
}

/** OpenAlex는 초록을 {단어: [위치...]} 형태로 준다 */
export function reconstructAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  const text = words.filter((w) => w !== undefined).join(" ").trim();
  return text || null;
}

export const clampText = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// 한국어 검색어에서 조사를 떼어 낸다. "디지털 환경의 읽기 평가와 문항 설계" → "디지털 환경 읽기 평가 문항 설계"
// 명사 끝 글자와 헷갈리는 조사(가·이·과·은·도)는 건드리지 않는다 (예: 자기평가, 학습효과).
const PARTICLES = ["에서의", "에서", "에게", "으로", "와의", "과의", "에의", "의", "와", "을", "를", "는", "에", "로"];
const KEEP_UI = /(주의|논의|정의|회의|강의|토의|합의|협의|의의|동의|모의)$/;

export function stripKoreanParticles(query: string): string {
  return query
    .split(/\s+/)
    .map((w) => {
      if (!hasHangul(w) || w.length < 3) return w;
      for (const p of PARTICLES) {
        if (w.endsWith(p) && w.length - p.length >= 2) {
          if (p === "의" && KEEP_UI.test(w)) return w;
          return w.slice(0, -p.length);
        }
      }
      return w;
    })
    .join(" ");
}
