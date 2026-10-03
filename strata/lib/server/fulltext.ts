import { DetailSchema, PdfMetaSchema } from "@/lib/claude/schemas";
import { DETAIL_SYSTEM, detailUser, PDF_META_SYSTEM } from "@/lib/claude/prompts";
import { pickWork } from "@/lib/consult";
import { cleanDetails, type PaperDetails, summaryFromDetails } from "@/lib/details";
import { bodyForAi, findDoi, sanitizeText, splitReferences } from "@/lib/pdf-text";
import { searchCrossref } from "@/lib/sources/crossref";
import { lookupByDoi } from "@/lib/sources/lookup";
import { openAlexByTitle } from "@/lib/sources/openalex";
import type { Supa } from "@/lib/supabase/server";
import { hasHangul, normalizeDoi, titleKey } from "@/lib/text";
import type { Candidate } from "@/lib/types";
import { HttpError, must } from "./api";
import { runAiWithModel } from "./ai";
import { isMissingTable } from "./alerts";
import { findPaper, listFields, type PaperRow, setAutoFields, upsertPaper } from "./papers";

export interface PdfInput {
  pages: string[];
  pageOffset: number | null;
  fileName?: string | null;
}

const MAX_PAGES = 300;
const MAX_CHARS = 900_000;
/** 분석에 보내는 본문 최대 글자 수 (참고문헌 뺀 뒤). 국문 학술지 논문 한 편은 대개 이 안에 들어간다 */
const ANALYZE_CHARS = 60_000;

const NO_TABLE = "PDF 표가 아직 없습니다. 화면의 안내대로 SQL을 한 번 실행해 주세요.";

function checkInput(p: PdfInput): PdfInput {
  if (!Array.isArray(p.pages) || !p.pages.length || p.pages.some((x) => typeof x !== "string")) throw new HttpError(400, "PDF에서 글자를 읽지 못했습니다");
  if (p.pages.length > MAX_PAGES) throw new HttpError(400, `PDF가 너무 깁니다 (${MAX_PAGES}쪽까지)`);
  const chars = p.pages.reduce((n, x) => n + x.length, 0);
  if (chars > MAX_CHARS) throw new HttpError(400, "PDF 글자가 너무 많습니다");
  if (chars < 200) throw new HttpError(400, "글자가 거의 없는 PDF입니다. 스캔한 이미지 PDF는 글자를 읽을 수 없습니다.");
  const off = p.pageOffset;
  return { pages: p.pages.map(sanitizeText), pageOffset: typeof off === "number" && off >= 0 && off < 5000 ? Math.round(off) : null, fileName: p.fileName ? sanitizeText(p.fileName).slice(0, 200) : null };
}

/** 이 논문이 이 프로젝트에 보관돼 있는지 (본문은 보관한 프로젝트 멤버만 볼 수 있다) */
async function inProject(supabase: Supa, projectId: string, paperId: string) {
  const { data } = await supabase.from("project_papers").select("paper_id").eq("project_id", projectId).eq("paper_id", paperId).maybeSingle();
  return !!data;
}

export async function saveFulltext(supabase: Supa, paperId: string, input: PdfInput) {
  const p = checkInput(input);
  const { error } = await supabase.from("paper_fulltexts").upsert({
    paper_id: paperId,
    pages: p.pages,
    page_offset: p.pageOffset,
    chars: p.pages.reduce((n, x) => n + x.length, 0),
    file_name: p.fileName,
    // 새 PDF를 넣으면 예전 분석은 맞지 않을 수 있어 지운다
    details: null,
    details_model: null,
    analyzed_at: null,
    updated_at: new Date().toISOString(),
  });
  if (isMissingTable(error) || /paper_fulltexts/.test(error?.message ?? "")) throw new HttpError(409, NO_TABLE);
  if (error?.code === "42501") throw new HttpError(403, "편집 권한이 있는 프로젝트의 논문에만 PDF를 넣을 수 있습니다");
  if (error) throw new Error(`PDF: ${error.message}`);
}

/**
 * PDF가 어떤 논문인지 알아낸다: DOI가 있으면 데이터베이스에서, 없으면 AI가 첫 쪽에서 서지 정보를 읽고
 * 같은 제목·저자를 OpenAlex·Crossref에서 찾아 보탠다. 못 찾으면 PDF에서 읽은 정보만으로 만든다.
 */
async function identify(supabase: Supa, userId: string, pages: string[]): Promise<{ candidate: Candidate; how: "doi" | "database" | "pdf" }> {
  const head = pages.slice(0, 2).join("\n");
  const doi = normalizeDoi(findDoi(head));
  if (doi) {
    const c = await lookupByDoi(doi);
    if (c) return { candidate: c, how: "doi" };
  }
  const { data: m } = await runAiWithModel(supabase, userId, "pdf", {
    system: PDF_META_SYSTEM,
    user: pages.slice(0, 3).join("\n\n").slice(0, 7000),
    schema: PdfMetaSchema,
    maxTokens: 1500,
    cheap: true,
  });
  const title = sanitizeText(m.title).replace(/\s+/g, " ").trim();
  if (!title) throw new HttpError(422, "PDF에서 논문 제목을 찾지 못했습니다. 이미 보관한 논문 행의 “PDF 넣기”로 넣어 주세요.");
  const year = m.year > 1900 && m.year < 2100 ? Math.round(m.year) : null;
  const authors = m.authors.map((a) => sanitizeText(a).trim()).filter(Boolean);
  const named = { author: authors[0] ?? "", year, title };
  // 데이터베이스에 같은 논문이 있으면 DOI·피인용 수 등을 함께 얻는다
  const [oa, cr] = await Promise.all([
    openAlexByTitle(title, year).catch(() => null),
    hasHangul(title) ? searchCrossref(`${title} ${named.author}`, { rows: 8 }).then((r) => r.items).catch(() => [] as Candidate[]) : Promise.resolve([] as Candidate[]),
  ]);
  const hit = named.author ? pickWork(named, [...(oa ? [oa] : []), ...cr]) : oa;
  const abstract = sanitizeText(m.abstract).trim() || null;
  if (hit) {
    return {
      candidate: { ...hit, abstract: hit.abstract && hit.abstract.length >= (abstract?.length ?? 0) ? hit.abstract : abstract, abstractSource: hit.abstract ? hit.abstractSource : abstract ? "pdf" : null },
      how: "database",
    };
  }
  const kind = ["article", "dissertation", "report", "book-chapter"].includes(m.kind) ? m.kind : null;
  return {
    candidate: {
      key: `t:${titleKey(title)}:${year ?? ""}`,
      doi: null,
      title,
      authors,
      year,
      venue: sanitizeText(m.venue).trim() || null,
      abstract,
      abstractSource: abstract ? "pdf" : null,
      citations: null,
      url: null,
      oaUrl: null,
      lang: hasHangul(title) ? "ko" : null,
      kind,
      ids: {},
      sources: [],
      impact: {},
    },
    how: "pdf",
  };
}

/**
 * PDF 넣기. paperId가 있으면 그 논문에 붙이고, 없으면 어떤 논문인지 알아내 이 프로젝트에 보관한 뒤 붙인다.
 * 이미 보관한 논문과 같으면 새로 만들지 않고 그 논문에 붙인다.
 */
export async function addPdf(supabase: Supa, userId: string, projectId: string, input: PdfInput & { paperId?: string | null }) {
  const p = checkInput(input);
  let paper: PaperRow;
  let how: "attached" | "doi" | "database" | "pdf" = "attached";
  let added = false;
  if (input.paperId) {
    if (!(await inProject(supabase, projectId, input.paperId))) throw new HttpError(404, "이 프로젝트에 보관된 논문이 아닙니다");
    paper = must(await supabase.from("papers").select("*").eq("id", input.paperId).single(), "논문") as PaperRow;
  } else {
    // 표가 없으면 AI를 부르기 전에 알린다
    const probe = await supabase.from("paper_fulltexts").select("paper_id").limit(1);
    if (isMissingTable(probe.error) || /paper_fulltexts/.test(probe.error?.message ?? "")) throw new HttpError(409, NO_TABLE);
    const found = await identify(supabase, userId, p.pages);
    how = found.how;
    paper = (await findPaper(supabase, found.candidate)) ?? (await upsertPaper(supabase, found.candidate));
    if (!(await inProject(supabase, projectId, paper.id))) {
      // 소주제가 이미 정해진 보관 기록은 덮어쓰지 않는다
      must(await supabase.from("project_papers").insert({ project_id: projectId, paper_id: paper.id, added_by: userId }), "보관");
      added = true;
    }
  }
  await saveFulltext(supabase, paper.id, p);
  return { paperId: paper.id, title: paper.title, year: paper.year, authors: paper.authors, how, added };
}

/**
 * 본문 상세 분석: 참고문헌을 떼고, 쪽 표시를 붙여 저렴한 모델로 분석표 항목을 뽑는다.
 * 인용문은 원문에서 글자 그대로 확인된 것만 남긴다. 요약이 없던 논문은 요약도 채운다.
 */
export async function analyzePaper(supabase: Supa, userId: string, paperId: string): Promise<PaperDetails> {
  const { data: row, error } = await supabase.from("paper_fulltexts").select("pages, page_offset").eq("paper_id", paperId).maybeSingle();
  if (isMissingTable(error) || /paper_fulltexts/.test(error?.message ?? "")) throw new HttpError(409, NO_TABLE);
  if (!row) throw new HttpError(404, "이 논문에 넣은 PDF가 없습니다");
  const pages = row.pages as string[];
  const offset = row.page_offset as number | null;
  const [{ data: paper }, fieldsAll] = await Promise.all([supabase.from("papers").select("title, year").eq("id", paperId).single(), listFields(supabase)]);
  const fields = fieldsAll.filter((f) => !f.hidden);

  const { body } = splitReferences(pages);
  const b = bodyForAi(body, offset, ANALYZE_CHARS);
  const { data, model } = await runAiWithModel(supabase, userId, "pdf", {
    system: DETAIL_SYSTEM,
    user: detailUser({ title: paper?.title ?? "", year: paper?.year ?? null }, fields, b.text),
    schema: DetailSchema,
    maxTokens: 5000,
    cheap: true,
  });
  const details = cleanDetails(data, { pages, offset, range: { from: b.firstPage, to: b.lastPage, truncated: b.truncated } });
  const now = new Date().toISOString();
  const upd = await supabase.from("paper_fulltexts").update({ details, details_model: model, analyzed_at: now, updated_at: now }).eq("paper_id", paperId).select("paper_id");
  if (upd.error?.code === "42501" || (!upd.error && !upd.data?.length)) throw new HttpError(403, "편집 권한이 있는 프로젝트의 논문만 분석할 수 있습니다");
  if (upd.error) throw new Error(`분석 저장: ${upd.error.message}`);

  const { data: has } = await supabase.from("summaries").select("paper_id").eq("paper_id", paperId).maybeSingle();
  if (!has) {
    const names = data.fields.filter((n) => fields.some((f) => f.name === n));
    await supabase.from("summaries").insert({ paper_id: paperId, data: summaryFromDetails(details, names), model, created_by: userId });
    await setAutoFields(supabase, paperId, names, fields);
  }
  return details;
}
