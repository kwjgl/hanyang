"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import type { ProjectData } from "@/lib/server/load";

/** 프로젝트 이름·연구 질문·분야·소주제 편집 */
export function ProjectEditor({ data, onDone }: { data: ProjectData; onDone: () => void }) {
  const router = useRouter();
  const p = data.project;
  const [name, setName] = useState(p.name);
  const [rq, setRq] = useState(p.research_question);
  const [dq, setDq] = useState(p.default_query);
  const [fieldIds, setFieldIds] = useState<string[]>(p.field_ids);
  const [newSub, setNewSub] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    try {
      await api(`/api/projects/${p.id}`, { method: "PATCH", body: { name, researchQuestion: rq, defaultQuery: dq, fieldIds } });
      toast("저장했습니다");
      router.refresh();
      onDone();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const sub = async (method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, q = "") => {
    try {
      await api(`/api/projects/${p.id}/subtopics${q}`, { method, body });
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const del = async () => {
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  return (
    <section className="share">
      <h3>프로젝트 편집</h3>
      <div className="form" style={{ maxWidth: "none" }}>
        <label>
          이름
          <input className="field-in" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          연구 질문 <span className="hint">검색어를 넓힐 때 참고합니다</span>
          <textarea className="field-in" value={rq} onChange={(e) => setRq(e.target.value)} />
        </label>
        <label>
          기본 검색어
          <input className="field-in" value={dq} onChange={(e) => setDq(e.target.value)} />
        </label>
        <div>
          <span className="lbl">분야</span>
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
        </div>
        <div>
          <button className="btn primary" onClick={save}>
            저장
          </button>
        </div>
        <div>
          <span className="lbl">소주제</span>
          <div className="mini-list">
            {data.subtopics.map((s, i) => (
              <div key={s.id} className="line">
                <input
                  className="field-in"
                  defaultValue={s.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && sub("PATCH", { subtopicId: s.id, name: e.target.value })}
                  aria-label="소주제 이름"
                  style={{ flex: 1 }}
                />
                <button className="btn sm" disabled={i === 0} onClick={() => sub("PATCH", { subtopicId: s.id, position: i - 1 }).then(() => sub("PATCH", { subtopicId: data.subtopics[i - 1].id, position: i }))}>
                  ↑
                </button>
                <button className="btn sm" onClick={() => sub("DELETE", undefined, `?subtopicId=${s.id}`)}>
                  삭제
                </button>
              </div>
            ))}
            <form
              className="line"
              onSubmit={(e) => {
                e.preventDefault();
                if (newSub.trim()) sub("POST", { name: newSub }).then(() => setNewSub(""));
              }}
            >
              <input className="field-in" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="새 소주제 (예: 매체 효과)" style={{ flex: 1 }} />
              <button className="btn sm">추가</button>
            </form>
          </div>
          <p className="hint">소주제를 지워도 논문은 남고 “소주제 없음”으로 옮겨집니다.</p>
        </div>
        {data.role === "owner" && (
          <div>
            {confirmDelete ? (
              <span className="line">
                <span className="warnbox">프로젝트와 그 안의 보관 기록·메모가 모두 지워집니다. 논문 요약은 다른 프로젝트를 위해 남습니다.</span>
                <button className="btn danger" onClick={del}>
                  삭제
                </button>
                <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                  취소
                </button>
              </span>
            ) : (
              <button className="btn danger" onClick={() => setConfirmDelete(true)}>
                프로젝트 삭제
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
