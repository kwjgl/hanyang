"use client";
import { nonJournalLabel, tierLabel, tierOf } from "@/lib/impact";
import type { Candidate, Field, ReadStatus, SummaryData } from "@/lib/types";

export const STATUS_LABEL: Record<ReadStatus, string> = { todo: "읽을 것", doing: "읽는 중", done: "읽음" };

export function FieldTag({ field }: { field: Pick<Field, "name" | "color"> }) {
  return (
    <span className="fd" style={{ ["--c" as string]: `var(--fd-${field.color % 12})` }}>
      {field.name}
    </span>
  );
}

export function FieldTags({ ids, fields }: { ids: string[]; fields: Field[] }) {
  return (
    <>
      {ids
        .map((id) => fields.find((f) => f.id === id))
        .filter((f): f is Field => !!f)
        .map((f) => (
          <FieldTag key={f.id} field={f} />
        ))}
    </>
  );
}

export function Tier({ impact, year }: { impact: Candidate["impact"]; year: number | null }) {
  const t = tierOf(impact, year);
  const cls = t === "top1" ? "imp-1" : t === "top10" ? "imp-10" : t === "recent" ? "imp-new" : "imp-n";
  const title =
    t === "recent"
      ? "출판 2년 이내라 피인용으로 판단하기 이릅니다"
      : t === "none"
        ? "분야·연도 보정 지표가 없습니다"
        : "같은 분야·같은 해 논문 중 피인용 순위 (OpenAlex)";
  return (
    <span className={`imp ${cls}`} title={title}>
      {tierLabel(t, impact?.pct)}
    </span>
  );
}

export function ImpactBadges({ c }: { c: Pick<Candidate, "impact" | "year" | "citations" | "kind"> }) {
  const nj = nonJournalLabel(c.kind);
  return (
    <>
      <Tier impact={c.impact} year={c.year} />
      {c.citations != null && (
        <span className="b" title="전체 피인용 / 본문에서 실질적으로 활용된 인용">
          피인용 {c.citations.toLocaleString()}
          {c.impact?.influential != null ? ` · 핵심 인용 ${c.impact.influential}` : ""}
        </span>
      )}
      {c.kind === "review" && <span className="b">리뷰</span>}
      {nj && <span className="imp warn">{nj} · 동료심사 학술지 아님</span>}
    </>
  );
}

export function StatusPill({ s }: { s: ReadStatus }) {
  return <span className={`status st-${s}`}>{STATUS_LABEL[s]}</span>;
}

export function SummaryView({ s }: { s: SummaryData }) {
  return (
    <>
      <p className="one">{s.one_line}</p>
      <dl className="sum">
        <dt>대상</dt>
        <dd>{s.participants}</dd>
        <dt>설계</dt>
        <dd>{s.design}</dd>
        <dt>결과</dt>
        <dd>{s.findings}</dd>
        <dt>시사점</dt>
        <dd>{s.implications}</dd>
      </dl>
      {s.keywords?.length > 0 && (
        <div className="kws">
          {s.keywords.map((k) => (
            <span className="kw" key={k}>
              {k}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export const firstAuthor = (authors: string[]) => {
  const a = authors[0] ?? "";
  const last = /[가-힣]/.test(a) ? a.replace(/\s+/g, "") : (a.split(" ").pop() ?? a);
  return `${last}${authors.length > 1 ? " 외" : ""}`;
};

export function Avatar({ name, i = 0 }: { name: string; i?: number }) {
  const cls = ["", "c2", "c3", "c4"][i % 4];
  return (
    <span className={`av ${cls}`} title={name}>
      {(name || "?").slice(0, 1)}
    </span>
  );
}
