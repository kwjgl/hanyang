"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import type { Field } from "@/lib/types";

export function NewProjectForm({ fields }: { fields: Field[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rq, setRq] = useState("");
  const [query, setQuery] = useState("");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [subs, setSubs] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast("프로젝트 이름을 입력해 주세요");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/projects", {
        body: { name, researchQuestion: rq, defaultQuery: query, fieldIds, subtopics: subs.split("\n") },
      });
      router.push(`/p/${r.id}`);
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="phead">
        <h1>새 프로젝트</h1>
      </div>
      <p className="rq">학위논문, 학회 발표, 수업 준비처럼 연구 주제마다 프로젝트를 하나씩 만듭니다. 나중에 모두 바꿀 수 있습니다.</p>
      <form className="form" onSubmit={submit} style={{ marginTop: 18 }}>
        <label>
          이름
          <input className="field-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 학위논문 · 디지털 읽기 평가" />
        </label>
        <label>
          연구 질문 <span className="hint">Claude가 검색어를 넓힐 때 참고합니다</span>
          <textarea className="field-in" value={rq} onChange={(e) => setRq(e.target.value)} placeholder="예: 디지털 기반 국어 읽기 평가에서 매체와 문항 유형은 읽기 이해 측정에 어떤 영향을 주는가?" />
        </label>
        <label>
          처음 찾아볼 검색어
          <input className="field-in" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 디지털 환경의 읽기 평가와 문항 설계" />
        </label>
        <div>
          <span className="lbl">관련 분야</span>
          <div className="badges">
            {fields.map((f) => (
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
        <label>
          소주제 <span className="hint">한 줄에 하나씩. 문헌 고찰의 목차처럼 쓰면 좋습니다.</span>
          <textarea className="field-in" value={subs} onChange={(e) => setSubs(e.target.value)} placeholder={"읽기 이해 이론\n매체 효과 (종이 vs 화면)\n디지털 문항 유형"} />
        </label>
        <div>
          <button className="btn primary" disabled={busy}>
            {busy ? "만드는 중…" : "프로젝트 만들기"}
          </button>
        </div>
      </form>
    </>
  );
}
