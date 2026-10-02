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

/** 구두점을 공백으로 바꾸고 앞뒤에 공백을 둬서 구절 단위로 찾을 수 있게 한다 */
const spaced = (s: string | null | undefined) => (s ? ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} ` : "");

/** 낱말 두 개 이상인 검색어가 그대로(붙은 순서대로) 들어 있나. 예: "assessment for learning" */
export function hasPhrase(phrases: string[], text: string | null | undefined): boolean {
  const t = spaced(text);
  return !!t && phrases.some((p) => p.split(" ").length >= 2 && t.includes(` ${p} `));
}

/** AI가 넓힌 검색어의 무게 (원래 검색어 = 1) */
export const EXPANSION_WEIGHT = 0.5;

/**
 * 순위 결합 점수에 구글 학술검색이 중시하는 것들을 더한다.
 * - 검색어가 제목에 구절 그대로 들어 있나
 * - 검색어 낱말이 제목(과 초록)에 얼마나 들어 있나
 * - 해마다 받은 피인용 수 (오래 많이 인용된 고전이 위로)
 * - 한국어로 찾으면 한국어 논문을 위로
 * - 검색어 낱말이 제목·초록에 절반도 없으면 아래로
 * - 연구실 분야(교육·심리·언어)가 아닌 논문은 맨 뒤로
 * 원래 검색어가 AI가 넓힌 검색어보다 무겁다.
 */
export function rerank(items: Candidate[], terms: string[], now = new Date().getFullYear()): Candidate[] {
  const sets = terms
    .map((t, i) => {
      const ko = hasHangul(t);
      const stripped = ko ? stripKoreanParticles(t) : t;
      // 한국어는 조사를 뗀 것과 원래 모양 둘 다 구절로 본다
      const phrases = [...new Set([spaced(t).trim(), spaced(stripped).trim()])].filter(Boolean);
      return { words: queryWords(stripped), phrases, weight: i === 0 ? 1 : EXPANSION_WEIGHT };
    })
    .filter((s) => s.words.length);
  // 한국어로 찾으면 한국어 논문을 먼저 보고 싶어 한다 (구글 학술검색도 그렇게 보여 준다)
  const koQuery = hasHangul(terms[0]);
  return items
    .filter((c) => !isJunk(c))
    .map((c) => {
      let match = 0;
      let phrase = 0;
      let best = 0;
      for (const s of sets) {
        const t = coverage(s.words, c.title);
        const a = coverage(s.words, c.abstract);
        best = Math.max(best, t, a);
        match = Math.max(match, s.weight * (t + 0.3 * a));
        phrase = Math.max(phrase, s.weight * (hasPhrase(s.phrases, c.title) ? 1 : hasPhrase(s.phrases, c.abstract) ? 0.2 : 0));
      }
      // 어느 검색어로 봐도 낱말의 절반도 제목·초록에 없으면, 출처가 느슨하게 걸러 온 것이다 (특히 한국어 검색)
      const weak = sets.length && best < 0.5 ? 0.015 : 0;
      const korean = koQuery && (hasHangul(c.title) || hasHangul(c.abstract)) ? 0.02 : 0;
      const age = Math.max(1, now - (c.year ?? now) + 1);
      const perYear = (c.citations ?? 0) / age;
      // 다른 분야(의학·공학 등)로 판별된 논문은 맨 뒤로 보낸다. 화면에서는 기본으로 숨긴다.
      const offDomain = c.domain === "out" ? 0.05 : 0;
      const score = (c.score ?? 0) + 0.016 * phrase + 0.016 * match + 0.005 * Math.min(3, Math.log10(1 + perYear)) + korean - weak - offDomain;
      return { ...c, score: Math.round(score * 10000) / 10000 };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
