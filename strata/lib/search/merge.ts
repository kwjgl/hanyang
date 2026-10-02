import { titleKey } from "@/lib/text";
import type { Candidate, SourceId } from "@/lib/types";
import { mergeDomain } from "./domain";

/** 한 번의 (검색어 × 출처) 호출 결과. 순서가 곧 그 출처의 관련도 순위다. */
export interface RankedList {
  source: SourceId;
  term: string;
  items: Candidate[];
  /** 이 목록의 무게 (원래 검색어·믿을 만한 출처일수록 크다). 기본 1 */
  weight?: number;
}

const RRF_K = 60;

/** 논문 종류는 OpenAlex·Crossref 표기를 먼저 믿는다 (ERIC은 학술지 논문에도 '보고서'를 붙이곤 한다) */
const trustedKind = (c: Candidate) => (c.kind && c.sources.some((s) => s === "openalex" || s === "crossref") ? c.kind : null);

function mergeInto(a: Candidate, b: Candidate): Candidate {
  const pick = <T>(x: T | null | undefined, y: T | null | undefined) => (x ?? y ?? null) as T | null;
  // 초록은 더 긴 쪽을 쓴다 (출처마다 잘린 초록이 있다)
  const useB = (b.abstract?.length ?? 0) > (a.abstract?.length ?? 0);
  return {
    ...a,
    doi: pick(a.doi, b.doi),
    key: a.doi || !b.doi ? a.key : b.key,
    authors: a.authors.length ? a.authors : b.authors,
    year: pick(a.year, b.year),
    venue: pick(a.venue, b.venue),
    abstract: useB ? b.abstract : a.abstract,
    abstractSource: useB ? b.abstractSource : a.abstractSource,
    citations: Math.max(a.citations ?? -1, b.citations ?? -1) >= 0 ? Math.max(a.citations ?? 0, b.citations ?? 0) : null,
    url: pick(a.url, b.url),
    oaUrl: pick(a.oaUrl, b.oaUrl),
    lang: pick(a.lang, b.lang),
    kind: a.kind === "review" || b.kind === "review" ? "review" : trustedKind(a) ?? trustedKind(b) ?? pick(a.kind, b.kind),
    ids: { ...b.ids, ...a.ids },
    sources: [...new Set([...a.sources, ...b.sources])],
    impact: {
      pct: pick(a.impact.pct, b.impact.pct),
      fwci: pick(a.impact.fwci, b.impact.fwci),
      influential: pick(a.impact.influential, b.impact.influential),
    },
    eduLevel: a.eduLevel ?? b.eduLevel,
    domain: mergeDomain(a.domain, b.domain),
    snippet: a.snippet ?? b.snippet ?? null,
    gsRank: Math.min(a.gsRank ?? Infinity, b.gsRank ?? Infinity) === Infinity ? undefined : Math.min(a.gsRank ?? Infinity, b.gsRank ?? Infinity),
  };
}

/**
 * 여러 목록을 DOI → (제목+연도) 순으로 같은 논문끼리 합치고,
 * 순위 결합(Reciprocal Rank Fusion)으로 점수를 매긴다.
 * 여러 검색어·여러 출처에서 위쪽에 나온 논문일수록 점수가 높다.
 */
export function mergeAndRank(lists: RankedList[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  const alias = new Map<string, string>();
  const score = new Map<string, number>();

  const resolve = (c: Candidate) => {
    const tk = `t:${titleKey(c.title)}:${c.year ?? ""}`;
    const tkNoYear = `tn:${titleKey(c.title)}`;
    if (c.doi && alias.has(`doi:${c.doi}`)) return alias.get(`doi:${c.doi}`)!;
    if (alias.has(tk)) return alias.get(tk)!;
    if (alias.has(tkNoYear)) return alias.get(tkNoYear)!;
    return null;
  };

  for (const list of lists) {
    list.items.forEach((c, rank) => {
      const existing = resolve(c);
      const id = existing ?? c.key;
      const merged = existing ? mergeInto(byKey.get(existing)!, c) : c;
      byKey.set(id, merged);
      if (merged.doi) alias.set(`doi:${merged.doi}`, id);
      alias.set(`t:${titleKey(merged.title)}:${merged.year ?? ""}`, id);
      if (titleKey(merged.title).length >= 24) alias.set(`tn:${titleKey(merged.title)}`, id);
      score.set(id, (score.get(id) ?? 0) + (list.weight ?? 1) / (RRF_K + rank + 1));
    });
  }

  return [...byKey.entries()]
    .map(([id, c]) => ({ ...c, score: score.get(id) ?? 0 }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
