"use client";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { api, copyText, errMsg, toast } from "@/lib/client";
import { apa, type ExportPaper, tsv } from "@/lib/export";
import { tierLabel, tierOf } from "@/lib/impact";
import type { ProjectData, TableRow } from "@/lib/server/load";
import type { Candidate, ReadStatus } from "@/lib/types";
import { FieldTags, firstAuthor, STATUS_LABEL, StatusPill, SummaryView, Tier } from "../bits";
import { ExportMenu } from "../ExportMenu";
import { CoreList } from "./CoreList";
import { AnalyzeButton, DetailCells, DetailFull, detailTsv, PdfUploader } from "./PdfTools";
import type { Citations } from "./useCitations";

type Group = "sub" | "field" | "year";
type View = "basic" | "detail";
type RelatedKind = "citedBy" | "references" | "similar";

export function CompareTab({
  data,
  onRelated,
  cites,
  onShowCore,
}: {
  data: ProjectData;
  onRelated: (k: RelatedKind, c: Pick<Candidate, "title" | "doi" | "ids">) => void;
  cites: Citations;
  onShowCore: () => void;
}) {
  const { rows, subtopics, fields, project } = data;
  const [group, setGroup] = useState<Group>("sub");
  const [fieldFilter, setFieldFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [out, setOut] = useState<string | null>(null);
  const [view, setView] = useState<View>("basic");
  const [adding, setAdding] = useState(false);
  const canEdit = data.role !== "viewer";
  const analyzed = rows.filter((r) => r.pdf?.details).length;

  const usedFields = fields.filter((f) => rows.some((r) => r.fieldIds.includes(f.id)));
  const visible = fieldFilter ? rows.filter((r) => r.fieldIds.includes(fieldFilter)) : rows;

  const groups = useMemo(() => {
    const m = new Map<string, TableRow[]>();
    const keyOf = (r: TableRow) => {
      if (group === "sub") return subtopics.find((s) => s.id === r.subtopicId)?.name ?? "소주제 없음";
      if (group === "field") return fields.find((f) => f.id === r.fieldIds[0])?.name ?? "분야 없음";
      return r.paper.year ? `${Math.floor(r.paper.year / 10) * 10}년대` : "연도 미상";
    };
    for (const r of [...visible].sort((a, b) => (a.paper.year ?? 0) - (b.paper.year ?? 0))) {
      const k = keyOf(r);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    const order = group === "sub" ? [...subtopics.map((s) => s.name), "소주제 없음"] : [...m.keys()].sort();
    return order.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  }, [visible, group, subtopics, fields]);

  const exportTsv = () => {
    if (view === "detail") {
      const text = detailTsv(groups.flatMap(([, rs]) => rs));
      setOut(text);
      copyText(text);
      return;
    }
    const text = tsv(
      groups.flatMap(([k, rs]) =>
        rs.map((r) => ({
          subtopic: k,
          cite: r.paper,
          impact: tierLabel(tierOf(r.paper.impact, r.paper.year), r.paper.impact?.pct),
          summary: r.summary,
        })),
      ),
    );
    setOut(text);
    copyText(text);
  };
  // 파일 내보내기용: 지금 묶음·필터 그대로
  const exportGroups = useMemo(
    () =>
      groups.map(([name, rs]) => ({
        name,
        papers: rs.map(
          (r): ExportPaper => ({
            ...r.paper,
            impact: tierLabel(tierOf(r.paper.impact, r.paper.year), r.paper.impact?.pct),
            summary: r.summary,
            subtopic: subtopics.find((s) => s.id === r.subtopicId)?.name ?? null,
            fields: r.fieldIds.map((id) => fields.find((f) => f.id === id)?.name ?? "").filter(Boolean),
            notes: r.notes.map((n) => (n.visibility === "private" ? `(나만) ${n.body}` : n.body)),
            status: STATUS_LABEL[r.status],
            starred: r.starred,
          }),
        ),
      })),
    [groups, subtopics, fields],
  );

  const exportApa = () => {
    const text = visible
      .map((r) => apa(r.paper))
      .sort((a, b) => a.localeCompare(b))
      .join("\n");
    setOut(text);
    copyText(text);
  };

  if (!rows.length)
    return (
      <>
        <div className="empty-state">
          <h2>아직 보관한 논문이 없습니다</h2>
          <p>검색 결과에서 논문을 골라 요약하고, 소주제에 보관하면 여기에 비교표로 정리됩니다. 국내 논문은 PDF를 넣어 바로 보관할 수도 있습니다.</p>
        </div>
        {canEdit && <PdfUploader data={data} />}
      </>
    );

  const cols = view === "detail" ? 7 : 8;

  return (
    <>
      <div className="toolbar">
        <span className="seg" role="group" aria-label="비교표 보기">
          <button type="button" aria-pressed={view === "basic"} onClick={() => setView("basic")}>
            요약
          </button>
          <button type="button" aria-pressed={view === "detail"} onClick={() => setView("detail")}>
            상세 분석{analyzed ? ` ${analyzed}` : ""}
          </button>
        </span>
        <span className="lbl">묶기</span>
        <span className="seg">
          {(
            [
              ["sub", "소주제"],
              ["field", "분야"],
              ["year", "연도"],
            ] as [Group, string][]
          ).map(([k, v]) => (
            <button key={k} type="button" aria-pressed={group === k} onClick={() => setGroup(k)}>
              {v}
            </button>
          ))}
        </span>
        {usedFields.length > 0 && (
          <>
            <span className="lbl">분야</span>
            <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
              {usedFields.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="fchip"
                  style={{ ["--c" as string]: `var(--fd-${f.color % 12})` }}
                  aria-pressed={fieldFilter === f.id}
                  onClick={() => setFieldFilter(fieldFilter === f.id ? null : f.id)}
                >
                  {f.name}
                </button>
              ))}
            </span>
          </>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {canEdit && (
            <button className={`btn ${adding ? "primary" : ""}`} onClick={() => setAdding(!adding)} aria-expanded={adding}>
              PDF 넣기
            </button>
          )}
          <button className="btn" onClick={exportTsv}>
            표 복사 (한글·엑셀 붙여넣기)
          </button>
          <button className="btn" onClick={exportApa}>
            참고문헌 복사 (APA)
          </button>
          <ExportMenu
            name={project.name}
            question={project.research_question}
            papers={exportGroups.flatMap((g) => g.papers)}
            groups={exportGroups}
          />
        </span>
      </div>
      {adding && <PdfUploader data={data} />}
      {view === "detail" && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          PDF 본문에서 뽑은 선행연구 분석표입니다. 칸마다 근거 쪽이 붙어 있습니다. PDF가 없는 논문은 행을 눌러 PDF를 넣거나, 위의 “PDF 넣기”로 여러 편을 한 번에 넣으세요.
        </p>
      )}
      {out && (
        <pre className="cite" onClick={() => setOut(null)} title="누르면 닫힙니다">
          {out}
        </pre>
      )}
      <div className="tblwrap">
        <table className="cmp">
          <thead>
            {view === "detail" ? (
              <tr>
                <th style={{ width: "19%" }}>논문</th>
                <th style={{ width: "11%" }}>대상</th>
                <th style={{ width: "15%" }}>설계·분석</th>
                <th style={{ width: "12%" }}>도구 (신뢰도)</th>
                <th style={{ width: "11%" }}>변인</th>
                <th style={{ width: "18%" }}>주요 결과</th>
                <th style={{ width: "14%" }}>한계·제언</th>
              </tr>
            ) : (
              <tr>
                <th style={{ width: "21%" }}>논문</th>
                <th style={{ width: 118 }}>분야</th>
                <th style={{ width: 96 }}>영향력</th>
                <th style={{ width: "12%" }}>대상</th>
                <th style={{ width: "15%" }}>설계</th>
                <th style={{ width: "19%" }}>주요 결과</th>
                <th style={{ width: "16%" }}>시사점</th>
                <th style={{ width: 76 }}>상태</th>
              </tr>
            )}
          </thead>
          <tbody>
            {groups.map(([k, rs]) => (
              <Fragment key={k}>
                <tr className="grp">
                  <td colSpan={cols}>
                    {k} · {rs.length}편
                  </td>
                </tr>
                {rs.map((r) => {
                  const isOpen = open.has(r.paper.id);
                  const toggle = () => {
                    const n = new Set(open);
                    if (isOpen) n.delete(r.paper.id);
                    else n.add(r.paper.id);
                    setOpen(n);
                  };
                  return (
                    <Fragment key={r.paper.id}>
                      <tr className={`item ${isOpen ? "open" : ""}`} onClick={toggle} aria-expanded={isOpen}>
                        <td>
                          <div className="ttl">{r.paper.title}</div>
                          <div className="who">
                            {r.starred ? "★ " : ""}
                            {firstAuthor(r.paper.authors)}, {r.paper.year ?? "연도 미상"}
                            {data.members.length > 1 && r.addedBy ? ` · ${r.addedBy} 보관` : ""}
                          </div>
                          {r.pdf && <span className={`pdfbadge ${r.pdf.details ? "done" : ""}`}>{r.pdf.details ? "PDF 분석됨" : "PDF"}</span>}
                        </td>
                        {view === "detail" ? (
                          r.pdf?.details ? (
                            <DetailCells d={r.pdf.details} />
                          ) : (
                            <td colSpan={6} className="meta">
                              {r.pdf ? (
                                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                  PDF는 넣었고 아직 분석하지 않았습니다. {canEdit && <AnalyzeButton paperId={r.paper.id} />}
                                </span>
                              ) : (
                                `PDF 없음${r.summary ? ` · 초록 요약: ${r.summary.design || r.summary.one_line}` : ""}${canEdit ? " — 행을 눌러 PDF를 넣으세요" : ""}`
                              )}
                            </td>
                          )
                        ) : (
                          <>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <FieldTags ids={r.fieldIds} fields={fields} />
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                                <Tier impact={r.paper.impact} year={r.paper.year} />
                                {r.paper.citations != null && <span className="who">피인용 {r.paper.citations.toLocaleString()}</span>}
                                {r.summary?.study_type && <span className="who">{r.summary.study_type}</span>}
                              </div>
                            </td>
                            {r.summary ? (
                              <>
                                <td>
                                  <div className="clamp">{r.summary.participants}</div>
                                </td>
                                <td>
                                  <div className="clamp">{r.summary.design}</div>
                                </td>
                                <td>
                                  <div className="clamp">{r.summary.findings}</div>
                                </td>
                                <td>
                                  <div className="clamp">{r.summary.implications}</div>
                                </td>
                              </>
                            ) : (
                              <td colSpan={4} className="meta">
                                요약 없음 (초록이 없어 서지 정보만 보관)
                              </td>
                            )}
                            <td>
                              <StatusPill s={r.status} />
                            </td>
                          </>
                        )}
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={cols}>
                            <RowDetail r={r} data={data} onRelated={onRelated} projectId={project.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">행을 누르면 요약 전문, 상세 분석, 원문 초록, 메모, 인용 추적이 열립니다.</p>
      <CoreList data={data} cites={cites} onShowCore={onShowCore} />
    </>
  );
}

function RowDetail({ r, data, projectId, onRelated }: { r: TableRow; data: ProjectData; projectId: string; onRelated: (k: RelatedKind, c: Pick<Candidate, "title" | "doi" | "ids">) => void }) {
  const router = useRouter();
  const canEdit = data.role !== "viewer";
  const [note, setNote] = useState("");
  const [vis, setVis] = useState<"shared" | "private">("shared");
  const [editFields, setEditFields] = useState(false);
  const [fieldIds, setFieldIds] = useState(r.fieldIds);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const p = r.paper;
  const nameOf = (uid: string) => data.members.find((m) => m.user_id === uid)?.name ?? "멤버";

  const call = async (path: string, init: { method?: string; body?: unknown }, done?: string) => {
    try {
      await api(path, init);
      if (done) toast(done);
      router.refresh();
      return true;
    } catch (e) {
      toast(errMsg(e));
      return false;
    }
  };

  return (
    <div className="detail-grid" onClick={(e) => e.stopPropagation()}>
      <div style={{ minWidth: 0 }}>
        <div className="meta" style={{ marginBottom: 6 }}>
          {p.authors.join(", ")} · <i>{p.venue ?? "학술지 미상"}</i> · {p.year ?? "연도 미상"}
        </div>
        <PdfSection r={r} data={data} />
        {r.pdf?.details ? (
          <details style={{ marginTop: 10 }}>
            <summary>초록 요약</summary>
            {r.summary ? <SummaryView s={r.summary} /> : <p className="meta">요약이 없습니다.</p>}
          </details>
        ) : r.summary ? (
          <SummaryView s={r.summary} />
        ) : (
          <p className="meta">요약이 없습니다.</p>
        )}
        {p.abstract && (
          <details style={{ marginTop: 10 }}>
            <summary>원문 초록</summary>
            <p>{p.abstract}</p>
          </details>
        )}
        <div className="acts" style={{ marginTop: 10 }}>
          {p.url && (
            <a className="btn sm" href={p.url} target="_blank" rel="noopener noreferrer">
              원문 페이지 ↗
            </a>
          )}
          {p.oa_url && (
            <a className="btn sm" href={p.oa_url} target="_blank" rel="noopener noreferrer">
              무료 원문 ↗
            </a>
          )}
          <button className="btn sm" onClick={() => onRelated("citedBy", p)}>
            인용한 논문
          </button>
          <button className="btn sm" onClick={() => onRelated("references", p)}>
            참고문헌
          </button>
          {p.doi && (
            <button className="btn sm" onClick={() => onRelated("similar", p)}>
              비슷한 논문
            </button>
          )}
          <button className="btn sm" onClick={() => copyText(apa(p))}>
            APA 복사
          </button>
        </div>
        {r.elsewhere.length > 0 && <p className="hint">다른 프로젝트에도 있음: {r.elsewhere.join(", ")}</p>}
      </div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="line" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="meta" htmlFor={`st-${p.id}`}>
            내 읽기 상태
          </label>
          <select
            id={`st-${p.id}`}
            className="cardsel"
            value={r.status}
            onChange={(e) => call("/api/user-papers", { method: "PUT", body: { paperId: p.id, status: e.target.value as ReadStatus } })}
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="btn sm" onClick={() => call("/api/user-papers", { method: "PUT", body: { paperId: p.id, starred: !r.starred } })}>
            {r.starred ? "★ 별표 해제" : "☆ 별표"}
          </button>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label className="meta" htmlFor={`sub-${p.id}`}>
              소주제
            </label>
            <select
              id={`sub-${p.id}`}
              className="cardsel"
              value={r.subtopicId ?? ""}
              onChange={(e) => call(`/api/projects/${projectId}/papers`, { method: "PATCH", body: { paperId: p.id, subtopicId: e.target.value || null } })}
            >
              <option value="">소주제 없음</option>
              {data.subtopics.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={() => setEditFields(!editFields)}>
              분야 바꾸기
            </button>
          </div>
        )}
        {editFields && (
          <div>
            <div className="badges">
              {data.fields
                .filter((f) => !f.hidden)
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="fchip"
                    style={{ ["--c" as string]: `var(--fd-${f.color % 12})` }}
                    aria-pressed={fieldIds.includes(f.id)}
                    onClick={() => setFieldIds(fieldIds.includes(f.id) ? fieldIds.filter((x) => x !== f.id) : [...fieldIds, f.id])}
                  >
                    {f.name}
                  </button>
                ))}
            </div>
            <p className="hint">직접 고른 분야는 “다시 분류”해도 바뀌지 않습니다.</p>
            <button
              className="btn sm primary"
              onClick={() => call(`/api/papers/${p.id}/fields`, { method: "PUT", body: { fieldIds } }, "분야를 바꿨습니다").then((ok) => ok && setEditFields(false))}
            >
              저장
            </button>
          </div>
        )}
        <div>
          <span className="lbl">메모</span>
          <ul className="notes">
            {r.notes.map((n) => (
              <li key={n.id}>
                <span className="meta">{nameOf(n.user_id)}</span>
                <span>
                  {n.body} {n.visibility === "private" && <span className="b">나만 보기</span>}
                </span>
                {n.user_id === data.meId ? (
                  <button className="linkbtn" onClick={() => call(`/api/notes/${n.id}`, { method: "DELETE" })}>
                    지우기
                  </button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) call("/api/notes", { body: { projectId, paperId: p.id, text: note, visibility: vis } }).then((ok) => ok && setNote(""));
            }}
            style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
          >
            <textarea className="field-in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="읽으면서 떠오른 생각, 내 연구와의 연결점" />
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select className="cardsel" value={vis} onChange={(e) => setVis(e.target.value as "shared" | "private")} aria-label="메모 공개 범위">
                <option value="shared">공동 메모</option>
                <option value="private">나만 보기</option>
              </select>
              <button className="btn sm primary">메모 남기기</button>
            </span>
          </form>
        </div>
        {canEdit &&
          (confirmRemove ? (
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span className="meta">이 프로젝트에서 뺍니다. 다시 보관하면 메모도 다시 보입니다.</span>
              <button className="btn sm danger" onClick={() => call(`/api/projects/${projectId}/papers?paperId=${p.id}`, { method: "DELETE" }, "프로젝트에서 뺐습니다")}>
                빼기
              </button>
              <button className="btn sm ghost" onClick={() => setConfirmRemove(false)}>
                취소
              </button>
            </span>
          ) : (
            <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmRemove(true)}>
              이 프로젝트에서 빼기
            </button>
          ))}
      </div>
    </div>
  );
}

/** 행을 펼쳤을 때: PDF 상태와 상세 분석 */
function PdfSection({ r, data }: { r: TableRow; data: ProjectData }) {
  const router = useRouter();
  const canEdit = data.role !== "viewer";
  const [replace, setReplace] = useState(false);
  const remove = async () => {
    if (!confirm("넣은 PDF 본문과 분석 결과를 지울까요?")) return;
    try {
      await api(`/api/papers/${r.paper.id}/fulltext`, { method: "DELETE" });
      toast("PDF를 지웠습니다");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  if (!r.pdf) return canEdit ? <div style={{ marginBottom: 10 }}><PdfUploader data={data} paperId={r.paper.id} compact /></div> : null;
  return (
    <div style={{ marginBottom: 10 }}>
      <DetailFull r={r} />
      <div className="acts" style={{ marginTop: 6, alignItems: "center" }}>
        <span className="meta">
          PDF: {r.pdf.fileName ?? "이름 없음"} · {Math.round(r.pdf.chars / 1000)}천 자{r.pdf.analyzedAt ? ` · ${r.pdf.analyzedAt.slice(0, 10)} 분석` : ""}
        </span>
        {canEdit && <AnalyzeButton paperId={r.paper.id} again={!!r.pdf.details} />}
        {canEdit && (
          <button className="btn sm" onClick={() => setReplace(!replace)}>
            PDF 바꾸기
          </button>
        )}
        {canEdit && (
          <button className="btn sm ghost" onClick={remove}>
            PDF 지우기
          </button>
        )}
      </div>
      {replace && <PdfUploader data={data} paperId={r.paper.id} compact onDone={() => setReplace(false)} />}
    </div>
  );
}
