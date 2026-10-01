// 여러 출처를 기다리거나 Claude를 호출하므로 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { body, HttpError, json, route } from "@/lib/server/api";
import { annotate } from "@/lib/server/membership";
import { SourceError } from "@/lib/sources/http";
import { openAlexByDoi, openAlexCitedBy, openAlexReferences } from "@/lib/sources/openalex";
import { s2Recommendations } from "@/lib/sources/semanticscholar";
import type { Candidate } from "@/lib/types";

/** 인용 추적: 이 논문을 인용한 논문 · 참고문헌 · 비슷한 논문 */
export const POST = route(async ({ req, supabase }) => {
  const { kind, doi, openalexId } = await body<{ kind: "citedBy" | "references" | "similar"; doi?: string | null; openalexId?: string | null }>(req);
  let id = openalexId ?? null;
  if (!id && doi && kind !== "similar") id = (await openAlexByDoi(doi))?.ids.openalex ?? null;
  let items: Candidate[] = [];
  try {
    if (kind === "similar") {
      if (!doi) throw new HttpError(400, "DOI가 있는 논문만 비슷한 논문을 찾을 수 있습니다");
      items = await s2Recommendations(doi);
    } else {
      if (!id) throw new HttpError(404, "OpenAlex에서 이 논문을 찾지 못해 인용 관계를 불러올 수 없습니다");
      items = kind === "citedBy" ? await openAlexCitedBy(id) : await openAlexReferences(id);
    }
  } catch (e) {
    if (e instanceof SourceError) throw new HttpError(502, `${e.source}: ${e.message}`);
    throw e;
  }
  return json({ results: await annotate(supabase, items) });
});
