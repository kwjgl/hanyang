import { body, HttpError, json, must, route } from "@/lib/server/api";

export const POST = route(async ({ req, supabase, userId }) => {
  const { projectId, paperId, text, visibility } = await body<{ projectId: string; paperId: string; text: string; visibility: "shared" | "private" }>(req);
  if (!text?.trim()) throw new HttpError(400, "메모 내용을 입력해 주세요");
  const note = must(
    await supabase
      .from("paper_notes")
      .insert({ project_id: projectId, paper_id: paperId, user_id: userId, body: text.trim(), visibility: visibility === "private" ? "private" : "shared" })
      .select("*")
      .single(),
    "메모",
  );
  return json({ note });
});
