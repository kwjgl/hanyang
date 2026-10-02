"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TrendsResponse } from "@/app/api/projects/[id]/trends/route";
import { api, errMsg, toast } from "@/lib/client";
import { changeLabel, indexed, niceStep, recentChange } from "@/lib/trends";

const W = 900;
const H = 260;
const L = 60;
const R = 200;
const T = 14;
const B = 28;
const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)"];
const short = (t: string) => (t.length > 22 ? `${t.slice(0, 21)}…` : t);

/** 연구 동향: 검색어별 연도별 논문 수 (OpenAlex 전체 집계) */
export function TrendPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [scale, setScale] = useState<"count" | "index">("count");
  const [hover, setHover] = useState<{ j: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(
    async (terms?: string[]) => {
      setState("loading");
      try {
        const q = terms?.length ? `?${terms.map((t) => `t=${encodeURIComponent(t)}`).join("&")}` : "";
        const r = await api<TrendsResponse>(`/api/projects/${projectId}/trends${q}`);
        // 직접 넣은 검색어도 고를 수 있게 남겨 둔다
        setData((prev) => ({ ...r, suggestions: [...new Set([...r.suggestions, ...(prev?.suggestions ?? []), ...(terms ?? [])])] }));
        setError(null);
        setState("done");
      } catch (e) {
        setError(errMsg(e));
        setState("error");
      }
    },
    [projectId],
  );
  useEffect(() => {
    load();
  }, [load]);

  const selected = data?.series.map((s) => s.term) ?? [];
  const toggle = (t: string) => {
    if (selected.includes(t)) {
      if (selected.length === 1) return;
      load(selected.filter((x) => x !== t));
    } else if (selected.length >= 3) toast("검색어는 3개까지 비교할 수 있습니다. 하나를 먼저 빼 주세요");
    else load([...selected, t]);
  };
  const addTerm = (e: React.FormEvent) => {
    e.preventDefault();
    const t = extra.trim();
    if (!t) return;
    setExtra("");
    if (selected.includes(t)) return;
    load([...(selected.length >= 3 ? selected.slice(0, 2) : selected), t]);
  };

  const series = data?.series ?? [];
  const years = data?.years ?? [];
  const vals = series.map((s) => (scale === "index" ? indexed(s.counts) : s.counts));
  const ymaxRaw = Math.max(1, ...vals.flat());
  const step = niceStep(ymaxRaw);
  const ymax = Math.ceil(ymaxRaw / step) * step;
  const sx = (i: number) => L + (i / Math.max(1, years.length - 1)) * (W - L - R);
  const sy = (v: number) => T + (1 - v / ymax) * (H - T - B);
  // 오른쪽 끝 이름표가 겹치지 않게 아래로 민다
  const ends = vals.map((v, i) => ({ i, y: sy(v[v.length - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 16) ends[k].y = ends[k - 1].y + 16;

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg || !years.length) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const j = Math.max(0, Math.min(years.length - 1, Math.round(((pt.x - L) / (W - L - R)) * (years.length - 1))));
    setHover({ j, x: Math.min(e.clientX + 14, window.innerWidth - 300), y: e.clientY + 14 });
  };

  return (
    <div className="panel wide trend">
      <h3>연구 동향</h3>
      <p className="sub">검색어별로 해마다 나온 논문 수입니다 (OpenAlex 전체 집계, 올해는 집계 중이라 뺐습니다). 이 주제가 떠오르는 중인지, 정점을 지났는지 봅니다.</p>

      <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", margin: "0 0 8px" }}>
        {(data?.suggestions ?? []).map((t) => {
          const i = selected.indexOf(t);
          return (
            <button key={t} type="button" className="chip" aria-pressed={i >= 0} onClick={() => toggle(t)} disabled={state === "loading"}>
              {i >= 0 && <span className="sw3" style={{ background: COLORS[i] }} />}
              {t}
            </button>
          );
        })}
        <form onSubmit={addTerm} style={{ display: "inline-flex", gap: 6 }}>
          <input className="field-in" style={{ padding: "4px 8px", width: 170 }} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="검색어 직접 넣기" aria-label="비교할 검색어 넣기" />
          <button className="btn sm" type="submit" disabled={state === "loading"}>
            추가
          </button>
        </form>
      </div>

      {state === "loading" && (
        <p className="progress-line">
          <span className="spin" /> 연도별 논문 수를 세는 중…
        </p>
      )}
      {state === "error" && (
        <p className="warnbox">
          {error}{" "}
          <button className="linkbtn" onClick={() => load(selected)}>
            다시 시도
          </button>
        </p>
      )}
      {state === "done" && !series.length && <p className="hint">이 프로젝트에서 검색을 한 번 하면 그 검색어로 동향을 그립니다. 위에 검색어를 직접 넣어도 됩니다.</p>}

      {state === "done" && series.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "0 0 6px" }}>
            <span className="seg">
              {(
                [
                  ["count", "논문 수"],
                  ["index", "증가 흐름 비교"],
                ] as const
              ).map(([k, v]) => (
                <button key={k} type="button" aria-pressed={scale === k} onClick={() => setScale(k)}>
                  {v}
                </button>
              ))}
            </span>
            <span className="hint" style={{ margin: 0 }}>
              {scale === "index" ? `${years[0]}–${years[4]}년 평균을 100으로 놓고 비교합니다. 규모가 다른 검색어의 흐름을 나란히 볼 때 씁니다.` : "해마다 나온 논문 편수입니다."}
            </span>
          </div>
          <div className="legend-row" style={{ margin: "0 0 6px" }}>
            {series.map((s, i) => (
              <span key={s.term}>
                <span className="sw3" style={{ background: COLORS[i] }} />
                {s.term} · 전체 {s.total.toLocaleString()}편
              </span>
            ))}
          </div>
          <div className="trendwrap">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={scale === "index" ? "연구 동향 선 그래프 (첫 5년 평균 = 100)" : "연구 동향 선 그래프 (연도별 논문 수)"} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
              {Array.from({ length: Math.floor(ymax / step) + 1 }, (_, k) => k * step).map((v) => (
                <g key={v}>
                  <line className="t-grid" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} />
                  <text className="t-axis" x={L - 6} y={sy(v) + 4} textAnchor="end">
                    {v.toLocaleString()}
                  </text>
                </g>
              ))}
              {years.map((y, i) =>
                y % 5 === 0 || i === years.length - 1 ? (
                  <text key={y} className="t-axis" x={sx(i)} y={H - 8} textAnchor="middle">
                    {y}
                  </text>
                ) : null,
              )}
              {series.map((s, i) => {
                const last = s.counts.length - 1;
                const end = ends.find((z) => z.i === i)!;
                return (
                  <g key={s.term}>
                    <path className="t-line" stroke={COLORS[i]} d={vals[i].map((v, j) => `${j ? "L" : "M"}${sx(j)},${sy(v)}`).join("")} />
                    <circle cx={sx(last)} cy={sy(vals[i][last])} r={4} fill={COLORS[i]} stroke="var(--surface)" strokeWidth={2} />
                    <text className="t-end" x={sx(last) + 10} y={end.y + 4}>
                      {short(s.term)}
                    </text>
                  </g>
                );
              })}
              {hover && (
                <>
                  <line className="t-cross" x1={sx(hover.j)} x2={sx(hover.j)} y1={T} y2={H - B} />
                  {series.map((s, i) => (
                    <circle key={s.term} cx={sx(hover.j)} cy={sy(vals[i][hover.j])} r={4} fill={COLORS[i]} stroke="var(--surface)" strokeWidth={2} />
                  ))}
                </>
              )}
              <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
            </svg>
            {hover && (
              <div className="tip" style={{ left: hover.x, top: hover.y }}>
                <b>{years[hover.j]}년</b>
                {series.map((s, i) => (
                  <div key={s.term}>
                    <span className="sw3" style={{ background: COLORS[i] }} />
                    {short(s.term)}: {s.counts[hover.j].toLocaleString()}편{scale === "index" ? ` (지수 ${vals[i][hover.j]})` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="insight">
            {series.map((s, i) => (
              <span key={s.term}>
                <span className="sw3" style={{ background: COLORS[i] }} />
                {short(s.term)}: 최근 5년 <b>{changeLabel(recentChange(s.counts))}</b>
              </span>
            ))}
          </div>
          <details style={{ marginTop: 8 }}>
            <summary className="hint" style={{ cursor: "pointer" }}>
              표로 보기
            </summary>
            <div className="trendwrap">
              <table className="cmp" style={{ marginTop: 6, fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>연도</th>
                    {series.map((s) => (
                      <th key={s.term}>{s.term}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {years.map((y, j) => (
                    <tr key={y}>
                      <td>{y}</td>
                      {series.map((s) => (
                        <td key={s.term} style={{ fontFamily: "var(--f-mono)" }}>
                          {s.counts[j].toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="hint">검색어가 넓을수록 관련 없는 논문도 섞여 숫자가 커집니다. 절대 숫자보다 기울기(늘고 줄어드는 흐름)를 보세요.</p>
        </>
      )}
    </div>
  );
}
