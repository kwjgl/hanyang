"use client";
import type { ProjectData } from "@/lib/server/load";
import { firstAuthor, ImpactBadges } from "../bits";
import type { Citations } from "./useCitations";

/** 보관한 논문들이 함께 인용하는데 아직 보관하지 않은 논문 */
export function CoreList({ data, cites, onShowCore }: { data: ProjectData; cites: Citations; onShowCore: () => void }) {
  if (cites.state === "error")
    return (
      <section className="core">
        <h3>핵심 문헌 후보</h3>
        <p className="hint" style={{ margin: "4px 0 0" }}>
          {cites.error}{" "}
          <button className="linkbtn" onClick={cites.load}>
            다시 시도
          </button>
        </p>
      </section>
    );
  if (cites.state !== "done" || !cites.data?.core.length) return null;
  const titleOf = (id: string) => data.rows.find((r) => r.paper.id === id)?.paper;
  return (
    <section className="core">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
        <h3>핵심 문헌 후보 {cites.data.core.length}편</h3>
        <button className="btn sm" onClick={onShowCore}>
          검색 결과로 열어 골라 요약·보관
        </button>
      </div>
      <p className="hint" style={{ margin: "4px 0 0" }}>
        보관한 논문 여러 편이 함께 인용하는데 아직 보관하지 않은 논문입니다. 그 분야의 기초 문헌일 가능성이 높습니다.
      </p>
      <ul>
        {cites.data.core.map((c) => (
          <li key={c.key}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--f-title)" }}>
                {c.url ? (
                  <a className="title-link" href={c.url} target="_blank" rel="noreferrer">
                    <span>{c.title}</span>
                  </a>
                ) : (
                  c.title
                )}
              </div>
              <div className="who">
                {firstAuthor(c.authors)} ({c.year ?? "연도 미상"}){c.venue ? <> · <i>{c.venue}</i></> : null}
              </div>
              <div className="badges" style={{ marginTop: 4 }}>
                <ImpactBadges c={c} />
                {c.placements?.map((p) => (
                  <span key={p.projectId} className="inproj">
                    {p.projectName}에 있음
                  </span>
                ))}
              </div>
            </div>
            <span
              className="why"
              title={c.citedBy
                .map((id) => titleOf(id)?.title)
                .filter(Boolean)
                .join("\n")}
            >
              보관한 논문 {c.citedBy.length}편이 인용
            </span>
          </li>
        ))}
      </ul>
      {cites.data.found < cites.data.total && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          보관한 {cites.data.total}편 중 {cites.data.found}편만 OpenAlex에서 찾아 참고문헌을 확인했습니다. 국내 학술지 논문은 참고문헌 정보가 없는 경우가 많습니다.
        </p>
      )}
    </section>
  );
}
