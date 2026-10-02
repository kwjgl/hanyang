/** 보관한 논문 한 편과 그 참고문헌 (OpenAlex ID) */
export interface SavedRefs {
  paperId: string;
  oa: string;
  refs: string[];
}

export interface CitationLink {
  /** 인용한 논문 (papers.id) */
  from: string;
  /** 인용된 논문: 보관한 논문이면 papers.id, 핵심 후보면 OpenAlex ID */
  to: string;
}

export interface CoreRef {
  oa: string;
  /** 이 논문을 인용한 보관 논문들 (papers.id) */
  citedBy: string[];
}

/**
 * 보관한 논문들의 참고문헌을 모아
 * - 보관한 논문끼리의 인용 연결과
 * - 여러 편이 함께 인용하는데 아직 보관하지 않은 논문(핵심 문헌 후보)을 찾는다.
 */
export function citationGraph(saved: SavedRefs[], opts: { minShared?: number; max?: number } = {}) {
  const minShared = opts.minShared ?? 2;
  const max = opts.max ?? 12;
  const savedByOa = new Map(saved.map((s) => [s.oa, s.paperId]));
  const links: CitationLink[] = [];
  const counts = new Map<string, string[]>();
  for (const s of saved) {
    for (const r of new Set(s.refs)) {
      const target = savedByOa.get(r);
      if (target) {
        if (target !== s.paperId) links.push({ from: s.paperId, to: target });
        continue;
      }
      counts.set(r, [...(counts.get(r) ?? []), s.paperId]);
    }
  }
  const core: CoreRef[] = [...counts.entries()]
    .filter(([, by]) => by.length >= minShared)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([oa, citedBy]) => ({ oa, citedBy }));
  return { links, core };
}
