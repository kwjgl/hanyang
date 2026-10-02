export const maxDuration = 60;

import { json, route } from "@/lib/server/api";

/**
 * 내가 볼 수 있는 모든 프로젝트를 JSON 하나로 내려받는다 (백업용).
 * 프로젝트·소주제·논문(서지·초록·요약·분야)·메모(공동 메모와 내 메모)·내 읽기 상태·별표·저장한 검색어·공백 지도 저장본.
 */
export const GET = route(async ({ supabase, userId }) => {
  const [projects, members, subs, pp, notes, ups, fields, searches, maps, profiles] = await Promise.all([
    supabase.from("projects").select("id, name, research_question, default_query, field_ids, created_by, created_at"),
    supabase.from("project_members").select("project_id, user_id, role"),
    supabase.from("subtopics").select("id, project_id, name, position").order("position"),
    supabase
      .from("project_papers")
      .select("project_id, subtopic_id, added_by, added_at, paper:papers(id, doi, title, authors, year, venue, abstract, url, oa_url, citations, impact, ids, lang, kind, summaries(data, model, created_at), paper_fields(field_id, source))")
      .limit(10000),
    supabase.from("paper_notes").select("project_id, paper_id, body, visibility, user_id, created_at"),
    supabase.from("user_papers").select("paper_id, status, starred").eq("user_id", userId),
    supabase.from("fields").select("id, name, description"),
    supabase.from("searches").select("project_id, query, terms, created_at").eq("saved", true),
    supabase.from("gap_maps").select("project_id, label, created_at, config, items").eq("saved", true),
    supabase.from("profiles").select("id, display_name, email"),
  ]);
  const name = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name ?? p.email]));
  const fieldName = new Map((fields.data ?? []).map((f) => [f.id, f.name]));
  const up = new Map((ups.data ?? []).map((u) => [u.paper_id, u]));
  type PP = { project_id: string; subtopic_id: string | null; added_by: string | null; added_at: string; paper: Record<string, unknown> & { id: string; summaries: unknown; paper_fields: { field_id: string; source: string }[] | null } };

  const out = {
    format: "strata-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: name.get(userId) ?? null,
    fields: fields.data ?? [],
    projects: (projects.data ?? []).map((p) => {
      const subtopics = (subs.data ?? []).filter((s) => s.project_id === p.id);
      return {
        name: p.name,
        researchQuestion: p.research_question,
        defaultQuery: p.default_query,
        fields: (p.field_ids ?? []).map((id: string) => fieldName.get(id)).filter(Boolean),
        createdAt: p.created_at,
        owner: name.get(p.created_by) ?? null,
        members: (members.data ?? []).filter((m) => m.project_id === p.id).map((m) => ({ name: name.get(m.user_id) ?? null, role: m.role })),
        subtopics: subtopics.map((s) => s.name),
        savedSearches: (searches.data ?? []).filter((s) => s.project_id === p.id).map(({ project_id: _, ...s }) => s),
        gapMaps: (maps.data ?? []).filter((m) => m.project_id === p.id).map(({ project_id: _, ...m }) => m),
        papers: ((pp.data ?? []) as unknown as PP[])
          .filter((r) => r.project_id === p.id && r.paper)
          .map((r) => {
            const { summaries, paper_fields, id, ...paper } = r.paper;
            const s = Array.isArray(summaries) ? summaries[0] : summaries;
            const u = up.get(id);
            return {
              ...paper,
              subtopic: subtopics.find((x) => x.id === r.subtopic_id)?.name ?? null,
              addedBy: r.added_by ? (name.get(r.added_by) ?? null) : null,
              addedAt: r.added_at,
              fields: (paper_fields ?? []).map((f) => fieldName.get(f.field_id)).filter(Boolean),
              summary: s ?? null,
              myStatus: u?.status ?? "todo",
              myStar: u?.starred ?? false,
              notes: (notes.data ?? [])
                .filter((n) => n.project_id === p.id && n.paper_id === id)
                .map((n) => ({ by: name.get(n.user_id) ?? null, body: n.body, visibility: n.visibility, at: n.created_at })),
            };
          }),
      };
    }),
  };
  return json(out);
});
