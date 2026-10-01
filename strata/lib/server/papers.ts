import { ClassifySchema, SummarySchema } from "@/lib/claude/schemas";
import { CLASSIFY_SYSTEM, classifyUser, SUMMARY_SYSTEM, summaryUser } from "@/lib/claude/prompts";
import { ensureAbstract } from "@/lib/sources/lookup";
import type { Supa } from "@/lib/supabase/server";
import type { Candidate, Field, SummaryData } from "@/lib/types";
import { HttpError, must } from "./api";
import { runAi, runAiWithModel } from "./ai";

export interface PaperRow {
  id: string;
  doi: string | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  abstract_source: string | null;
  url: string | null;
  oa_url: string | null;
  citations: number | null;
  impact: Candidate["impact"];
  ids: Candidate["ids"];
  lang: string | null;
  kind: string | null;
  sources: string[];
}

export const toCandidate = (p: PaperRow): Candidate => ({
  key: p.doi ? `doi:${p.doi}` : `id:${p.id}`,
  doi: p.doi,
  title: p.title,
  authors: p.authors ?? [],
  year: p.year,
  venue: p.venue,
  abstract: p.abstract,
  abstractSource: p.abstract_source,
  citations: p.citations,
  url: p.url,
  oaUrl: p.oa_url,
  lang: p.lang,
  kind: p.kind,
  ids: p.ids ?? {},
  sources: (p.sources ?? []) as Candidate["sources"],
  impact: p.impact ?? {},
});

/** 이미 있는 논문을 DOI → OpenAlex ID → 제목+연도 순으로 찾는다 */
export async function findPaper(supabase: Supa, c: Pick<Candidate, "doi" | "ids" | "title" | "year">): Promise<PaperRow | null> {
  if (c.doi) {
    const { data } = await supabase.from("papers").select("*").eq("doi", c.doi).maybeSingle();
    if (data) return data as PaperRow;
  }
  if (c.ids.openalex) {
    const { data } = await supabase.from("papers").select("*").eq("ids->>openalex", c.ids.openalex).limit(1).maybeSingle();
    if (data) return data as PaperRow;
  }
  let q = supabase.from("papers").select("*").ilike("title", c.title.replace(/[%_\\]/g, (m) => `\\${m}`));
  q = c.year ? q.eq("year", c.year) : q.is("year", null);
  const { data } = await q.limit(1).maybeSingle();
  return (data as PaperRow) ?? null;
}

/** 검색 결과를 공용 논문 표에 넣거나, 이미 있으면 빈 칸만 채운다 */
export async function upsertPaper(supabase: Supa, c: Candidate): Promise<PaperRow> {
  const existing = await findPaper(supabase, c);
  const row = {
    doi: c.doi,
    title: c.title,
    authors: c.authors,
    year: c.year,
    venue: c.venue,
    abstract: c.abstract,
    abstract_source: c.abstractSource,
    url: c.url,
    oa_url: c.oaUrl,
    citations: c.citations,
    impact: c.impact ?? {},
    ids: c.ids ?? {},
    lang: c.lang,
    kind: c.kind,
    sources: c.sources ?? [],
  };
  if (!existing) {
    return must(await supabase.from("papers").insert(row).select("*").single(), "논문") as PaperRow;
  }
  const longer = (c.abstract?.length ?? 0) > (existing.abstract?.length ?? 0);
  const patch = {
    doi: existing.doi ?? row.doi,
    venue: existing.venue ?? row.venue,
    abstract: longer ? row.abstract : existing.abstract,
    abstract_source: longer ? row.abstract_source : existing.abstract_source,
    oa_url: existing.oa_url ?? row.oa_url,
    citations: existing.citations == null && row.citations == null ? null : Math.max(existing.citations ?? 0, row.citations ?? 0),
    impact: { ...existing.impact, ...Object.fromEntries(Object.entries(row.impact).filter(([, v]) => v != null)) },
    ids: { ...row.ids, ...existing.ids },
    sources: [...new Set([...(existing.sources ?? []), ...row.sources])],
    updated_at: new Date().toISOString(),
  };
  return must(await supabase.from("papers").update(patch).eq("id", existing.id).select("*").single(), "논문") as PaperRow;
}

export async function listFields(supabase: Supa): Promise<Field[]> {
  return must(await supabase.from("fields").select("*").order("position"), "분야") as Field[];
}

/** 자동 분류 결과를 저장한다. 사람이 직접 지정한 분야(manual)는 건드리지 않는다. */
export async function setAutoFields(supabase: Supa, paperId: string, names: string[], fields: Field[]) {
  const ids = names.map((n) => fields.find((f) => f.name === n.trim())?.id).filter((x): x is string => !!x);
  const { data: manual } = await supabase.from("paper_fields").select("field_id").eq("paper_id", paperId).eq("source", "manual");
  if (manual?.length) return;
  await supabase.from("paper_fields").delete().eq("paper_id", paperId).eq("source", "auto");
  if (ids.length) {
    await supabase.from("paper_fields").insert([...new Set(ids)].map((field_id) => ({ paper_id: paperId, field_id, source: "auto" })));
  }
}

export interface SummarizeOutcome {
  paper: PaperRow;
  summary: SummaryData | null;
  reused: boolean;
  noAbstract: boolean;
}

/**
 * 논문 하나를 요약한다.
 * 같은 논문의 요약이 이미 있으면(다른 멤버·다른 프로젝트가 만든 것 포함) 그대로 돌려주고 비용을 쓰지 않는다.
 */
export async function summarize(supabase: Supa, userId: string, input: Candidate): Promise<SummarizeOutcome> {
  if (!input?.title) throw new HttpError(400, "논문 정보가 없습니다");
  const existing = await findPaper(supabase, input);
  if (existing) {
    const { data } = await supabase.from("summaries").select("data").eq("paper_id", existing.id).maybeSingle();
    if (data) {
      const paper = await upsertPaper(supabase, input);
      return { paper, summary: data.data as SummaryData, reused: true, noAbstract: false };
    }
  }

  const filled = await ensureAbstract(input);
  const paper = await upsertPaper(supabase, filled);
  if (!paper.abstract || paper.abstract.length < 40) {
    return { paper, summary: null, reused: false, noAbstract: true };
  }

  const fields = (await listFields(supabase)).filter((f) => !f.hidden);
  const { data, model } = await runAiWithModel(supabase, userId, "summary", {
    system: SUMMARY_SYSTEM,
    user: summaryUser(toCandidate(paper), fields),
    schema: SummarySchema,
  });
  const summary: SummaryData = { ...data, fields: data.fields.filter((n) => fields.some((f) => f.name === n)) };
  must(
    await supabase.from("summaries").upsert({ paper_id: paper.id, data: summary, model, created_by: userId }),
    "요약",
  );
  await setAutoFields(supabase, paper.id, summary.fields, fields);
  return { paper, summary, reused: false, noAbstract: false };
}

/** 분야 목록이 바뀐 뒤 다시 분류한다 (자동 분류만 교체) */
export async function reclassify(supabase: Supa, userId: string, paperId: string) {
  const paper = must(await supabase.from("papers").select("*").eq("id", paperId).single(), "논문") as PaperRow;
  const { data: s } = await supabase.from("summaries").select("data").eq("paper_id", paperId).maybeSingle();
  const fields = (await listFields(supabase)).filter((f) => !f.hidden);
  const data = await runAi(supabase, userId, "classify", {
    system: CLASSIFY_SYSTEM,
    user: classifyUser(toCandidate(paper), (s?.data as SummaryData | undefined)?.one_line ?? null, fields),
    schema: ClassifySchema,
    maxTokens: 1500,
  });
  await setAutoFields(supabase, paperId, data.fields, fields);
  return data;
}
