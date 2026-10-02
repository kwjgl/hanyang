import { hasHangul, stripKoreanParticles } from "@/lib/text";
import type { Candidate } from "@/lib/types";

const STOP = new Set(
  "a an the of in on for and or to with by at from as is are be its into via vs versus about between among using based their this that".split(" "),
);

/** 영어는 소문자·간단한 복수형 정리, 한국어는 그대로 */
const stem = (w: string) => (hasHangul(w) ? w : w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

export function queryWords(term: string): string[] {
  return [
    ...new Set(
      term
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 2 && !STOP.has(w))
        .map(stem),
    ),
  ];
}

/** 검색어 낱말 중 몇 %가 글에 들어 있나. 한국어는 붙여 쓴 합성어가 많아 부분 일치로 본다. */
export function coverage(words: string[], text: string | null | undefined): number {
  if (!words.length || !text) return 0;
  const lower = text.toLowerCase();
  const tokens = new Set(lower.split(/[^\p{L}\p{N}]+/u).map(stem));
  const hit = words.filter((w) => (hasHangul(w) ? lower.includes(w) : tokens.has(w))).length;
  return hit / words.length;
}

/** 학술지 목차·편집 정보처럼 논문이 아닌 항목: 제목 전체가 이 말뿐인 것 (뒤에 권·호 숫자 정도는 허용) */
const JUNK_WHOLE =
  /^(front matter|back matter|table of contents|contents|index|subject index|author index|editorial board|issue information|cover( image)?|masthead|reviewers?( list)?|acknowledg(e)?ments? to reviewers|books? received|announcements?|call for papers|목차|편집후기|편집\s?위원회?|발간사|권두언|투고\s?규정|논문\s?심사\s?위원|학회\s?소식)[\s\d.,:;()\-–—]*$/iu;
/** 정정·철회 공지는 뒤에 원래 논문 제목이 붙는다 */
const JUNK_PREFIX = /^(erratum|corrigendum|correction to|retraction( note)?|retracted)\b/i;

export const isJunk = (c: Pick<Candidate, "title">) => JUNK_WHOLE.test(c.title.trim()) || JUNK_PREFIX.test(c.title.trim()) || c.title.trim().length < (hasHangul(c.title) ? 3 : 6);

/**
 * 순위 결합 점수에 구글 학술검색이 중시하는 두 가지를 더한다.
 * - 제목(과 초록)에 검색어 낱말이 얼마나 들어 있나. 원래 검색어가 확장 검색어보다 무겁다.
 * - 해마다 받은 피인용 수 (오래 많이 인용된 고전이 위로)
 */
export function rerank(items: Candidate[], terms: string[], now = new Date().getFullYear()): Candidate[] {
  const sets = terms.map((t, i) => ({ words: queryWords(hasHangul(t) ? stripKoreanParticles(t) : t), weight: i === 0 ? 1 : 0.7 })).filter((s) => s.words.length);
  return items
    .filter((c) => !isJunk(c))
    .map((c) => {
      let match = 0;
      for (const s of sets) match = Math.max(match, s.weight * (coverage(s.words, c.title) + 0.3 * coverage(s.words, c.abstract)));
      const age = Math.max(1, now - (c.year ?? now) + 1);
      const perYear = (c.citations ?? 0) / age;
      const score = (c.score ?? 0) + 0.016 * match + 0.003 * Math.log10(1 + perYear);
      return { ...c, score: Math.round(score * 10000) / 10000 };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
