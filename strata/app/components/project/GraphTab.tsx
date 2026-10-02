"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceLayout, type GNode, nodeLabel, radiusOf, timelineLayout, visibleGraph } from "@/lib/graph";
import type { ProjectData } from "@/lib/server/load";
import { firstAuthor, ImpactBadges } from "../bits";
import type { Citations } from "./useCitations";

const W = 900;
const NET_H = 520;
const NO_SUB = "소주제 없음";
type View = { k: number; x: number; y: number };

export function GraphTab({ data, cites, onShowCore }: { data: ProjectData; cites: Citations; onShowCore: () => void }) {
  const [mode, setMode] = useState<"net" | "time">("net");
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [, bump] = useState(0);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "node" | "pan"; id?: string; sx: number; sy: number; moved: boolean; vx: number; vy: number } | null>(null);

  const subName = useMemo(() => new Map(data.subtopics.map((s) => [s.id, s.name])), [data.subtopics]);

  // 그래프 재료: 보관한 논문 + 핵심 후보, 그리고 인용 연결
  const base = useMemo(() => {
    const links = cites.data?.links ?? [];
    const laneOf = new Map(data.rows.map((r) => [r.paper.id, (r.subtopicId && subName.get(r.subtopicId)) || NO_SUB]));
    const nodes: GNode[] = data.rows.map((r) => ({
      id: r.paper.id,
      title: r.paper.title,
      authors: r.paper.authors ?? [],
      year: r.paper.year,
      citations: r.paper.citations,
      cand: false,
      lane: laneOf.get(r.paper.id)!,
      x: 0,
      y: 0,
    }));
    for (const c of cites.data?.core ?? []) {
      // 후보는 그 논문을 가장 많이 인용한 소주제 줄에 놓는다
      const votes = new Map<string, number>();
      for (const id of c.citedBy) votes.set(laneOf.get(id) ?? NO_SUB, (votes.get(laneOf.get(id) ?? NO_SUB) ?? 0) + 1);
      const lane = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? NO_SUB;
      nodes.push({ id: c.ids.openalex!, title: c.title, authors: c.authors, year: c.year, citations: c.citations, cand: true, lane, x: 0, y: 0 });
    }
    return { nodes, links };
  }, [data.rows, cites.data, subName]);

  const graph = useMemo(() => {
    const { nodes, edges } = visibleGraph(
      base.nodes.map((n) => ({ ...n })),
      base.links,
      showAll,
    );
    if (mode === "net") {
      forceLayout(nodes, edges, W, NET_H);
      return { nodes, edges, H: NET_H, lanes: [], ticks: [] };
    }
    const order = [...data.subtopics.map((s) => s.name), NO_SUB];
    const t = timelineLayout(nodes, order, W);
    return { nodes, edges, H: t.height, lanes: t.lanes, ticks: t.ticks };
  }, [base, showAll, mode, data.subtopics]);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  useEffect(() => {
    setView({ k: 1, x: 0, y: 0 });
    setFocus(null);
  }, [graph]);

  // 휠로 확대·축소 (페이지 스크롤을 막아야 해서 직접 등록한다)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && mode === "time") return;
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      setView((v) => zoomAt(v, p, e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };
  const zoomAt = (v: View, p: { x: number; y: number }, f: number): View => {
    const k = Math.min(4, Math.max(0.4, v.k * f));
    const r = k / v.k;
    return { k, x: p.x - (p.x - v.x) * r, y: p.y - (p.y - v.y) * r };
  };

  const onDown = (e: React.PointerEvent, id?: string) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: id ? "node" : "pan", id, sx: e.clientX, sy: e.clientY, moved: false, vx: view.x, vy: view.y };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.kind === "pan") {
      const a = toSvg(d.sx, d.sy);
      const b = toSvg(e.clientX, e.clientY);
      setView((v) => ({ ...v, x: d.vx + (b.x - a.x), y: d.vy + (b.y - a.y) }));
    } else if (d.id && mode === "net") {
      const p = toSvg(e.clientX, e.clientY);
      const n = byId.get(d.id)!;
      n.x = (p.x - view.x) / view.k;
      n.y = (p.y - view.y) / view.k;
      bump((x) => x + 1);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    setFocus(d.kind === "node" ? (focus === d.id ? null : d.id!) : null);
  };

  if (!data.rows.length)
    return (
      <div className="empty-state">
        <h2>아직 보관한 논문이 없습니다</h2>
        <p>논문을 보관하면 서로 인용하는 관계가 그림으로 그려집니다.</p>
      </div>
    );
  if (cites.state === "idle" || cites.state === "loading") return <p className="progress-line"><span className="spin" /> 보관한 논문들의 참고문헌을 OpenAlex에서 불러오는 중…</p>;
  if (cites.state === "error")
    return (
      <p className="warnbox" style={{ marginTop: 14 }}>
        {cites.error}{" "}
        <button className="linkbtn" onClick={cites.load}>
          다시 시도
        </button>
      </p>
    );

  const neighbors = new Set<string>();
  if (focus) for (const e of graph.edges) if (e.a === focus || e.b === focus) neighbors.add(e.a).add(e.b);
  const dim = (id: string) => !!focus && id !== focus && !neighbors.has(id);
  const rOf = (n: GNode) => (mode === "time" ? Math.min(radiusOf(n.citations), 10) : radiusOf(n.citations));
  const sel = focus ? byId.get(focus) : null;
  const unlinked = base.nodes.length - visibleGraph(base.nodes, base.links, false).nodes.length;

  const edgePath = (a: GNode, b: GNode) => {
    const ra = rOf(a) + 2;
    const rb = rOf(b) + 4;
    if (mode === "net") {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      return `M${a.x + (dx / d) * ra},${a.y + (dy / d) * ra} L${b.x - (dx / d) * rb},${b.y - (dy / d) * rb}`;
    }
    // 연도 계보: 인용한 논문(나중) → 인용된 논문(먼저)으로 휘어지는 선
    const dir = b.x <= a.x ? -1 : 1;
    const ax = a.x + dir * ra;
    const bx = b.x - dir * rb;
    const mx = (ax + bx) / 2;
    return `M${ax},${a.y} C${mx},${a.y} ${mx},${b.y} ${bx},${b.y}`;
  };

  return (
    <>
      <div className="toolbar">
        <span className="seg">
          {(
            [
              ["net", "관계망"],
              ["time", "연도 계보"],
            ] as const
          ).map(([k, v]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>
              {v}
            </button>
          ))}
        </span>
        <span className="hint" style={{ margin: 0 }}>
          {mode === "net"
            ? "서로 인용하는 논문끼리 가까이 모입니다. 점을 누르면 연결된 논문만 강조되고, 끌어서 옮길 수 있습니다."
            : "가로는 출판 연도, 세로 줄은 소주제입니다. 어떤 연구가 무엇을 바탕으로 나왔는지 흐름이 보입니다."}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
          {unlinked > 0 && (
            <label className="chk">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 연결 없는 논문 {unlinked}편도 보기
            </label>
          )}
          <button className="btn sm" type="button" aria-label="확대" onClick={() => setView((v) => zoomAt(v, { x: W / 2, y: graph.H / 2 }, 1.25))}>
            +
          </button>
          <button className="btn sm" type="button" aria-label="축소" onClick={() => setView((v) => zoomAt(v, { x: W / 2, y: graph.H / 2 }, 0.8))}>
            −
          </button>
          <button className="btn sm" type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
            맞춤
          </button>
        </span>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="empty-state">
          <h2>아직 서로 이어진 논문이 없습니다</h2>
          <p>
            보관한 논문끼리 인용한 관계나, 여러 편이 함께 인용한 핵심 문헌이 없습니다.
            {cites.data && cites.data.found < cites.data.total ? ` (OpenAlex에서 참고문헌을 찾은 논문 ${cites.data.found}/${cites.data.total}편)` : ""}
          </p>
          {unlinked > 0 && (
            <button className="btn" onClick={() => setShowAll(true)}>
              연결 없이 모두 보기
            </button>
          )}
        </div>
      ) : (
        <div className="gwrap" onMouseLeave={() => setTip(null)}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${graph.H}`}
            role="img"
            aria-label={`논문 인용 관계도: 논문 ${graph.nodes.length}편, 연결 ${graph.edges.length}개`}
            style={{ touchAction: "none", cursor: drag.current?.kind === "pan" ? "grabbing" : "grab" }}
            onPointerDown={(e) => onDown(e)}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <defs>
              <marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
              </marker>
              <marker id="arr-hi" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
              </marker>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {graph.lanes.map((l) => (
                <g key={l.name}>
                  <rect className="g-lane" x={0} y={l.top + 2} width={W} height={l.height - 4} />
                  <text className="g-lane-lab" x={12} y={l.top + 36}>
                    {l.name.length > 12 ? `${l.name.slice(0, 12)}…` : l.name}
                  </text>
                </g>
              ))}
              {graph.ticks.map((t) => (
                <g key={t.label}>
                  <line className="g-grid" x1={t.x} x2={t.x} y1={28} y2={graph.H - 24} />
                  <text className="g-axis" x={t.x} y={graph.H - 8} textAnchor="middle">
                    {t.label}
                  </text>
                </g>
              ))}
              {graph.edges.map((e) => {
                const a = byId.get(e.a)!;
                const b = byId.get(e.b)!;
                const hi = !!focus && (e.a === focus || e.b === focus);
                return (
                  <path
                    key={`${e.a}|${e.b}`}
                    className={`g-edge${hi ? " hi" : ""}${focus && !hi ? " g-dim" : ""}`}
                    d={edgePath(a, b)}
                    markerEnd={`url(#${hi ? "arr-hi" : "arr"})`}
                  />
                );
              })}
              {graph.nodes.map((n) => {
                const r = rOf(n);
                const label = nodeLabel(n);
                return (
                  <g
                    key={n.id}
                    className={dim(n.id) ? "g-dim" : undefined}
                    tabIndex={0}
                    role="button"
                    aria-label={`${label}: ${n.title}${n.cand ? " (보관하지 않은 핵심 후보)" : ""}`}
                    onPointerDown={(e) => onDown(e, n.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setFocus(focus === n.id ? null : n.id);
                      }
                    }}
                    onMouseMove={(e) => setTip({ text: `${n.title} (${n.year ?? "연도 미상"})`, x: Math.min(e.clientX + 14, window.innerWidth - 300), y: e.clientY + 14 })}
                    onMouseLeave={() => setTip(null)}
                  >
                    <circle className={`g-node${n.cand ? " cand" : ""}`} cx={n.x} cy={n.y} r={r} />
                    {focus === n.id && <circle cx={n.x} cy={n.y} r={r + 4} fill="none" stroke="var(--accent)" strokeWidth={2} />}
                    <text
                      className={`g-lab${n.cand ? " cand" : ""}`}
                      {...(mode === "time" ? { x: n.x, y: n.y - r - 5, textAnchor: "middle" } : { x: n.x + r + 4, y: n.y + 4 })}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          {tip && (
            <div className="tip" style={{ left: tip.x, top: tip.y }}>
              {tip.text}
            </div>
          )}
        </div>
      )}

      <div className="gnote">
        <span>
          <svg width="16" height="16" aria-hidden>
            <circle cx="8" cy="8" r="6" fill="var(--accent)" />
          </svg>{" "}
          보관한 논문
        </span>
        <span>
          <svg width="16" height="16" aria-hidden>
            <circle cx="8" cy="8" r="6" fill="var(--surface)" stroke="var(--info)" strokeWidth="2" strokeDasharray="3 2" />
          </svg>{" "}
          아직 보관하지 않은 핵심 후보
        </span>
        <span>점 크기 = 피인용 수</span>
        <span>화살표 = 인용 방향 (인용한 논문 → 인용된 논문)</span>
        <span>{mode === "net" ? "빈 곳을 끌면 화면 이동 · 휠로 확대·축소" : "빈 곳을 끌면 화면 이동 · Ctrl+휠로 확대·축소"}</span>
      </div>

      {sel && <NodeDetail sel={sel} data={data} cites={cites} edges={graph.edges} byId={byId} onShowCore={onShowCore} onPick={setFocus} />}
      <p className="hint">인용 관계는 OpenAlex의 참고문헌 목록으로 만듭니다. 국내 학술지 논문은 참고문헌 정보가 없어 빠질 수 있습니다.</p>
    </>
  );
}

function NodeDetail(props: {
  sel: GNode;
  data: ProjectData;
  cites: Citations;
  edges: { a: string; b: string }[];
  byId: Map<string, GNode>;
  onShowCore: () => void;
  onPick: (id: string) => void;
}) {
  const { sel, data, cites, edges, byId } = props;
  const row = data.rows.find((r) => r.paper.id === sel.id);
  const cand = cites.data?.core.find((c) => c.ids.openalex === sel.id);
  const paper = row?.paper ?? cand;
  const cites_ = edges.filter((e) => e.a === sel.id).map((e) => byId.get(e.b)!);
  const citedBy = edges.filter((e) => e.b === sel.id).map((e) => byId.get(e.a)!);
  const list = (title: string, ns: GNode[]) =>
    ns.length > 0 && (
      <div style={{ marginTop: 8 }}>
        <b style={{ fontSize: 12.5 }}>{title}</b>
        <div className="nd-list">
          {ns.map((n) => (
            <div key={n.id}>
              <button className="linkbtn" onClick={() => props.onPick(n.id)}>
                {nodeLabel(n)}
              </button>{" "}
              <span className="meta">{n.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <section className="core">
      <h3 style={{ fontFamily: "var(--f-title)" }}>
        {paper?.url ? (
          <a className="title-link" href={paper.url} target="_blank" rel="noreferrer">
            <span>{sel.title}</span>
          </a>
        ) : (
          sel.title
        )}
      </h3>
      <div className="who">
        {firstAuthor(sel.authors)} ({sel.year ?? "연도 미상"}){paper?.venue ? <> · <i>{paper.venue}</i></> : null}
        {row && ` · ${(row.subtopicId && data.subtopics.find((s) => s.id === row.subtopicId)?.name) || "소주제 없음"}`}
      </div>
      {paper && (
        <div className="badges" style={{ marginTop: 4 }}>
          <ImpactBadges c={paper} />
          {cand && <span className="why">보관한 논문 {cand.citedBy.length}편이 인용 · 아직 보관 안 함</span>}
        </div>
      )}
      {row?.summary && <p style={{ margin: "8px 0 0", fontSize: 13 }}>{row.summary.one_line}</p>}
      {list("이 논문이 인용한 논문", cites_)}
      {list("이 논문을 인용한 논문", citedBy)}
      {cand && (
        <button className="btn sm" style={{ marginTop: 10 }} onClick={props.onShowCore}>
          핵심 문헌 후보를 검색 결과로 열기
        </button>
      )}
    </section>
  );
}
