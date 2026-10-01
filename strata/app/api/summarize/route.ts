// 여러 출처를 기다리거나 Claude를 호출하므로 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { body, json, route } from "@/lib/server/api";
import { summarize } from "@/lib/server/papers";
import type { Candidate } from "@/lib/types";

/** 고른 논문 하나를 요약한다. 이미 요약된 논문이면 재사용한다. */
export const POST = route(async ({ req, supabase, userId }) => {
  const { candidate } = await body<{ candidate: Candidate }>(req);
  const out = await summarize(supabase, userId, candidate);
  const { data: pf } = await supabase.from("paper_fields").select("field_id").eq("paper_id", out.paper.id);
  return json({
    paperId: out.paper.id,
    paper: out.paper,
    summary: out.summary,
    reused: out.reused,
    noAbstract: out.noAbstract,
    fieldIds: (pf ?? []).map((r) => r.field_id),
  });
});
