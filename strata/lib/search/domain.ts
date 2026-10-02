/**
 * 논문이 연구실 분야(교육·심리·언어)에 속하는지 판별한다.
 * "digital assessment"처럼 의학(손가락 촉진 검사)·공학에서도 쓰는 말 때문에 엉뚱한 논문이 섞이는 것을 막는다.
 *
 * - "in": 교육·심리·언어 쪽 논문
 * - "out": 분명히 다른 분야 (의학·생명·공학·지구과학·경영 등)
 * - null: 판단할 정보가 없음 (국내 학술지 등) → 그대로 둔다
 */
export type Domain = "in" | "out" | null;

/** OpenAlex 분야(field) 중 연구실 분야 */
const IN_FIELDS = new Set(["social sciences", "psychology", "arts and humanities"]);
/** 사회과학 영역 안이지만 연구실 분야와 먼 것 */
const OUT_FIELDS = new Set(["business, management and accounting", "economics, econometrics and finance", "decision sciences"]);
/** 주제·세부 분야 이름에 이런 말이 있으면 다른 영역(의학 등)이어도 교육 연구로 본다 (예: 의학교육, 학습 분석) */
// "learning" 하나만으로는 기계 학습까지 걸려서 쓰지 않는다
const EDU_WORDS = /educat|teach|learner|students?\b|school|curricul|literacy|reading|linguist|e-learning|online learning|learning analytics|psychometric/i;

export interface OpenAlexTopic {
  display_name?: string | null;
  subfield?: { display_name?: string | null } | null;
  field?: { display_name?: string | null } | null;
  domain?: { display_name?: string | null } | null;
}

export function domainOfOpenAlex(t: OpenAlexTopic | null | undefined): Domain {
  if (!t) return null;
  const field = (t.field?.display_name ?? "").toLowerCase();
  const names = `${t.display_name ?? ""} ${t.subfield?.display_name ?? ""}`;
  if (EDU_WORDS.test(names)) return "in";
  if (!field) return null;
  if (OUT_FIELDS.has(field)) return "out";
  return IN_FIELDS.has(field) ? "in" : "out";
}

/** Semantic Scholar 분야 목록 (예: ["Education", "Computer Science"]) */
const S2_IN = new Set(["education", "psychology", "linguistics", "sociology"]);

export function domainOfS2(categories: (string | null | undefined)[] | null | undefined): Domain {
  const cats = (categories ?? []).filter((c): c is string => !!c).map((c) => c.toLowerCase());
  if (!cats.length) return null;
  return cats.some((c) => S2_IN.has(c)) ? "in" : "out";
}

/** 출처마다 판단이 다르면 "in"이 이긴다 (한 곳이라도 교육 쪽이라고 하면 보여 준다) */
export function mergeDomain(a: Domain | undefined, b: Domain | undefined): Domain {
  if (a === "in" || b === "in") return "in";
  if (a === "out" || b === "out") return "out";
  return null;
}
