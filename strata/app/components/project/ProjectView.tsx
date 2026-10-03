"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ProjectData } from "@/lib/server/load";
import { Avatar, FieldTags } from "../bits";
import { CompareTab } from "./CompareTab";
import { DashboardTab } from "./DashboardTab";
import { GapTab } from "./GapTab";
import { WriteTab } from "./WriteTab";
import { GraphTab } from "./GraphTab";
import { ProjectEditor } from "./ProjectEditor";
import { ResultsTab } from "./ResultsTab";
import { SharePanel } from "./SharePanel";
import { useCitations } from "./useCitations";
import { type Hit, useSearch, type SearchResult } from "./useSearch";

/** 새 논문 알림에서 "프로젝트에서 열기"로 들어왔을 때 보여 줄 논문들 */
export interface AlertOpen {
  searchId: string;
  query: string;
  hits: Hit[];
}

export function ProjectView({ data, initialResult, alert }: { data: ProjectData; initialResult?: SearchResult | null; alert?: AlertOpen | null }) {
  const { project, role, members, fields, rows } = data;
  const s = useSearch(project.id, project.default_query, initialResult, alert ? { title: `새 논문 알림 — “${alert.query}”`, results: alert.hits } : null);
  // 알림을 열어 봤으면 읽음으로 표시한다 (나에게만)
  useEffect(() => {
    if (alert) api("/api/alerts/read", { body: { searchId: alert.searchId } }).catch(() => {});
  }, [alert]);
  const [tab, setTab] = useState<"results" | "table" | "write" | "dash" | "graph" | "gap">(alert || initialResult || !rows.length ? "results" : "table");
  const cites = useCitations(
    project.id,
    rows.map((r) => r.paper.id),
    tab !== "results",
  );
  const showCore = () => {
    if (!cites.data?.core.length) return;
    s.setRelated({ title: "핵심 문헌 후보 — 보관한 논문 여러 편이 함께 인용", results: cites.data.core });
    setTab("results");
  };
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const canEdit = role !== "viewer";
  const owner = members.find((m) => m.role === "owner");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTab("results");
    s.runSearch();
  };

  return (
    <>
      <div className="phead">
        <h1>{project.name}</h1>
        {canEdit && (
          <button className="linkbtn" onClick={() => setEditing(!editing)}>
            {editing ? "편집 닫기" : "편집"}
          </button>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, alignItems: "center" }}>
          <span className="avs">
            {members.map((m, i) => (
              <Avatar key={m.user_id} name={m.name} i={i} />
            ))}
          </span>
          <button className="btn" onClick={() => setShareOpen(!shareOpen)} aria-expanded={shareOpen}>
            {members.length > 1 ? "공유 중" : "공유"}
          </button>
        </span>
      </div>
      {role !== "owner" && owner && (
        <p className="hint" style={{ margin: "4px 0 0" }}>
          {owner.name} 님이 공유한 프로젝트 · 내 권한: {role === "editor" ? "편집 가능" : "보기만"}
        </p>
      )}
      {shareOpen && <SharePanel data={data} />}
      {editing && <ProjectEditor data={data} onDone={() => setEditing(false)} />}
      {project.research_question && (
        <p className="rq">
          <b>연구 질문</b> {project.research_question}
        </p>
      )}
      <div className="badges" style={{ marginTop: 8 }}>
        <FieldTags ids={project.field_ids} fields={fields} />
        <span className="b">
          보관 {rows.length}편 · 소주제 {data.subtopics.length}개
        </span>
      </div>

      <form className="bigq" onSubmit={submit}>
        <input value={s.query} onChange={(e) => s.setQuery(e.target.value)} placeholder="이 프로젝트에서 찾을 주제나 키워드" aria-label="이 프로젝트에서 논문 찾기" />
        <button className="btn primary" type="submit" disabled={s.phase !== "idle"}>
          {s.phase === "idle" ? "찾기" : "찾는 중…"}
        </button>
      </form>
      <p className="hint">
        <label className="chk">
          <input type="checkbox" checked={s.autoExpand} onChange={(e) => s.setAutoExpand(e.target.checked)} /> 연구 질문과 분야를 반영해 한국어·영어 검색어로 넓혀 찾기
        </label>
      </p>

      <div className="ptabs" role="tablist">
        <button className="ptab" role="tab" aria-selected={tab === "results"} onClick={() => setTab("results")}>
          검색 결과<span className="n">{s.result ? s.result.results.length : "–"}</span>
        </button>
        <button className="ptab" role="tab" aria-selected={tab === "table"} onClick={() => setTab("table")}>
          비교표<span className="n">{rows.length}</span>
        </button>
        <button className="ptab" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>
          글쓰기
        </button>
        <button className="ptab" role="tab" aria-selected={tab === "dash"} onClick={() => setTab("dash")}>
          대시보드
        </button>
        <button className="ptab" role="tab" aria-selected={tab === "graph"} onClick={() => setTab("graph")}>
          관계도
        </button>
        <button className="ptab" role="tab" aria-selected={tab === "gap"} onClick={() => setTab("gap")}>
          공백 지도
        </button>
      </div>
      <div hidden={tab !== "results"}>
        <ResultsTab s={s} data={data} />
      </div>
      <div hidden={tab !== "table"}>
        <CompareTab
          data={data}
          onRelated={(kind, c) => {
            setTab("results");
            s.loadRelated(kind, c);
          }}
          cites={cites}
          onShowCore={showCore}
        />
      </div>
      <div hidden={tab !== "dash"}>{tab === "dash" && <DashboardTab data={data} cites={cites} onShowCore={showCore} />}</div>
      <div hidden={tab !== "write"}>{tab === "write" && <WriteTab data={data} />}</div>
      <div hidden={tab !== "gap"}>
        {tab === "gap" && (
          <GapTab
            data={data}
            onSearch={(q) => {
              setTab("results");
              s.runSearch({ query: q });
            }}
          />
        )}
      </div>
      <div hidden={tab !== "graph"}>{tab === "graph" && <GraphTab data={data} cites={cites} onShowCore={showCore} />}</div>
    </>
  );
}
