import { crossrefByDoi, searchCrossref } from "@/lib/sources/crossref";
import { searchEric } from "@/lib/sources/eric";
import { kciKey, searchKci } from "@/lib/sources/kci";
import { limiter, SourceError } from "@/lib/sources/http";
import { searchOpenAlex } from "@/lib/sources/openalex";
import { searchS2 } from "@/lib/sources/semanticscholar";
import { hasHangul, stripKoreanParticles } from "@/lib/text";
import type { Candidate, Scope, SearchPage, SourceId } from "@/lib/types";
import { mergeAndRank, type RankedList } from "./merge";
import { EXPANSION_WEIGHT, rerank } from "./rank";

export interface SearchInput {
  terms: string[];
  sources: SourceId[];
  scope: Scope;
  yearFrom?: number;
  yearTo?: number;
  /** 1부터. 2 이상이면 각 출처의 다음 페이지를 가져온다 */
  page?: number;
}

export interface SearchOutput {
  results: Candidate[];
  totalRaw: number;
  totalUnique: number;
  perSource: Partial<Record<SourceId, number>>;
  /** 출처별로 검색어에 맞는 전체 건수 (검색어마다 다르면 가장 큰 값) */
  available: Partial<Record<SourceId, number>>;
  /** 다음 페이지가 남아 있는지 */
  hasMore: boolean;
  warnings: string[];
}

/** 출처마다 허용되는 요청 속도가 달라서 따로 줄을 세운다 */
const lanes: Record<SourceId, ReturnType<typeof limiter>> = {
  openalex: limiter(4),
  eric: limiter(3),
  crossref: limiter(3),
  kci: limiter(4),
  // Semantic Scholar는 키가 없으면 제한이 빡빡하다
  s2: limiter(1, process.env.S2_API_KEY ? 350 : 1100),
};

interface Task {
  source: SourceId;
  term: string;
  /** 원래 검색어 1, AI가 넓힌 검색어 0.5에 출처별 무게를 곱한 값 */
  weight: number;
  run: () => Promise<SearchPage>;
}

/**
 * 출처별 관련도 순위를 얼마나 믿을지.
 * Crossref는 낱말 하나만 맞아도 위로 올리는 편이라 낮게, 대신 국내 논문의 주 통로라 한국어 검색어에서는 조금 높게 둔다.
 */
const SOURCE_WEIGHT: Record<SourceId, number> = { openalex: 1, s2: 1, eric: 0.8, crossref: 0.6, kci: 0.8 };
const KO_CROSSREF_WEIGHT = 0.85;

/**
 * KCI는 제목에 검색어가 그대로 들어간 논문만 돌려준다 (관련도 순서도 없다).
 * 그래서 전체 검색어와 함께, 낱말이 세 개 이상이면 붙어 있는 두 낱말씩도 따로 묻는다.
 * 예: "디지털 읽기 평가" → "디지털 읽기 평가", "디지털 읽기", "읽기 평가"
 */
export function kciQueries(term: string): { q: string; full: boolean }[] {
  const words = term.split(/\s+/).filter(Boolean);
  const out = [{ q: words.join(" "), full: true }];
  if (words.length >= 3) for (let i = 0; i + 1 < words.length; i++) out.push({ q: `${words[i]} ${words[i + 1]}`, full: false });
  return out.slice(0, 4);
}

/**
 * 어떤 검색어를 어떤 출처에 보낼지 정한다.
 * - 한국어 검색어: 조사를 뗀 뒤 OpenAlex·Crossref (국내 학술지 대부분이 DOI를 Crossref에 등록)
 * - 영어 검색어: OpenAlex·Semantic Scholar·ERIC. 국내 범위면 OpenAlex만 (국내 학술지의 영문 제목·초록으로 찾음)
 */
export function planTasks(input: SearchInput): Task[] {
  const { terms, sources, scope, yearFrom, yearTo } = input;
  const page = input.page ?? 1;
  const on = (s: SourceId) => sources.includes(s);
  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of terms.entries()) {
    const tw = i === 0 ? 1 : EXPANSION_WEIGHT;
    const ko = hasHangul(raw);
    // 한국어는 조사를 떼어야 제목·키워드와 맞는다
    const term = ko ? stripKoreanParticles(raw) : raw.trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    if (ko) {
      if (scope === "intl") continue;
      // 한국어 단어로 찾으면 이미 국문 논문만 걸린다. 언어 필터는 영문 초록만 등록된 국내 논문을 놓치게 해서 쓰지 않는다
      if (on("openalex")) tasks.push({ source: "openalex", term, weight: tw, run: () => searchOpenAlex(term, { yearFrom, yearTo, page }) });
      if (on("crossref")) tasks.push({ source: "crossref", term, weight: tw * KO_CROSSREF_WEIGHT, run: () => searchCrossref(term, { yearFrom, page }) });
      if (on("kci") && kciKey())
        for (const k of kciQueries(term)) {
          if (seen.has(`kci|${k.q}`)) continue;
          seen.add(`kci|${k.q}`);
          tasks.push({ source: "kci", term: k.q, weight: tw * SOURCE_WEIGHT.kci * (k.full ? 1 : 0.6), run: () => searchKci(k.q, { page }) });
        }
    } else {
      const w = (s: SourceId) => tw * SOURCE_WEIGHT[s];
      if (on("openalex")) tasks.push({ source: "openalex", term, weight: w("openalex"), run: () => searchOpenAlex(term, { yearFrom, yearTo, koreanOnly: scope === "ko", page }) });
      if (scope === "ko") continue;
      if (on("s2")) tasks.push({ source: "s2", term, weight: w("s2"), run: () => searchS2(term, { yearFrom, yearTo, page }) });
      if (on("eric")) tasks.push({ source: "eric", term, weight: w("eric"), run: () => searchEric(term, { page }) });
    }
  }
  return tasks;
}

const isKorean = (c: Candidate) => c.lang === "ko" || hasHangul(c.title) || hasHangul(c.venue);

export function applyScope(results: Candidate[], scope: Scope): Candidate[] {
  if (scope === "ko") return results.filter(isKorean);
  if (scope === "intl") return results.filter((c) => !isKorean(c));
  return results;
}

/** 요청이 몰려 잠깐 막히거나(429) 서버가 바쁠 때(5xx) 한 번만 다시 해 본다 */
async function retryOnce(run: () => Promise<SearchPage>, waitMs = 1500): Promise<SearchPage> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof SourceError) || !(e.status === 429 || (e.status ?? 0) >= 500)) throw e;
    await new Promise((r) => setTimeout(r, waitMs));
    return run();
  }
}

/**
 * KCI 응답에는 저자·학술지 이름이 없다. 상위 결과 중 KCI에서만 온 논문은 DOI로 Crossref에서 채운다.
 * 오래 걸리면 기다리지 않고 넘어간다 (최대 8초).
 */
async function fillKciAuthors(items: Candidate[]) {
  const need = items.filter((c) => c.sources.includes("kci") && !c.authors.length && c.doi).slice(0, 20);
  if (!need.length) return;
  const work = Promise.all(
    need.map((c) =>
      lanes.crossref(() => crossrefByDoi(c.doi!)).then((cr) => {
        if (!cr) return;
        c.authors = cr.authors;
        c.venue = c.venue ?? cr.venue;
        c.year = c.year ?? cr.year;
        c.citations = c.citations ?? cr.citations;
      }),
    ),
  ).catch(() => {});
  await Promise.race([work, new Promise((r) => setTimeout(r, 8000))]);
}

export async function runSearch(input: SearchInput, maxResults = 500): Promise<SearchOutput> {
  const tasks = planTasks(input);
  const warnings = new Set<string>();
  const lists: RankedList[] = [];
  const perSource: Partial<Record<SourceId, number>> = {};
  const available: Partial<Record<SourceId, number>> = {};
  let hasMore = false;

  await Promise.all(
    tasks.map((t) =>
      lanes[t.source](() => retryOnce(t.run))
        .then(({ items, total }) => {
          lists.push({ source: t.source, term: t.term, items, weight: t.weight });
          perSource[t.source] = (perSource[t.source] ?? 0) + items.length;
          if (total != null) available[t.source] = Math.max(available[t.source] ?? 0, total);
          // 이번 페이지가 꽉 찼으면 뒤에 더 있다
          if (items.length >= 50) hasMore = true;
        })
        .catch((e) => {
          const msg = e instanceof SourceError ? `${e.source}: ${e.message}` : `${t.source}: 검색 중 오류`;
          warnings.add(msg);
        }),
    ),
  );

  // 병렬 실행으로 도착 순서가 섞이므로 계획 순서대로 다시 정렬해 결과를 결정적으로 만든다
  const order = new Map(tasks.map((t, i) => [`${t.source}|${t.term}`, i]));
  lists.sort((a, b) => order.get(`${a.source}|${a.term}`)! - order.get(`${b.source}|${b.term}`)!);

  const totalRaw = lists.reduce((n, l) => n + l.items.length, 0);
  const merged = applyScope(rerank(mergeAndRank(lists), input.terms), input.scope);
  await fillKciAuthors(merged.slice(0, 60));
  return { results: merged.slice(0, maxResults), totalRaw, totalUnique: merged.length, perSource, available, hasMore, warnings: [...warnings] };
}
