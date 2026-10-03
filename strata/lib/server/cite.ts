import { CiteClaimsSchema, CitePickSchema } from "@/lib/claude/schemas";
import { CITE_CLAIMS_SYSTEM, CITE_PICK_SYSTEM, citeClaimsUser } from "@/lib/claude/prompts";
import { mergeAndRank } from "@/lib/search/merge";
import { coverage, queryWords, rerank } from "@/lib/search/rank";
import { searchCrossref } from "@/lib/sources/crossref";
import { searchOpenAlex } from "@/lib/sources/openalex";
import { searchScholar, serpKey } from "@/lib/sources/scholar";
import type { Supa } from "@/lib/supabase/server";
import { titleKey } from "@/lib/text";
import type { Candidate, SearchPage, SourceId, SummaryData } from "@/lib/types";
import { HttpError } from "./api";
import { runAi } from "./ai";
import { annotate, type Placement } from "./membership";
import { type PaperRow, toCandidate } from "./papers";

export interface CiteRec {
  candidate: Candidate & { placements?: Placement[] };
  /** 이 프로젝트에 이미 보관한 논문이면 그 id */
  paperId: string | null;
  reason: string;
  fit: "직접" | "관련";
  /** 오래 많이 인용된 대표 문헌인지 */
  classic: boolean;
}

export interface CiteClaimOut {
  sentence: string;
  claim: string;
  wantsClassic: boolean;
  queries: string[];
  recs: CiteRec[];
}

const MAX_CLAIMS = 5;
const SAVED_PER_CLAIM = 4;
const FOUND_PER_CLAIM = 6;

/** 대표 문헌: 출판 8년 넘게 지나 피인용 300회 이상, 또는 분야·연도 보정 상위 1% */
export function isClassic(c: Pick<Candidate, "citations" | "year" | "impact">, now = new Date().getFullYear()) {
  return ((c.citations ?? 0) >= 300 && !!c.year && now - c.year >= 8) || (c.impact?.pct ?? 0) >= 99;
}

type Saved = { paperId: string; candidate: Candidate; text: string };

/** 보관한 논문 중 이 주장과 낱말이 많이 겹치는 것 */
export function matchSaved(saved: Saved[], terms: string[], limit = SAVED_PER_CLAIM): Saved[] {
  const sets = terms.map(queryWords).filter((w) => w.length);
  return saved
    .map((s) => ({ s, score: Math.max(0, ...sets.map((w) => coverage(w, s.text))) }))
    .filter((x) => x.score >= 0.34)
    .sort((a, b) => b.score - a.score || (b.s.candidate.citations ?? 0) - (a.s.candidate.citations ?? 0))
    .slice(0, limit)
    .map((x) => x.s);
}

const settle = async (p: Promise<SearchPage>) => {
  try {
    return (await p).items;
  } catch {
    return [] as Candidate[];
  }
};

/** 주장 하나에 대해 데이터베이스에서 실제 논문을 찾는다 (대표 문헌이 필요하면 피인용 많은 것도 함께) */
async function findForClaim(q: { en: string; ko: string; classic: boolean }, useScholar: boolean): Promise<Candidate[]> {
  const lists: { source: SourceId; term: string; items: Candidate[]; weight: number }[] = [];
  const jobs: Promise<void>[] = [];
  const add = (source: SourceId, term: string, weight: number, p: Promise<SearchPage>) =>
    jobs.push(settle(p).then((items) => void lists.push({ source, term, items, weight })));
  if (q.en) add("openalex", q.en, 1, searchOpenAlex(q.en, { perPage: 15 }));
  if (q.ko) {
    add("openalex", q.ko, 0.9, searchOpenAlex(q.ko, { perPage: 10 }));
    add("crossref", q.ko, 0.7, searchCrossref(q.ko, { rows: 10 }));
  }
  if (useScholar && serpKey()) add("scholar", q.ko || q.en, 1.5, searchScholar(q.ko || q.en));
  await Promise.all(jobs);
  const ranked = rerank(mergeAndRank(lists), [q.en || q.ko, q.ko].filter(Boolean)).filter((c) => c.domain !== "out");
  const top = ranked.slice(0, FOUND_PER_CLAIM);
  if (q.classic) {
    // 이론·개념 주장에는 관련도 상위 20편 중 가장 많이 인용된 고전 두 편을 함께 후보로 둔다
    const classics = ranked
      .slice(0, 20)
      .filter((c) => isClassic(c) && !top.includes(c))
      .sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0))
      .slice(0, 2);
    top.push(...classics);
  }
  return top;
}

type Pool = { candidate: Candidate; paperId: string | null }[];

/**
 * AI가 고른 번호를 실제 후보로 바꾼다. 후보 목록에 없는 번호(지어낸 논문)는 버리고,
 * 주장마다 최대 3편, 같은 논문은 한 번만.
 */
export function applyPicks(
  claims: { sentence: string; claim: string; classic: boolean; query_en: string; query_ko: string }[],
  pools: Pool[],
  picks: { claim: number; id: string; reason: string; fit: string }[],
): CiteClaimOut[] {
  const out: CiteClaimOut[] = claims.map((c) => ({ sentence: c.sentence, claim: c.claim, wantsClassic: c.classic, queries: [c.query_en, c.query_ko].filter(Boolean), recs: [] }));
  for (const p of picks) {
    const m = p.id.match(/(\d+)\s*-\s*(\d+)/);
    if (!m) continue;
    const ci = Number(m[1]) - 1;
    const hit = pools[ci]?.[Number(m[2]) - 1];
    if (!hit || out[ci].recs.length >= 3 || out[ci].recs.some((r) => sameKey(r.candidate) === sameKey(hit.candidate))) continue;
    out[ci].recs.push({ candidate: hit.candidate, paperId: hit.paperId, reason: p.reason.trim(), fit: p.fit.includes("직접") ? "직접" : "관련", classic: isClassic(hit.candidate) });
  }
  return out;
}

const sameKey = (c: Pick<Candidate, "doi" | "title">) => (c.doi ? `doi:${c.doi}` : `t:${titleKey(c.title)}`);

/**
 * 글에서 인용이 필요한 문장을 찾고, 문장마다 어울리는 실제 문헌을 추천한다.
 * AI는 데이터베이스에서 찾은 후보 중에서만 고를 수 있어 없는 논문을 지어낼 수 없다.
 */
export async function recommendCitations(supabase: Supa, userId: string, projectId: string, text: string, opts: { scholar?: boolean } = {}) {
  const body = text.trim().slice(0, 4000);
  if (body.length < 20) throw new HttpError(400, "인용을 찾을 글이 너무 짧습니다. 한두 문장 이상 써 주세요.");

  const [{ data: project }, { data: pp }] = await Promise.all([
    supabase.from("projects").select("research_question").eq("id", projectId).single(),
    supabase.from("project_papers").select("paper:papers(*, summaries(data))").eq("project_id", projectId),
  ]);
  const saved: Saved[] = ((pp ?? []) as unknown as { paper: (PaperRow & { summaries: { data: SummaryData } | { data: SummaryData }[] | null }) | null }[])
    .filter((r) => r.paper)
    .map((r) => {
      const { summaries, ...paper } = r.paper!;
      const s = Array.isArray(summaries) ? summaries[0]?.data : summaries?.data;
      return {
        paperId: paper.id,
        candidate: toCandidate(paper as PaperRow),
        text: [paper.title, paper.abstract, s?.one_line, s?.findings, s?.keywords?.join(" ")].filter(Boolean).join(" "),
      };
    });

  // 1) 인용이 필요한 문장
  const found = await runAi(supabase, userId, "cite", {
    system: CITE_CLAIMS_SYSTEM,
    user: citeClaimsUser(body, { researchQuestion: project?.research_question }),
    schema: CiteClaimsSchema,
    maxTokens: 2000,
  });
  const claims = found.claims.filter((c) => c.sentence.trim()).slice(0, MAX_CLAIMS);
  if (!claims.length) return { claims: [] as CiteClaimOut[] };

  // 2) 문장마다 보관함 + 데이터베이스에서 실제 후보 모으기
  const pools = await Promise.all(
    claims.map(async (c) => {
      const mine = matchSaved(saved, [c.query_en, c.query_ko, c.claim]);
      const ext = (await findForClaim({ en: c.query_en.trim(), ko: c.query_ko.trim(), classic: c.classic }, !!opts.scholar)).filter(
        (x) => !mine.some((m) => sameKey(m.candidate) === sameKey(x)),
      );
      return [...mine.map((m) => ({ candidate: m.candidate, paperId: m.paperId })), ...ext.map((x) => ({ candidate: x, paperId: saved.find((m) => sameKey(m.candidate) === sameKey(x))?.paperId ?? null }))];
    }),
  );

  // 3) 후보 중에서만 고르게 한다
  const listing = claims
    .map((c, i) => {
      const cands = pools[i]
        .map((p, j) => {
          const x = p.candidate;
          const who = x.authors.slice(0, 3).join(", ") + (x.authors.length > 3 ? " 외" : "");
          const tags = [p.paperId ? "보관함" : null, isClassic(x) ? "대표 문헌" : null, x.citations != null ? `피인용 ${x.citations}` : null].filter(Boolean).join(" · ");
          return `[${i + 1}-${j + 1}] ${x.title} (${x.year ?? "연도 미상"}) ${who}${tags ? ` · ${tags}` : ""}\n초록: ${(x.abstract ?? x.snippet ?? "(없음)").slice(0, 380)}`;
        })
        .join("\n");
      return `주장 ${i + 1}${c.classic ? " (대표 문헌 필요)" : ""}: ${c.claim}\n문장: ${c.sentence}\n후보:\n${cands || "(없음)"}`;
    })
    .join("\n\n");
  const picked = pools.some((p) => p.length)
    ? await runAi(supabase, userId, "cite", { system: CITE_PICK_SYSTEM, user: listing, schema: CitePickSchema, maxTokens: 3000 })
    : { picks: [] };

  // 4) 고른 것만, 후보에 실제로 있는 것만 돌려준다
  const out = applyPicks(claims, pools, picked.picks);
  // 보관함 표시용
  const flat = out.flatMap((c) => c.recs);
  const ann = await annotate(supabase, flat.map((r) => r.candidate));
  flat.forEach((r, i) => (r.candidate = ann[i]));
  return { claims: out };
}
