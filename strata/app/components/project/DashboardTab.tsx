"use client";
import { useMemo, useState } from "react";
import { countBy, TIER_ORDER, tierCounts, weeklyCounts, yearBins } from "@/lib/dashboard";
import type { ProjectData } from "@/lib/server/load";
import { Avatar } from "../bits";
import { TrendPanel } from "./TrendPanel";
import type { Citations } from "./useCitations";

type Row = { label: string; n: number; flag?: string; tip?: string };

/** 막대 위에 마우스를 올리면 data-tip 내용을 보여준다 */
function useTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const handlers = {
    onMouseMove: (e: React.MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      setTip(el ? { text: el.dataset.tip!, x: Math.min(e.clientX + 14, window.innerWidth - 300), y: e.clientY + 14 } : null);
    },
    onMouseLeave: () => setTip(null),
  };
  const node = tip ? (
    <div className="tip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { handlers, node };
}

function HBars({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <>
      {rows.map((r) => (
        <div className="hb" key={r.label} data-tip={r.tip ?? `${r.label}: ${r.n}편`}>
          <span className="lab" title={r.label}>
            {r.label}
            {r.flag && <span className="flag">▲ {r.flag}</span>}
          </span>
          <span className="track">
            <div className="bar" style={{ width: `${r.n ? Math.max((r.n / max) * 100, 3) : 0}%`, minWidth: r.n ? undefined : 0 }} />
          </span>
          <span className="num">{r.n}</span>
        </div>
      ))}
    </>
  );
}

function VBars({ bins, height = 130 }: { bins: { label: string; tip: string; n: number }[]; height?: number }) {
  const max = Math.max(1, ...bins.map((b) => b.n));
  return (
    <>
      <div className="vbars" style={{ height }} role="img" aria-label={bins.map((b) => b.tip).join(", ")}>
        {bins.map((b, i) => (
          <div className="vb" key={i} data-tip={b.tip}>
            <span className="num">{b.n || ""}</span>
            <div className="bar" style={{ height: `${(b.n / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="vlabels">
        {bins.map((b, i) => (
          <span key={i}>{b.label}</span>
        ))}
      </div>
    </>
  );
}

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? "오늘" : d === 1 ? "어제" : d < 30 ? `${d}일 전` : new Date(iso).toLocaleDateString("ko-KR");
};

export function DashboardTab({ data, cites, onShowCore }: { data: ProjectData; cites: Citations; onShowCore: () => void }) {
  const { rows, subtopics, members, fields } = data;
  const { handlers, node } = useTip();

  const stats = useMemo(() => {
    const n = rows.length;
    const done = rows.filter((r) => r.status === "done").length;
    const doing = rows.filter((r) => r.status === "doing").length;
    const tiers = tierCounts(rows.map((r) => r.paper));
    const subRows: Row[] = subtopics.map((s) => {
      const k = rows.filter((r) => r.subtopicId === s.id).length;
      return { label: s.name, n: k, flag: k <= 1 ? "보강 필요" : undefined, tip: `${s.name}: ${k}편${k <= 1 ? " — 근거가 얇습니다. 이 소주제로 더 찾아보세요" : ""}` };
    });
    const unsorted = rows.filter((r) => !r.subtopicId || !subtopics.some((s) => s.id === r.subtopicId)).length;
    if (unsorted) subRows.push({ label: "소주제 없음", n: unsorted });
    const thisYear = new Date().getFullYear();
    const summarized = rows.filter((r) => r.summary);
    return {
      n,
      done,
      doing,
      todo: n - done - doing,
      tiers,
      subRows,
      years: yearBins(rows.map((r) => r.paper.year)),
      recent5: rows.filter((r) => r.paper.year && r.paper.year > thisYear - 5).length,
      types: countBy(summarized, (r) => r.summary!.study_type),
      levels: countBy(summarized, (r) => r.summary!.levels),
      fieldRows: countBy(rows, (r) => r.fieldIds.map((id) => fields.find((f) => f.id === id)?.name ?? "")),
      noSummary: n - summarized.length,
      weekly: weeklyCounts(rows.map((r) => r.addedAt)),
    };
  }, [rows, subtopics, fields]);

  const activity = useMemo(() => {
    if (members.length < 2) return [];
    const nameOf = (id: string) => members.find((m) => m.user_id === id)?.name ?? "멤버";
    const items = [
      ...rows.map((r) => ({ who: r.addedBy ?? "멤버", what: `“${r.paper.title}” 보관`, at: r.addedAt })),
      ...rows.flatMap((r) =>
        r.notes.filter((x) => x.visibility === "shared").map((x) => ({ who: nameOf(x.user_id), what: `“${r.paper.title}”에 메모`, at: x.created_at })),
      ),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  }, [rows, members]);

  if (!rows.length)
    return (
      <>
        <div className="empty-state">
          <h2>아직 보관한 논문이 없습니다</h2>
          <p>논문을 보관하면 소주제별 편수, 연도 분포, 읽기 진행 상황이 여기에 그려집니다.</p>
        </div>
        <div className="dash">
          <TrendPanel projectId={data.project.id} />
        </div>
      </>
    );

  const { n, done, doing, todo, tiers } = stats;
  const coreN = cites.data?.core.length ?? 0;

  return (
    <div {...handlers}>
      {node}
      <div className="tiles">
        <div className="tile">
          <div className="k">보관한 논문</div>
          <div className="v">
            {n}
            <small> 편</small>
          </div>
          <div className="d">소주제 {subtopics.length}개</div>
        </div>
        <div className="tile">
          <div className="k">읽기 진행</div>
          <div className="v">
            {done}
            <small> / {n}</small>
          </div>
          <div className="d">읽는 중 {doing}편</div>
        </div>
        <div className="tile">
          <div className="k">상위 10% 이상 논문</div>
          <div className="v">
            {tiers.top1 + tiers.top10}
            <small> 편</small>
          </div>
          <div className="d">그중 상위 1% {tiers.top1}편 · 분야·연도 보정</div>
        </div>
        <div className="tile">
          <div className="k">놓친 핵심 문헌 후보</div>
          <div className="v">
            {cites.state === "done" ? coreN : "…"}
            <small> 편</small>
          </div>
          <div className="d">
            {cites.state === "loading" || cites.state === "idle" ? (
              "인용 관계를 확인하는 중"
            ) : cites.state === "error" ? (
              <button className="linkbtn" onClick={cites.load}>
                불러오지 못함 · 다시 시도
              </button>
            ) : coreN ? (
              <button className="linkbtn" onClick={onShowCore}>
                검색 결과로 보기 →
              </button>
            ) : (
              "없음"
            )}
          </div>
        </div>
      </div>

      <div className="dash">
        <TrendPanel projectId={data.project.id} />
        <div className="panel">
          <h3>소주제별 논문 수</h3>
          <p className="sub">한 편 이하인 소주제는 근거가 얇다는 뜻입니다.</p>
          {stats.subRows.length ? <HBars rows={stats.subRows} /> : <p className="hint">프로젝트 편집에서 소주제를 만들면 여기에 나뉘어 보입니다.</p>}
        </div>

        <div className="panel">
          <h3>출판 연도 분포</h3>
          <p className="sub">
            최근 5년 논문 {stats.recent5}편{stats.recent5 === 0 ? " — 최신 연구가 비어 있습니다" : ""}
          </p>
          {stats.years.length ? <VBars bins={stats.years} /> : <p className="hint">연도 정보가 없습니다.</p>}
        </div>

        <div className="panel">
          <h3>연구 유형</h3>
          <p className="sub">
            리뷰·메타분석이 있으면 그 분야 지형을 빨리 잡을 수 있습니다.{stats.noSummary ? ` 요약 안 된 ${stats.noSummary}편은 빠졌습니다.` : ""}
          </p>
          {stats.types.length ? <HBars rows={stats.types} /> : <p className="hint">요약한 논문이 없어 아직 알 수 없습니다.</p>}
        </div>

        <div className="panel">
          <h3>영향력 분포</h3>
          <p className="sub">같은 분야·같은 해 논문 대비 피인용 순위 (OpenAlex)</p>
          <HBars
            rows={TIER_ORDER.map(([t, label]) => ({
              label,
              n: tiers[t],
              tip:
                t === "recent"
                  ? `${label}: ${tiers[t]}편 — 피인용이 쌓이기 전이라 순위로 판단하지 않습니다`
                  : t === "none"
                    ? `${label}: ${tiers[t]}편 — OpenAlex에 순위 정보가 없는 논문`
                    : `${label}: ${tiers[t]}편`,
            }))}
          />
        </div>

        <div className="panel">
          <h3>분야</h3>
          <p className="sub">한 논문이 여러 분야에 들어갈 수 있습니다.</p>
          {stats.fieldRows.length ? <HBars rows={stats.fieldRows} /> : <p className="hint">분류된 논문이 없습니다.</p>}
        </div>

        <div className="panel">
          <h3>대상 학교급</h3>
          <p className="sub">요약할 때 초록에서 읽어 낸 연구 대상입니다.</p>
          {stats.levels.length ? <HBars rows={stats.levels} /> : <p className="hint">요약한 논문이 없어 아직 알 수 없습니다.</p>}
        </div>

        <div className="panel">
          <h3>읽기 상태</h3>
          <p className="sub">
            {n}편 중 {done}편 읽음 (내 기준)
          </p>
          <div className="prog" role="img" aria-label={`읽음 ${done}, 읽는 중 ${doing}, 읽을 것 ${todo}`}>
            {(
              [
                ["p-done", done, "읽음"],
                ["p-doing", doing, "읽는 중"],
                ["p-todo", todo, "읽을 것"],
              ] as const
            )
              .filter((r) => r[1])
              .map(([c, k, l]) => (
                <div key={c} className={c} style={{ flex: k }} data-tip={`${l}: ${k}편`} />
              ))}
          </div>
          <div className="legend-row">
            <span>
              <i style={{ background: "var(--accent)" }} />
              읽음 {done}
            </span>
            <span>
              <i style={{ background: "color-mix(in srgb,var(--accent) 45%,var(--surface))" }} />
              읽는 중 {doing}
            </span>
            <span>
              <i style={{ background: "var(--sunk)", outline: "1px solid var(--line)" }} />
              읽을 것 {todo}
            </span>
          </div>
        </div>

        <div className="panel">
          <h3>주별 보관 활동</h3>
          <p className="sub">최근 8주 동안 이 프로젝트에 보관한 논문 수</p>
          <VBars
            height={90}
            bins={stats.weekly.map((k, j) => ({
              n: k,
              label: j === 7 ? "이번 주" : j === 0 ? "8주 전" : "",
              tip: `${j === 7 ? "이번 주" : `${7 - j}주 전`}: ${k}편`,
            }))}
          />
        </div>

        {activity.length > 0 && (
          <div className="panel wide">
            <h3>최근 활동</h3>
            <p className="sub">공유 멤버들이 이 프로젝트에서 한 일</p>
            <ul className="act">
              {activity.map((a, i) => (
                <li key={i}>
                  <Avatar name={a.who} i={Math.max(0, members.findIndex((m) => m.name === a.who))} />
                  <span>
                    <b>{a.who}</b> {a.what} <span className="when">· {ago(a.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
