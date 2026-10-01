import type { Supa } from "@/lib/supabase/server";
import type { Field, ProjectRole, ReadStatus, SummaryData } from "@/lib/types";
import { monthUsage } from "./ai";
import type { PaperRow } from "./papers";

export interface ShellProject {
  id: string;
  name: string;
  count: number;
  members: number;
  shared: boolean;
}

export interface ShellData {
  me: { id: string; name: string; email: string };
  projects: ShellProject[];
  lib: { all: number; todo: number; recent: number; star: number };
  fields: (Field & { count: number })[];
  monthUsage: number;
}

type ProjRow = { id: string; name: string; created_by: string; project_members: { user_id: string; role: ProjectRole }[]; project_papers: { count: number }[] };

export async function loadShell(supabase: Supa, userId: string): Promise<ShellData> {
  const [{ data: me }, { data: projs }, { data: pp }, { data: ups }, { data: fields }, usage] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle(),
    supabase.from("projects").select("id, name, created_by, project_members(user_id, role), project_papers(count)").order("created_at"),
    supabase.from("project_papers").select("paper_id, added_at, paper:papers(paper_fields(field_id))").limit(5000),
    supabase.from("user_papers").select("paper_id, status, starred").eq("user_id", userId),
    supabase.from("fields").select("*").order("position"),
    monthUsage(supabase, userId),
  ]);

  const papers = new Map<string, { addedAt: string; fieldIds: string[] }>();
  for (const r of (pp ?? []) as unknown as { paper_id: string; added_at: string; paper: { paper_fields: { field_id: string }[] } | null }[]) {
    const prev = papers.get(r.paper_id);
    const fieldIds = (r.paper?.paper_fields ?? []).map((f) => f.field_id);
    if (!prev || prev.addedAt < r.added_at) papers.set(r.paper_id, { addedAt: r.added_at, fieldIds });
  }
  const up = new Map((ups ?? []).map((u) => [u.paper_id, u]));
  const twoWeeks = Date.now() - 14 * 864e5;
  const ids = [...papers.keys()];

  return {
    me: { id: userId, name: me?.display_name ?? "나", email: me?.email ?? "" },
    projects: ((projs ?? []) as unknown as ProjRow[]).map((p) => {
      const mine = p.project_members.find((m) => m.user_id === userId);
      return { id: p.id, name: p.name, count: p.project_papers[0]?.count ?? 0, members: p.project_members.length, shared: mine?.role !== "owner" };
    }),
    lib: {
      all: ids.length,
      todo: ids.filter((i) => (up.get(i)?.status ?? "todo") === "todo").length,
      recent: ids.filter((i) => new Date(papers.get(i)!.addedAt).getTime() > twoWeeks).length,
      star: ids.filter((i) => up.get(i)?.starred).length,
    },
    fields: ((fields ?? []) as Field[]).filter((f) => !f.hidden).map((f) => ({ ...f, count: ids.filter((i) => papers.get(i)!.fieldIds.includes(f.id)).length })),
    monthUsage: usage.used,
  };
}

export interface Note {
  id: string;
  body: string;
  visibility: "shared" | "private";
  user_id: string;
  created_at: string;
}

export interface TableRow {
  paper: PaperRow;
  summary: SummaryData | null;
  fieldIds: string[];
  fieldSource: "auto" | "manual" | null;
  subtopicId: string | null;
  addedBy: string | null;
  addedAt: string;
  status: ReadStatus;
  starred: boolean;
  notes: Note[];
  /** 같은 논문이 들어 있는 다른 프로젝트 이름 */
  elsewhere: string[];
}

export interface ProjectData {
  project: { id: string; name: string; research_question: string; default_query: string; field_ids: string[]; created_by: string };
  role: ProjectRole;
  members: { user_id: string; role: ProjectRole; name: string; email: string }[];
  invites: { email: string; role: ProjectRole }[];
  subtopics: { id: string; name: string; position: number }[];
  fields: Field[];
  rows: TableRow[];
  meId: string;
}

type PPRow = {
  paper_id: string;
  subtopic_id: string | null;
  added_by: string | null;
  added_at: string;
  paper: (PaperRow & { summaries: { data: SummaryData } | { data: SummaryData }[] | null; paper_fields: { field_id: string; source: "auto" | "manual" }[] }) | null;
};

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export async function loadProject(supabase: Supa, userId: string, id: string): Promise<ProjectData | null> {
  const { data: project } = await supabase.from("projects").select("id, name, research_question, default_query, field_ids, created_by").eq("id", id).maybeSingle();
  if (!project) return null;
  const [{ data: members }, { data: invites }, { data: subs }, { data: fields }, { data: pp }, { data: notes }, { data: profiles }] = await Promise.all([
    supabase.from("project_members").select("user_id, role").eq("project_id", id),
    supabase.from("project_invites").select("email, role").eq("project_id", id),
    supabase.from("subtopics").select("id, name, position").eq("project_id", id).order("position"),
    supabase.from("fields").select("*").order("position"),
    supabase.from("project_papers").select("paper_id, subtopic_id, added_by, added_at, paper:papers(*, summaries(data), paper_fields(field_id, source))").eq("project_id", id),
    supabase.from("paper_notes").select("id, paper_id, body, visibility, user_id, created_at").eq("project_id", id).order("created_at"),
    supabase.from("profiles").select("id, display_name, email"),
  ]);
  const rowsRaw = ((pp ?? []) as unknown as PPRow[]).filter((r) => r.paper);
  const paperIds = rowsRaw.map((r) => r.paper_id);
  const [{ data: ups }, { data: elsewhere }] = await Promise.all([
    paperIds.length ? supabase.from("user_papers").select("paper_id, status, starred").eq("user_id", userId).in("paper_id", paperIds) : Promise.resolve({ data: [] }),
    paperIds.length
      ? supabase.from("project_papers").select("paper_id, project:projects(name)").in("paper_id", paperIds).neq("project_id", id)
      : Promise.resolve({ data: [] }),
  ]);
  const name = new Map((profiles ?? []).map((p) => [p.id, { name: p.display_name ?? p.email ?? "", email: p.email ?? "" }]));
  const up = new Map(((ups ?? []) as { paper_id: string; status: ReadStatus; starred: boolean }[]).map((u) => [u.paper_id, u]));
  const other = new Map<string, string[]>();
  for (const e of (elsewhere ?? []) as unknown as { paper_id: string; project: { name: string } | null }[]) {
    if (e.project) other.set(e.paper_id, [...(other.get(e.paper_id) ?? []), e.project.name]);
  }
  const myRole = (members ?? []).find((m) => m.user_id === userId)?.role as ProjectRole | undefined;

  return {
    project: project as ProjectData["project"],
    role: myRole ?? "viewer",
    members: (members ?? []).map((m) => ({ user_id: m.user_id, role: m.role as ProjectRole, ...(name.get(m.user_id) ?? { name: "?", email: "" }) })),
    invites: (invites ?? []) as ProjectData["invites"],
    subtopics: subs ?? [],
    fields: (fields ?? []) as Field[],
    meId: userId,
    rows: rowsRaw.map((r) => {
      const { summaries, paper_fields, ...paper } = r.paper!;
      const u = up.get(r.paper_id);
      return {
        paper: paper as PaperRow,
        summary: one(summaries)?.data ?? null,
        fieldIds: (paper_fields ?? []).map((f) => f.field_id),
        fieldSource: paper_fields?.[0]?.source ?? null,
        subtopicId: r.subtopic_id,
        addedBy: r.added_by ? (name.get(r.added_by)?.name ?? null) : null,
        addedAt: r.added_at,
        status: u?.status ?? "todo",
        starred: u?.starred ?? false,
        notes: ((notes ?? []) as (Note & { paper_id: string })[]).filter((n) => n.paper_id === r.paper_id),
        elsewhere: other.get(r.paper_id) ?? [],
      };
    }),
  };
}

export interface LibraryRow {
  paper: PaperRow;
  summary: SummaryData | null;
  fieldIds: string[];
  status: ReadStatus;
  starred: boolean;
  addedAt: string;
  projects: { id: string; name: string; subtopic: string | null }[];
}

export async function loadLibrary(supabase: Supa, userId: string): Promise<{ rows: LibraryRow[]; fields: Field[]; editable: { id: string; name: string }[] }> {
  const [{ data: pp }, { data: ups }, { data: fields }, { data: mem }] = await Promise.all([
    supabase
      .from("project_papers")
      .select("paper_id, added_at, project_id, project:projects(name), subtopic:subtopics(name), paper:papers(*, summaries(data), paper_fields(field_id))")
      .limit(5000),
    supabase.from("user_papers").select("paper_id, status, starred").eq("user_id", userId),
    supabase.from("fields").select("*").order("position"),
    supabase.from("project_members").select("project_id, role, project:projects(name)").eq("user_id", userId),
  ]);
  const up = new Map(((ups ?? []) as { paper_id: string; status: ReadStatus; starred: boolean }[]).map((u) => [u.paper_id, u]));
  const rows = new Map<string, LibraryRow>();
  type R = { paper_id: string; added_at: string; project_id: string; project: { name: string } | null; subtopic: { name: string } | null; paper: PPRow["paper"] };
  for (const r of (pp ?? []) as unknown as R[]) {
    if (!r.paper) continue;
    const { summaries, paper_fields, ...paper } = r.paper;
    const cur = rows.get(r.paper_id);
    const place = { id: r.project_id, name: r.project?.name ?? "", subtopic: r.subtopic?.name ?? null };
    if (cur) {
      cur.projects.push(place);
      if (cur.addedAt < r.added_at) cur.addedAt = r.added_at;
      continue;
    }
    const u = up.get(r.paper_id);
    rows.set(r.paper_id, {
      paper: paper as PaperRow,
      summary: one(summaries)?.data ?? null,
      fieldIds: (paper_fields ?? []).map((f) => f.field_id),
      status: u?.status ?? "todo",
      starred: u?.starred ?? false,
      addedAt: r.added_at,
      projects: [place],
    });
  }
  const editable = ((mem ?? []) as unknown as { project_id: string; role: ProjectRole; project: { name: string } | null }[])
    .filter((m) => m.role !== "viewer")
    .map((m) => ({ id: m.project_id, name: m.project?.name ?? "" }));
  return { rows: [...rows.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt)), fields: (fields ?? []) as Field[], editable };
}
