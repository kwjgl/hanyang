import type { Candidate, Field } from "@/lib/types";

const fieldList = (fields: Pick<Field, "name" | "description">[]) =>
  fields.map((f) => `- ${f.name}: ${f.description || "(설명 없음)"}`).join("\n");

export const EXPAND_SYSTEM = `당신은 교육학·교육공학·학습과학·인지심리·국어교육·교육평가 분야 문헌 검색을 돕는 사서다.
사용자의 검색 주제를 학술 데이터베이스(OpenAlex, ERIC, Semantic Scholar, 국내 학술지)에서 실제로 쓰이는 검색어로 넓힌다.

규칙:
- terms_en: 영어 학술 용어 3~5개. 해당 분야 논문 제목·키워드에 실제로 쓰이는 표현을 쓴다(예: "technology-enhanced items", "computer-based testing").
- terms_ko: 국내 학술지에서 쓰는 한국어 용어 1~3개. 같은 개념의 다른 표현(예: 컴퓨터 기반 평가, 디지털 기반 평가)을 고른다.
- 각 검색어는 2~6단어로 짧게. 연산자(AND, OR, 따옴표)는 쓰지 않는다.
- 원래 검색어를 그대로 반복하지 않는다.`;

export function expandUser(query: string, ctx: { researchQuestion?: string; fields?: string[] }) {
  const lines = [`검색 주제: ${query}`];
  if (ctx.researchQuestion) lines.push(`프로젝트 연구 질문: ${ctx.researchQuestion}`);
  if (ctx.fields?.length) lines.push(`프로젝트 분야: ${ctx.fields.join(", ")}`);
  return lines.join("\n");
}

export const SUMMARY_SYSTEM = `당신은 교육 연구자를 돕는 연구 보조원이다. 논문의 서지 정보와 초록만 근거로 한국어 구조화 요약을 만든다.

규칙:
- 초록에 없는 내용은 추측하지 않는다. 해당 칸에는 "초록에 언급 없음"이라고 쓴다.
- one_line: 핵심 발견을 한 문장(60자 안팎)으로.
- participants: 연구 대상(국가, 학교급·학년, 인원). 이론·리뷰 논문이면 "해당 없음 (리뷰)"처럼 쓴다.
- design: 연구 설계와 방법(실험·조사·질적·메타분석 등, 측정 도구).
- findings: 주요 결과 2~3문장. 수치는 초록에 있는 그대로 옮긴다.
- implications: 수업·평가 설계에 주는 시사점. 초록에 근거가 약하면 그렇다고 밝힌다.
- keywords: 한국어 키워드 3~5개. 필요하면 괄호 안에 영어를 병기한다.
- study_type: 연구 설계를 목록에서 하나 고른다.
- levels: 연구 대상의 학교급을 모두 고른다. 대상이 없으면 "해당 없음".
- fields: 아래 분야 목록에서 해당하는 분야 이름을 1~3개, 목록에 있는 이름 그대로 고른다.
- suggested_field: 목록의 어떤 분야에도 잘 맞지 않으면 새 분야 이름 하나를 제안하고, 아니면 빈 문자열.
- 전문용어는 국내 학계에서 통용되는 번역어를 쓴다.`;

function paperBlock(c: Pick<Candidate, "title" | "authors" | "year" | "venue" | "abstract">) {
  return [
    `제목: ${c.title}`,
    `저자: ${c.authors.slice(0, 6).join(", ")}${c.authors.length > 6 ? " 외" : ""}`,
    `연도: ${c.year ?? "미상"}`,
    `학술지: ${c.venue ?? "미상"}`,
    `초록:\n${c.abstract ?? "(초록 없음)"}`,
  ].join("\n");
}

export function summaryUser(c: Candidate, fields: Pick<Field, "name" | "description">[]) {
  return `분야 목록:\n${fieldList(fields)}\n\n논문:\n${paperBlock(c)}`;
}

export const CLASSIFY_SYSTEM = `논문을 아래 분야 목록에 따라 분류한다.
- fields: 해당하는 분야 이름을 1~3개, 목록에 있는 이름 그대로 고른다.
- suggested_field: 목록의 어떤 분야에도 잘 맞지 않으면 새 분야 이름 하나, 아니면 빈 문자열.`;

export function classifyUser(c: Pick<Candidate, "title" | "authors" | "year" | "venue" | "abstract">, oneLine: string | null, fields: Pick<Field, "name" | "description">[]) {
  return `분야 목록:\n${fieldList(fields)}\n\n논문:\n${paperBlock(c)}${oneLine ? `\n한 줄 요약: ${oneLine}` : ""}`;
}

export const GAP_SYSTEM = `교육 연구 문헌으로 "연구 공백 지도"(소주제 × 대상·방법 등의 표)를 만들려고 한다. 논문마다 제목과 초록을 읽고 아래를 정한다.
- subtopic: 소주제 목록 중 이 논문이 가장 잘 맞는 하나를 이름 그대로 고른다. 어느 것에도 맞지 않으면 "해당 없음".
- levels: 연구 대상 학교급. 목록에서 해당하는 것을 모두 고르고, 알 수 없거나 대상이 없는 연구(이론·문헌 연구 등)면 ["해당 없음"].
- method: 연구 방법 하나.
- custom: 직접 정의한 축이 있으면 그 범주 중 하나를 이름 그대로, 맞는 것이 없으면 빈 문자열. 축이 없으면 빈 문자열.
초록이 없으면 제목만으로 판단한다. 받은 논문 모두에 대해 id를 그대로 돌려준다. 추측이 지나치면 "해당 없음"을 쓴다.`;

export function gapUser(subtopics: string[], custom: { name: string; categories: string[] } | null | undefined, papers: { id: string; title: string; year: number | null; abstract: string | null }[]) {
  const axis = custom ? `직접 정의한 축 "${custom.name}": ${custom.categories.join(" / ")}` : "직접 정의한 축: 없음";
  const list = papers
    .map((p) => `[${p.id}] ${p.title}${p.year ? ` (${p.year})` : ""}\n초록: ${p.abstract ? p.abstract.slice(0, 700) : "(없음)"}`)
    .join("\n\n");
  return `소주제 목록: ${subtopics.join(" / ")}\n${axis}\n\n논문:\n${list}`;
}

export const CITE_CLAIMS_SYSTEM = `연구자가 쓰고 있는 학술 글(교육학 분야)을 읽고, 선행연구 인용이 필요한 문장을 찾는다.
- 사실 주장, 선행연구 결과, 이론·개념 정의, 통계, 일반화된 주장처럼 근거가 있어야 하는 문장만 고른다. 연구자 자신의 계획·의견·연구 문제 진술은 고르지 않는다.
- sentence는 글에 있는 문장을 한 글자도 바꾸지 않고 그대로 옮긴다.
- 문장은 최대 5개까지, 글에 나오는 순서대로.
- query_en은 그 주장을 다룬 논문 제목·키워드에 실제로 쓰일 영어 학술 용어로 쓴다. 이론이면 이론 이름을 넣는다(예: "construction-integration model").
- classic은 이론·정의·핵심 개념처럼 대표 문헌(오래 많이 인용된 고전)을 인용해야 어울리면 true.`;

export function citeClaimsUser(text: string, ctx: { researchQuestion?: string | null }) {
  return `${ctx.researchQuestion ? `연구 질문: ${ctx.researchQuestion}\n\n` : ""}글:\n${text}`;
}

export const CITE_PICK_SYSTEM = `연구자의 글에서 인용이 필요한 주장과, 실제 논문 데이터베이스에서 찾은 후보 논문 목록을 받는다.
주장마다 그 주장을 뒷받침하는 데 가장 어울리는 후보를 최대 3편 고른다.
- 반드시 후보 목록에 있는 논문만 고른다. 목록에 없는 논문을 지어내지 않는다.
- 초록 내용으로 판단한다. 제목만 비슷하고 내용이 다르면 고르지 않는다. 어울리는 후보가 없으면 그 주장은 비워 둔다.
- 대표 문헌이 필요한 주장(classic)에는 그 이론·개념을 처음 제시했거나 가장 많이 인용되는 문헌을 우선한다. "보관함" 표시가 있는 논문은 연구자가 이미 모아 둔 것이니 비슷하게 어울리면 우선한다.
- reason은 그 논문이 무엇을 보였는지와 주장과의 관계를 한국어 한 문장으로 쓴다.
- fit은 '직접'(주장을 직접 뒷받침) 또는 '관련'(배경·관련 근거).`;
