import { ConsultSchema, OutlineSchema } from "@/lib/claude/schemas";
import { CONSULT_SYSTEM, consultUser, OUTLINE_SYSTEM } from "@/lib/claude/prompts";
import { type Consult, type ConsultMsg, type ConsultTheory, type ConsultWork, historyText, MAX_MESSAGES, outlineBody, pickWork, sameWork, verifiedWorks } from "@/lib/consult";
import { searchCrossref } from "@/lib/sources/crossref";
import { searchOpenAlex } from "@/lib/sources/openalex";
import { searchScholar, serpKey } from "@/lib/sources/scholar";
import type { Supa } from "@/lib/supabase/server";
import { hasHangul } from "@/lib/text";
import type { Candidate, SearchPage } from "@/lib/types";
import { HttpError, must } from "./api";
import { runAi } from "./ai";
import { type Saved, savedPapers } from "./cite";
import { annotate } from "./membership";

const MAX_THEORIES = 4;
const MAX_WORKS = 3;

const settle = async (p: Promise<SearchPage>) => {
  try {
    return (await p).items;
  } catch {
    return [] as Candidate[];
  }
};

/** AI가 이름을 댄 문헌을 보관함 → OpenAlex(국문이면 Crossref도)에서 찾아 실제로 있는지 확인한다 */
async function verifyWork(w: { author: string; year: number; title: string }, saved: Saved[]): Promise<ConsultWork> {
  const named = { author: w.author.trim(), year: w.year > 0 ? Math.round(w.year) : null, title: w.title.trim() };
  const mine = saved.find((s) => sameWork(named, s.candidate));
  if (mine) return { ...named, status: "verified", candidate: mine.candidate, paperId: mine.paperId };
  const lists = await Promise.all([
    settle(searchOpenAlex(named.title, { perPage: 8 })),
    // Crossref는 제목과 저자를 함께 넣어도 알아서 나눠 찾는다
    hasHangul(named.title) ? settle(searchCrossref(`${named.title} ${named.author}`, { rows: 10 })) : Promise.resolve([] as Candidate[]),
  ]);
  const hit = pickWork(named, lists.flat());
  return hit ? { ...named, status: "verified", candidate: hit, paperId: null } : { ...named, status: "unverified" };
}

/** 한 번 답할 때 구글 학술검색으로 다시 확인하는 최대 편수 (SerpApi 1편당 1회) */
const MAX_SCHOLAR = 3;

/**
 * 데이터베이스에서 못 찾은 문헌을 구글 학술검색으로 한 번 더 찾는다.
 * 구글 학술검색은 KCI·DBpia·RISS를 함께 훑어 국내 문헌과 책을 잘 찾는다. 국문 문헌을 먼저 확인한다.
 */
async function verifyWithScholar(works: ConsultWork[]) {
  const todo = works
    .filter((w) => w.status === "unverified")
    .sort((a, b) => Number(hasHangul(b.title)) - Number(hasHangul(a.title)))
    .slice(0, MAX_SCHOLAR);
  await Promise.all(
    todo.map(async (w) => {
      const hit = pickWork(w, await settle(searchScholar(`${w.title} ${w.author}`)));
      w.scholar = true;
      if (hit) Object.assign(w, { status: "verified", candidate: hit, paperId: null });
    }),
  );
}

async function context(supabase: Supa, projectId: string) {
  const [{ data: project }, { data: subs }, saved] = await Promise.all([
    supabase.from("projects").select("name, research_question").eq("id", projectId).single(),
    supabase.from("subtopics").select("name").eq("project_id", projectId).order("position"),
    savedPapers(supabase, projectId),
  ]);
  return {
    saved,
    ctx: {
      title: (project?.name as string | undefined) ?? "",
      researchQuestion: project?.research_question as string | null | undefined,
      subtopics: (subs ?? []).map((s) => s.name as string),
      saved: [...saved]
        .sort((a, b) => (b.candidate.citations ?? 0) - (a.candidate.citations ?? 0))
        .slice(0, 40)
        .map((s) => `${s.candidate.authors[0] ?? "저자 미상"} (${s.candidate.year ?? "?"}) ${s.candidate.title}`),
    },
  };
}

export async function loadConsult(supabase: Supa, consultId: string): Promise<Consult & { project_id: string }> {
  return must(await supabase.from("consults").select("id, project_id, title, messages, updated_at").eq("id", consultId).single(), "상담") as Consult & { project_id: string };
}

/**
 * 상담 한 번: 연구자의 말에 AI가 답하고 이론·대표 문헌을 권한다.
 * 권한 문헌은 데이터베이스에서 찾은 것만 "확인됨"으로 표시해, 지어낸 문헌을 인용하지 않게 한다.
 * consultId가 없으면 새 상담을 만든다.
 */
export async function consultTurn(
  supabase: Supa,
  userId: string,
  projectId: string,
  consultId: string | null,
  text: string,
  opts: { scholar?: boolean } = {},
): Promise<Consult> {
  const message = text.trim().slice(0, 3000);
  if (message.length < 2) throw new HttpError(400, "상담할 내용을 써 주세요.");
  const prev = consultId ? await loadConsult(supabase, consultId) : null;
  if (prev && prev.project_id !== projectId) throw new HttpError(404, "상담을 찾지 못했습니다");
  const history = prev?.messages ?? [];
  if (history.length >= MAX_MESSAGES) throw new HttpError(400, "이 상담이 길어졌습니다. “새 상담”으로 이어 가 주세요 (지난 상담은 그대로 남습니다).");

  const { saved, ctx } = await context(supabase, projectId);
  const ai = await runAi(supabase, userId, "consult", {
    system: CONSULT_SYSTEM,
    user: consultUser(ctx, historyText(history), message),
    schema: ConsultSchema,
    maxTokens: 3500,
  });

  const theories: ConsultTheory[] = await Promise.all(
    ai.theories
      .filter((t) => t.name.trim())
      .slice(0, MAX_THEORIES)
      .map(async (t) => ({
        name: t.name.trim(),
        summary: t.summary.trim(),
        fit: t.fit.trim(),
        query_en: t.query_en.trim(),
        query_ko: t.query_ko.trim(),
        works: await Promise.all(t.works.filter((w) => w.author.trim() && w.title.trim()).slice(0, MAX_WORKS).map((w) => verifyWork(w, saved))),
      })),
  );
  if (opts.scholar && serpKey()) await verifyWithScholar(theories.flatMap((t) => t.works));
  // 다른 프로젝트에 보관한 것도 표시하려고 자리 정보를 붙인다
  const found = theories.flatMap((t) => t.works).filter((w) => w.candidate);
  if (found.length) {
    const ann = await annotate(supabase, found.map((w) => w.candidate!));
    found.forEach((w, i) => (w.candidate = ann[i]));
  }

  const now = new Date().toISOString();
  const messages: ConsultMsg[] = [
    ...history,
    { role: "user", text: message, at: now },
    { role: "assistant", text: ai.reply.trim(), at: now, theories, questions: ai.questions.map((q) => q.trim()).filter(Boolean).slice(0, 3) },
  ];
  if (prev) {
    const row = must(await supabase.from("consults").update({ messages, updated_at: now }).eq("id", prev.id).select("id, title, messages, updated_at").single(), "상담");
    return row as Consult;
  }
  const title = message.replace(/\s+/g, " ").slice(0, 40) + (message.length > 40 ? "…" : "");
  const row = must(await supabase.from("consults").insert({ project_id: projectId, title, messages }).select("id, title, messages, updated_at").single(), "상담");
  return row as Consult;
}

/** 상담 내용으로 이론적 배경 개요를 만들어 새 글로 저장한다. 확인된 문헌만 인용으로 단다 */
export async function outlineToDraft(supabase: Supa, userId: string, projectId: string, consultId: string) {
  const c = await loadConsult(supabase, consultId);
  if (c.project_id !== projectId) throw new HttpError(404, "상담을 찾지 못했습니다");
  const works = verifiedWorks(c.messages);
  if (!works.length) throw new HttpError(400, "확인된 문헌이 아직 없습니다. 상담을 조금 더 이어 가 보세요.");
  const list = works
    .map(({ theory, work: { candidate: x } }, i) => `[${i + 1}] ${x.authors.slice(0, 2).join(", ")}${x.authors.length > 2 ? " 외" : ""} (${x.year ?? "연도 미상"}). ${x.title} — 관련 이론: ${theory}`)
    .join("\n");
  const ai = await runAi(supabase, userId, "consult", {
    system: OUTLINE_SYSTEM,
    user: `상담 내용:\n${historyText(c.messages, 12000)}\n\n확인된 문헌 목록:\n${list}`,
    schema: OutlineSchema,
    maxTokens: 3000,
  });
  const { body, citations } = outlineBody(ai.sections, works.map((w) => w.work.candidate));
  const title = (ai.title.trim() || "이론적 배경 개요").slice(0, 120);
  const draft = must(
    await supabase.from("drafts").insert({ project_id: projectId, title, body, citations }).select("*").single(),
    "글",
  );
  return { draft };
}
