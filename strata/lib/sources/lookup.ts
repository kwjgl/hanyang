import { normalizeDoi } from "@/lib/text";
import type { Candidate } from "@/lib/types";
import { crossrefByDoi } from "./crossref";
import { openAlexByDoi } from "./openalex";
import { s2AbstractByDoi } from "./semanticscholar";

/** DOI나 DOI가 들어 있는 주소로 논문 정보를 가져온다 (직접 추가용) */
export async function lookupByDoi(input: string): Promise<Candidate | null> {
  const doi = normalizeDoi(input);
  if (!doi) return null;
  const [oa, cr] = await Promise.all([openAlexByDoi(doi), crossrefByDoi(doi)]);
  const base = oa ?? cr;
  if (!base) return null;
  if (!base.abstract && cr?.abstract) {
    base.abstract = cr.abstract;
    base.abstractSource = "crossref";
  }
  if (oa && cr) base.sources = [...new Set([...oa.sources, ...cr.sources])];
  return base;
}

/**
 * 요약하기 전에 초록을 최대한 채운다.
 * OpenAlex는 일부 출판사 초록이 빠져 있어서 Semantic Scholar·Crossref를 차례로 본다.
 */
export async function ensureAbstract(c: Candidate): Promise<Candidate> {
  if (c.abstract && c.abstract.length > 80) return c;
  if (!c.doi) return c;
  const s2 = await s2AbstractByDoi(c.doi);
  if (s2.abstract) {
    return { ...c, abstract: s2.abstract, abstractSource: "s2", impact: { ...c.impact, influential: c.impact.influential ?? s2.influential } };
  }
  const cr = await crossrefByDoi(c.doi);
  if (cr?.abstract) return { ...c, abstract: cr.abstract, abstractSource: "crossref" };
  const oa = c.ids.openalex ? null : await openAlexByDoi(c.doi);
  if (oa?.abstract) return { ...c, abstract: oa.abstract, abstractSource: "openalex" };
  return c;
}
