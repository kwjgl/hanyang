// OpenAlex에 여러 번 묻기 때문에 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { citationGraph, type CitationLink } from "@/lib/citations";
import { HttpError, json, must, route, type RouteCtx } from "@/lib/server/api";
import { annotate, type Placement } from "@/lib/server/membership";
import { SourceError } from "@/lib/sources/http";
import { openAlexWorks, type WorkWithRefs } from "@/lib/sources/openalex";
import type { Candidate, Impact } from "@/lib/types";

type P = { id: string; doi: string | null; ids: Candidate["ids"] | null; impact: Impact | null; citations: number | null };

export interface CitationsResponse {
  links: CitationLink[];
  core: (Candidate & { placements?: Placement[]; citedBy: string[] })[];
  /** OpenAlex에서 찾은 보관 논문 수 / 전체 */
  found: number;
  total: number;
  /** 피인용 수·영향력 지표를 새로 채운 논문 수 */
  updated: number;
}

/** 보관한 논문들의 인용 관계와 핵심 문헌 후보. 겸사겸사 빠진 영향력 지표도 채운다. */
export const GET = route<RouteCtx<{ id: string }>>(async ({ supabase, ctx }) => {
  const { id } = await ctx.params;
  const rows = must(await supabase.from("project_papers").select("paper:papers(id, doi, ids, impact, citations)").eq("project_id", id).limit(300), "논문");
  const papers = (rows as unknown as { paper: P | null }[]).map((r) => r.paper).filter((p): p is P => !!p);
  if (!papers.length) return json({ links: [], core: [], found: 0, total: 0, updated: 0 } satisfies CitationsResponse);

  let works: WorkWithRefs[];
  try {
    works = await openAlexWorks(
      {
        ids: papers.map((p) => p.ids?.openalex).filter((x): x is string => !!x),
        dois: papers.filter((p) => !p.ids?.openalex && p.doi).map((p) => p.doi!),
      },
      true,
    );
  } catch (e) {
    if (e instanceof SourceError) throw new HttpError(502, `인용 관계를 불러오지 못했습니다 (${e.source}: ${e.message})`);
    throw e;
  }
  const byOa = new Map(works.map((w) => [w.candidate.ids.openalex!, w]));
  const byDoi = new Map(works.filter((w) => w.candidate.doi).map((w) => [w.candidate.doi!, w]));

  const saved = [];
  let updated = 0;
  for (const p of papers) {
    const w = (p.ids?.openalex && byOa.get(p.ids.openalex)) || (p.doi && byDoi.get(p.doi)) || null;
    if (!w) continue;
    const oa = w.candidate.ids.openalex!;
    saved.push({ paperId: p.id, oa, refs: w.refs });
    const patch: Record<string, unknown> = {};
    if (!p.ids?.openalex) patch.ids = { ...(p.ids ?? {}), openalex: oa };
    const pct = w.candidate.impact.pct;
    if (pct != null && pct !== p.impact?.pct) patch.impact = { ...(p.impact ?? {}), pct, fwci: w.candidate.impact.fwci ?? p.impact?.fwci ?? null };
    if (w.candidate.citations != null && w.candidate.citations > (p.citations ?? -1)) patch.citations = w.candidate.citations;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("papers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", p.id);
      if (!error) updated++;
    }
  }

  const { links, core } = citationGraph(saved);
  let details: WorkWithRefs[] = [];
  if (core.length) {
    try {
      details = await openAlexWorks({ ids: core.map((c) => c.oa) });
    } catch {
      details = [];
    }
  }
  const info = new Map(details.map((d) => [d.candidate.ids.openalex!, d.candidate]));
  const savedDois = new Set(papers.map((p) => p.doi).filter(Boolean));
  const ranked = core.filter((c) => info.has(c.oa) && !savedDois.has(info.get(c.oa)!.doi));
  const hits = await annotate(supabase, ranked.map((c) => info.get(c.oa)!));
  return json({
    links: links.concat(ranked.flatMap((c) => c.citedBy.map((from) => ({ from, to: c.oa })))),
    core: hits.map((h, i) => ({ ...h, citedBy: ranked[i].citedBy })),
    found: saved.length,
    total: papers.length,
    updated,
  } satisfies CitationsResponse);
});
