"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import type { ProjectData } from "@/lib/server/load";
import type { Field } from "@/lib/types";
import { FieldTags, firstAuthor, SummaryView, Tier } from "../bits";
import type { SearchState, TrayItem } from "./useSearch";

export function Tray({ s, data }: { s: SearchState; data: ProjectData }) {
  const ready = s.tray.filter((t) => (t.state === "done" || t.state === "noAbstract") && !t.saved);
  const saveAll = async () => {
    for (const t of ready) await s.save(t, data.project.name);
    toast("모두 보관했습니다");
  };
  return (
    <aside className="tray" aria-label="요약 트레이">
      <div className="tray-h">
        <h2>요약 트레이</h2>
        {ready.length > 1 && data.role !== "viewer" && (
          <button className="btn" onClick={saveAll}>
            모두 보관
          </button>
        )}
      </div>
      <div className="tray-b">
        {s.tray.length === 0 && (
          <div className="empty">
            논문을 고르고 <b>초록 요약하기</b>를 누르면 여기에 요약이 쌓입니다.
          </div>
        )}
        {s.tray.map((t) => (
          <Card key={t.key} t={t} s={s} data={data} />
        ))}
      </div>
    </aside>
  );
}

function Card({ t, s, data }: { t: TrayItem; s: SearchState; data: ProjectData }) {
  const router = useRouter();
  const c = t.candidate;
  const [newSub, setNewSub] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>(data.fields);
  const canEdit = data.role !== "viewer";

  const addSubtopic = async () => {
    if (!newSub?.trim()) return setNewSub(null);
    try {
      const r = await api<{ subtopic: { id: string } }>(`/api/projects/${data.project.id}/subtopics`, { body: { name: newSub } });
      s.setItem(t.key, { subtopicId: r.subtopic.id });
      setNewSub(null);
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const addSuggested = async (name: string) => {
    try {
      const r = await api<{ field: Field }>("/api/fields", { body: { name } });
      const ids = [...(t.fieldIds ?? []), r.field.id];
      await api(`/api/papers/${t.paperId}/fields`, { method: "PUT", body: { fieldIds: ids } });
      setFields([...fields, r.field]);
      s.setItem(t.key, { fieldIds: ids, summary: t.summary ? { ...t.summary, suggested_field: "" } : t.summary });
      toast(`‘${name}’ 분야를 추가했습니다`);
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const subName = data.subtopics.find((x) => x.id === t.subtopicId)?.name;

  return (
    <div className="card">
      <h3>{c.title}</h3>
      <div className="meta">
        {firstAuthor(c.authors)}, {c.year ?? "연도 미상"}
      </div>
      {(t.state === "pending" || t.state === "running") && (
        <>
          <div className="skel" style={{ width: "90%" }} />
          <div className="skel" />
          <div className="skel" style={{ width: "70%" }} />
        </>
      )}
      {t.state === "error" && (
        <p className="warnbox" style={{ marginTop: 8 }}>
          {t.error}{" "}
          <button className="linkbtn" onClick={() => s.retry(t.key)}>
            다시 시도
          </button>
        </p>
      )}
      {t.state === "noAbstract" && (
        <p className="warnbox" style={{ marginTop: 8 }}>
          여러 출처에서 찾아봤지만 초록이 없어 요약하지 못했습니다. 서지 정보만 보관할 수 있습니다.
        </p>
      )}
      {t.state === "done" && t.summary && (
        <>
          <div className="badges">
            <Tier impact={c.impact} year={c.year} />
            <FieldTags ids={t.fieldIds ?? []} fields={fields} />
          </div>
          <SummaryView s={t.summary} />
          {t.summary.suggested_field && canEdit && (
            <p className="hint">
              맞는 분야가 없어 새 분야를 제안했습니다:{" "}
              <button className="linkbtn" onClick={() => addSuggested(t.summary!.suggested_field)}>
                ‘{t.summary.suggested_field}’ 분야 추가
              </button>
            </p>
          )}
          <p className="src-note">{t.reused ? "다른 멤버·프로젝트에서 만든 요약을 재사용했습니다 · " : ""}초록만 근거로 요약 · 원문 초록도 함께 보관</p>
        </>
      )}
      {(t.state === "done" || t.state === "noAbstract") && (
        <div className="card-f">
          {t.saved ? (
            <span className="done">✓ {subName ? `“${subName}”에 ` : ""}보관됨</span>
          ) : !canEdit ? (
            <span className="meta">보기 권한이라 보관할 수 없습니다</span>
          ) : newSub !== null ? (
            <>
              <input className="field-in" autoFocus value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="새 소주제 이름" style={{ flex: 1, padding: "4px 8px" }} />
              <button className="btn sm" onClick={addSubtopic}>
                만들기
              </button>
            </>
          ) : (
            <>
              <label className="meta" htmlFor={`sub-${t.key}`}>
                소주제
              </label>
              <select
                className="cardsel"
                id={`sub-${t.key}`}
                value={t.subtopicId ?? ""}
                onChange={(e) => (e.target.value === "__new" ? setNewSub("") : s.setItem(t.key, { subtopicId: e.target.value || null }))}
              >
                <option value="">소주제 없음</option>
                {data.subtopics.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
                <option value="__new">+ 새 소주제…</option>
              </select>
              <button className="btn primary" onClick={() => s.save(t, data.project.name)}>
                보관
              </button>
              <button className="btn ghost" onClick={() => s.removeItem(t.key)}>
                건너뛰기
              </button>
            </>
          )}
        </div>
      )}
      {(t.state === "error" || t.saved) && (
        <button className="linkbtn" style={{ marginTop: 6 }} onClick={() => s.removeItem(t.key)}>
          트레이에서 치우기
        </button>
      )}
    </div>
  );
}
