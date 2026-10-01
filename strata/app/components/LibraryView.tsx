"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import type { LibraryRow } from "@/lib/server/load";
import type { Field, ReadStatus } from "@/lib/types";
import { FieldTags, firstAuthor, STATUS_LABEL, Tier } from "./bits";

const TITLES: Record<string, [string, string]> = {
  all: ["전체 서재", "모든 프로젝트에 보관한 논문이 한곳에 모입니다. 한 논문이 여러 프로젝트에 들어갈 수 있습니다."],
  todo: ["읽을 것", "아직 읽지 않은 논문입니다. 영향력 높은 순으로 보여줍니다."],
  recent: ["최근 2주 보관", "나와 공유 멤버가 최근 2주 동안 보관한 논문입니다."],
  star: ["별표", "따로 표시해 둔 논문입니다."],
  field: ["", "이 분야로 분류된 논문입니다."],
};

export function LibraryView({ rows, fields, editable, view, fieldId }: { rows: LibraryRow[]; fields: Field[]; editable: { id: string; name: string }[]; view: string; fieldId: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    let l = rows;
    if (view === "todo") l = l.filter((r) => r.status === "todo").sort((a, b) => (b.paper.impact?.pct ?? 0) - (a.paper.impact?.pct ?? 0));
    if (view === "recent") l = l.filter((r) => new Date(r.addedAt).getTime() > Date.now() - 14 * 864e5);
    if (view === "star") l = l.filter((r) => r.starred);
    if (view === "field" && fieldId) l = l.filter((r) => r.fieldIds.includes(fieldId));
    const needle = q.trim().toLowerCase();
    if (needle) {
      l = l.filter((r) =>
        [r.paper.title, r.paper.authors.join(" "), r.paper.venue, r.summary?.one_line, r.summary?.findings, r.summary?.keywords?.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    return l;
  }, [rows, view, fieldId, q]);

  const [title, desc] = TITLES[view] ?? TITLES.all;
  const heading = view === "field" ? (fields.find((f) => f.id === fieldId)?.name ?? "분야") : title;

  const setUp = async (paperId: string, body: { status?: ReadStatus; starred?: boolean }) => {
    try {
      await api("/api/user-papers", { method: "PUT", body: { paperId, ...body } });
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const addTo = async (paperId: string, projectId: string) => {
    try {
      await api(`/api/projects/${projectId}/papers`, { body: { paperId } });
      toast("프로젝트에 추가했습니다");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  return (
    <>
      <div className="phead">
        <h1>{heading}</h1>
        <span className="meta">{list.length}편</span>
      </div>
      <p className="rq">{desc}</p>
      <input className="afind" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·저자·요약 내용으로 찾기" aria-label="서재 검색" style={{ marginTop: 14 }} />
      {list.length === 0 ? (
        <div className="empty-state">
          <h2>여기에 해당하는 논문이 없습니다</h2>
          <p>프로젝트에서 논문을 요약해 보관하면 서재에 모입니다.</p>
        </div>
      ) : (
        <div className="list">
          {list.map((r) => {
            const others = editable.filter((e) => !r.projects.some((p) => p.id === e.id));
            return (
              <div className="lib-row" key={r.paper.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">
                    {r.starred && <span style={{ color: "var(--warn)" }}>★ </span>}
                    <a className="title-link" href={r.paper.url ?? undefined} target="_blank" rel="noopener noreferrer">
                      <span>{r.paper.title}</span>
                    </a>
                  </div>
                  <div className="meta">
                    {firstAuthor(r.paper.authors)}, {r.paper.year ?? "연도 미상"}
                    {r.paper.venue && (
                      <>
                        {" "}
                        · <i>{r.paper.venue}</i>
                      </>
                    )}
                  </div>
                  {r.summary && <p className="ab">{r.summary.one_line}</p>}
                  <div className="badges">
                    <Tier impact={r.paper.impact} year={r.paper.year} />
                    <FieldTags ids={r.fieldIds} fields={fields} />
                    {r.projects.map((p) => (
                      <Link key={p.id} className="inproj" href={`/p/${p.id}`} style={{ textDecoration: "none" }}>
                        {p.name}
                        {p.subtopic ? ` · ${p.subtopic}` : ""}
                      </Link>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <select className="cardsel" value={r.status} onChange={(e) => setUp(r.paper.id, { status: e.target.value as ReadStatus })} aria-label="읽기 상태">
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <button className="btn sm" onClick={() => setUp(r.paper.id, { starred: !r.starred })}>
                    {r.starred ? "★ 해제" : "☆ 별표"}
                  </button>
                  {others.length > 0 && (
                    <select className="cardsel" value="" onChange={(e) => e.target.value && addTo(r.paper.id, e.target.value)} aria-label="프로젝트에 추가">
                      <option value="">프로젝트에 추가…</option>
                      {others.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
