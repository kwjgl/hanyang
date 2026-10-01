import type { Supa } from "@/lib/supabase/server";
import { titleKey } from "@/lib/text";
import type { Candidate } from "@/lib/types";

export interface Placement {
  projectId: string;
  projectName: string;
  subtopic: string | null;
  paperId: string;
}

type Row = {
  project_id: string;
  subtopic: { name: string } | null;
  project: { name: string } | null;
  paper: { id: string; doi: string | null; ids: Record<string, string> | null; title: string; year: number | null } | null;
};

/** 내가 볼 수 있는 모든 프로젝트에서 각 논문이 어디에 보관됐는지 색인을 만든다 */
export async function placementIndex(supabase: Supa) {
  const { data } = await supabase
    .from("project_papers")
    .select("project_id, subtopic:subtopics(name), project:projects(name), paper:papers(id, doi, ids, title, year)")
    .limit(5000);
  const idx = new Map<string, Placement[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.paper) continue;
    const p: Placement = { projectId: r.project_id, projectName: r.project?.name ?? "", subtopic: r.subtopic?.name ?? null, paperId: r.paper.id };
    const keys = [`t:${titleKey(r.paper.title)}:${r.paper.year ?? ""}`];
    if (r.paper.doi) keys.push(`doi:${r.paper.doi}`);
    if (r.paper.ids?.openalex) keys.push(`oa:${r.paper.ids.openalex}`);
    for (const k of keys) idx.set(k, [...(idx.get(k) ?? []), p]);
  }
  return idx;
}

export function placementsOf(idx: Map<string, Placement[]>, c: Candidate): Placement[] {
  const keys = [c.doi ? `doi:${c.doi}` : null, c.ids.openalex ? `oa:${c.ids.openalex}` : null, `t:${titleKey(c.title)}:${c.year ?? ""}`];
  const out = new Map<string, Placement>();
  for (const k of keys) if (k) for (const p of idx.get(k) ?? []) out.set(p.projectId, p);
  return [...out.values()];
}

export async function annotate(supabase: Supa, results: Candidate[]) {
  const idx = await placementIndex(supabase);
  return results.map((c) => ({ ...c, placements: placementsOf(idx, c) }));
}
