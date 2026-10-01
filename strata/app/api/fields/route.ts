import { body, HttpError, json, must, route } from "@/lib/server/api";
import { listFields } from "@/lib/server/papers";

export const GET = route(async ({ supabase }) => json({ fields: await listFields(supabase) }));

/** 분야 추가 (연구실 공용) */
export const POST = route(async ({ req, supabase }) => {
  const { name, description } = await body<{ name: string; description?: string }>(req);
  if (!name?.trim()) throw new HttpError(400, "분야 이름을 입력해 주세요");
  const fields = await listFields(supabase);
  const color = fields.length % 12;
  const f = must(
    await supabase
      .from("fields")
      .insert({ name: name.trim(), description: description?.trim() ?? "", color, position: fields.length })
      .select("*")
      .single(),
    "분야",
  );
  return json({ field: f });
});
