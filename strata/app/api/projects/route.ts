import { body, HttpError, json, must, route } from "@/lib/server/api";

/** 새 프로젝트 (만든 사람은 자동으로 소유자) */
export const POST = route(async ({ req, supabase, userId }) => {
  const b = await body<{ name: string; researchQuestion?: string; defaultQuery?: string; fieldIds?: string[]; subtopics?: string[] }>(req);
  if (!b.name?.trim()) throw new HttpError(400, "프로젝트 이름을 입력해 주세요");
  const p = must(
    await supabase
      .from("projects")
      .insert({
        name: b.name.trim(),
        research_question: b.researchQuestion?.trim() ?? "",
        default_query: b.defaultQuery?.trim() ?? "",
        field_ids: b.fieldIds ?? [],
        created_by: userId,
      })
      .select("id")
      .single(),
    "프로젝트",
  );
  const subs = [...new Set((b.subtopics ?? []).map((s) => s.trim()).filter(Boolean))];
  if (subs.length) must(await supabase.from("subtopics").insert(subs.map((name, position) => ({ project_id: p.id, name, position }))), "소주제");
  return json({ id: p.id });
});
