// 여러 출처를 기다리거나 Claude를 호출하므로 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { ExpandSchema } from "@/lib/claude/schemas";
import { EXPAND_SYSTEM, expandUser } from "@/lib/claude/prompts";
import { runAi } from "@/lib/server/ai";
import { body, HttpError, json, route } from "@/lib/server/api";

/** 검색 주제를 한국어·영어 학술 검색어로 넓힌다 */
export const POST = route(async ({ req, supabase, userId }) => {
  const { query, projectId } = await body<{ query: string; projectId?: string }>(req);
  if (!query?.trim()) throw new HttpError(400, "검색어를 입력해 주세요");
  let ctx: { researchQuestion?: string; fields?: string[] } = {};
  if (projectId) {
    const { data: p } = await supabase.from("projects").select("research_question, field_ids").eq("id", projectId).maybeSingle();
    if (p) {
      const { data: fs } = p.field_ids?.length ? await supabase.from("fields").select("name").in("id", p.field_ids) : { data: [] };
      ctx = { researchQuestion: p.research_question || undefined, fields: (fs ?? []).map((f) => f.name) };
    }
  }
  const out = await runAi(supabase, userId, "expand", { system: EXPAND_SYSTEM, user: expandUser(query.trim(), ctx), schema: ExpandSchema, maxTokens: 1500 });
  const seen = new Set([query.trim().toLowerCase()]);
  const terms = [...out.terms_en, ...out.terms_ko]
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  return json({ terms });
});
