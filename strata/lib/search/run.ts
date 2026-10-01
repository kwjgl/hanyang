import { searchCrossref } from "@/lib/sources/crossref";
import { searchEric } from "@/lib/sources/eric";
import { limiter, SourceError } from "@/lib/sources/http";
import { searchOpenAlex } from "@/lib/sources/openalex";
import { searchS2 } from "@/lib/sources/semanticscholar";
import { hasHangul } from "@/lib/text";
import type { Candidate, Scope, SourceId } from "@/lib/types";
import { mergeAndRank, type RankedList } from "./merge";

export interface SearchInput {
  terms: string[];
  sources: SourceId[];
  scope: Scope;
  yearFrom?: number;
  yearTo?: number;
}

export interface SearchOutput {
  results: Candidate[];
  totalRaw: number;
  totalUnique: number;
  perSource: Partial<Record<SourceId, number>>;
  warnings: string[];
}

/** 출처마다 허용되는 요청 속도가 달라서 따로 줄을 세운다 */
const lanes: Record<SourceId, ReturnType<typeof limiter>> = {
  openalex: limiter(4),
  eric: limiter(3),
  crossref: limiter(3),
  // Semantic Scholar는 키가 없으면 제한이 빡빡하다
  s2: limiter(1, process.env.S2_API_KEY ? 350 : 1100),
};

interface Task {
  source: SourceId;
  term: string;
  run: () => Promise<Candidate[]>;
}

/**
 * 어떤 검색어를 어떤 출처에 보낼지 정한다.
 * - 한국어 검색어: OpenAlex(국문 논문만)·Crossref (국내 학술지 대부분이 DOI를 Crossref에 등록)
 * - 영어 검색어: OpenAlex·Semantic Scholar·ERIC. 국내 범위면 OpenAlex만 (국내 학술지의 영문 제목·초록으로 찾음)
 */
export function planTasks(input: SearchInput): Task[] {
  const { terms, sources, scope, yearFrom, yearTo } = input;
  const on = (s: SourceId) => sources.includes(s);
  const tasks: Task[] = [];
  for (const term of terms) {
    const ko = hasHangul(term);
    if (ko) {
      if (scope === "intl") continue;
      if (on("openalex")) tasks.push({ source: "openalex", term, run: () => searchOpenAlex(term, { yearFrom, yearTo, koreanOnly: true }) });
      if (on("crossref")) tasks.push({ source: "crossref", term, run: () => searchCrossref(term, { yearFrom }) });
    } else {
      if (on("openalex")) tasks.push({ source: "openalex", term, run: () => searchOpenAlex(term, { yearFrom, yearTo, koreanOnly: scope === "ko" }) });
      if (scope === "ko") continue;
      if (on("s2")) tasks.push({ source: "s2", term, run: () => searchS2(term, { yearFrom, yearTo }) });
      if (on("eric")) tasks.push({ source: "eric", term, run: () => searchEric(term) });
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

export async function runSearch(input: SearchInput, maxResults = 200): Promise<SearchOutput> {
  const tasks = planTasks(input);
  const warnings = new Set<string>();
  const lists: RankedList[] = [];
  const perSource: Partial<Record<SourceId, number>> = {};

  await Promise.all(
    tasks.map((t) =>
      lanes[t.source](t.run)
        .then((items) => {
          lists.push({ source: t.source, term: t.term, items });
          perSource[t.source] = (perSource[t.source] ?? 0) + items.length;
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
  const merged = applyScope(mergeAndRank(lists), input.scope);
  return { results: merged.slice(0, maxResults), totalRaw, totalUnique: merged.length, perSource, warnings: [...warnings] };
}
