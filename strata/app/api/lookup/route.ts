import { body, HttpError, json, route } from "@/lib/server/api";
import { annotate } from "@/lib/server/membership";
import { lookupByDoi } from "@/lib/sources/lookup";
import { normalizeDoi } from "@/lib/text";

/** DOI·주소를 붙여넣어 논문 정보를 가져온다 */
export const POST = route(async ({ req, supabase }) => {
  const { input } = await body<{ input: string }>(req);
  if (!normalizeDoi(input ?? "")) throw new HttpError(400, "DOI를 찾지 못했습니다. DOI가 없는 자료는 직접 입력으로 추가해 주세요.");
  const c = await lookupByDoi(input);
  if (!c) throw new HttpError(404, "이 DOI로 논문 정보를 찾지 못했습니다. 직접 입력으로 추가해 주세요.");
  const [annotated] = await annotate(supabase, [c]);
  return json({ candidate: annotated });
});
