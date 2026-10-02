"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, copyText, errMsg, toast } from "@/lib/client";
import { AXES, type AxisId, buildMatrix, type CustomAxis, itemsIn, matrixTsv } from "@/lib/gapmap";
import { GAPMAPS_SQL } from "@/lib/gapmap-sql";
import type { GapMapMeta, GapMapRow } from "@/lib/server/gapmap";
import type { ProjectData } from "@/lib/server/load";
import { SqlSetup } from "../SqlSetup";

type Loaded = { ready: boolean; maps: GapMapMeta[]; map: GapMapRow | null };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 연구 공백 지도: 소주제 × 축으로 논문 수를 세어 빈칸(선행연구가 없는 곳)을 찾는다 */
export function GapTab({ data, onSearch }: { data: ProjectData; onSearch: (q: string) => void }) {
  const canEdit = data.role !== "viewer";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [axis, setAxis] = useState<AxisId>("level");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [cell, setCell] = useState<{ row: string; col: string } | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [top, setTop] = useState(100);
  const [custom, setCustom] = useState({ name: "", cats: "" });

  const load = useCallback(
    async (mapId?: string) => {
      try {
        setLoaded(await api<Loaded>(`/api/projects/${data.project.id}/gapmaps${mapId ? `?map=${mapId}` : ""}`));
      } catch (e) {
        setFail(errMsg(e));
      }
    },
    [data.project.id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const map = loaded?.map ?? null;
  const pending = loaded?.maps.find((m) => m.id === map?.id)?.pending ?? 0;
  const axes = AXES.filter((a) => a.id !== "custom" || map?.config.custom);
  const curAxis = axes.some((a) => a.id === axis) ? axis : "level";
  const axisLabel = curAxis === "custom" ? (map?.config.custom?.name ?? "직접 정의") : AXES.find((a) => a.id === curAxis)!.label;
  const matrix = useMemo(() => (map ? buildMatrix(map.items, map.config.subtopics, curAxis, map.config.custom) : null), [map, curAxis]);

  /** 대기열이 빌 때까지 한 묶음씩 분류한다 */
  const classify = async (mapId: string, total: number, done: number) => {
    setProgress({ done, total });
    setFail(null);
    try {
      for (;;) {
        const r = await api<{ done: number; total: number; finished: boolean }>(`/api/projects/${data.project.id}/gapmaps/${mapId}/classify`, { body: {} });
        setProgress({ done: r.done, total: r.total });
        if (r.finished) break;
      }
      toast("지도를 다 그렸습니다");
    } catch (e) {
      setFail(errMsg(e));
    } finally {
      setProgress(null);
      await load(mapId);
    }
  };

  const create = async () => {
    const cats = custom.cats
      .split(/[,，/\n]/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (custom.name.trim() && cats.length < 2) return toast("직접 정의 축은 범주를 두 개 이상 넣어 주세요 (쉼표로 구분)");
    const body: { top: number; custom: CustomAxis | null } = { top, custom: custom.name.trim() ? { name: custom.name.trim(), categories: cats } : null };
    try {
      setSetupOpen(false);
      const r = await api<{ id: string; total: number; done: number }>(`/api/projects/${data.project.id}/gapmaps`, { body });
      if (body.custom) setAxis("custom");
      await load(r.id);
      if (r.total > r.done) await classify(r.id, r.total, r.done);
    } catch (e) {
      setFail(errMsg(e));
    }
  };

  const patch = async (b: Record<string, unknown>, msg?: string) => {
    if (!map) return;
    try {
      await api(`/api/projects/${data.project.id}/gapmaps/${map.id}`, { method: "PATCH", body: b });
      if (msg) toast(msg);
      await load(map.id);
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const remove = async () => {
    if (!map || !confirm("이 저장본을 지울까요?")) return;
    try {
      await api(`/api/projects/${data.project.id}/gapmaps/${map.id}`, { method: "DELETE" });
      setCell(null);
      await load();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const onCell = (row: string, col: string) => {
    if (pinMode && map) {
      const prev = map.config.mine;
      const cols = prev?.row === row ? { ...prev.cols, [curAxis]: col } : { [curAxis]: col };
      setPinMode(false);
      patch({ mine: { row, cols } }, "내 연구 위치를 표시했습니다");
      return;
    }
    setCell(cell?.row === row && cell.col === col ? null : { row, col });
  };

  if (!loaded) return <p className="progress-line">{fail ?? <><span className="spin" /> 공백 지도를 불러오는 중…</>}</p>;
  if (!loaded.ready) return <SqlSetup what="연구 공백 지도" sql={GAPMAPS_SQL} />;
  if (!data.subtopics.length)
    return (
      <div className="empty-state">
        <h2>소주제가 있어야 지도를 그릴 수 있습니다</h2>
        <p>지도는 소주제(세로) × 대상·방법 등(가로)의 표입니다. 위의 “편집”에서 소주제를 먼저 만들어 주세요.</p>
      </div>
    );

  const mine = map?.config.mine;
  const mineCol = mine?.cols[curAxis];
  const src = map?.config.source;
  const selected = cell && map ? itemsIn(map.items, cell.row, cell.col, curAxis) : [];

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span className="lbl">가로 축</span>
          <span className="seg">
            {axes.map((a) => (
              <button key={a.id} type="button" aria-pressed={curAxis === a.id} onClick={() => setAxis(a.id)}>
                {a.id === "custom" ? (map?.config.custom?.name ?? a.label) : a.label}
              </button>
            ))}
          </span>
        </span>
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {loaded.maps.length > 0 && (
            <select className="field-in" style={{ padding: "5px 8px" }} value={map?.id ?? ""} onChange={(e) => load(e.target.value)} aria-label="저장한 지도">
              {loaded.maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.saved ? m.label || when(m.created_at) : `지금 지도 (${when(m.created_at)})`}
                  {m.pending ? ` · 분류 ${m.count}/${m.count + m.pending}` : ` · ${m.count}편`}
                </option>
              ))}
            </select>
          )}
          {canEdit && map && !map.saved && !progress && (
            <button className="btn sm" onClick={() => patch({ save: true }, "지도를 저장했습니다")}>
              지도 저장
            </button>
          )}
          {canEdit && map?.saved && (
            <button className="btn sm danger" onClick={remove}>
              저장본 지우기
            </button>
          )}
          {matrix && (
            <button className="btn sm" onClick={() => copyText(matrixTsv(matrix, axisLabel))}>
              표로 복사
            </button>
          )}
          {canEdit && (
            <button className="btn sm primary" onClick={() => setSetupOpen(!setupOpen)} disabled={!!progress} aria-expanded={setupOpen}>
              {map ? "새로 그리기" : "지도 그리기"}
            </button>
          )}
        </span>
      </div>

      {setupOpen && (
        <section className="share" style={{ marginTop: 8 }}>
          <h3>지도에 넣을 논문</h3>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            이 프로젝트에 보관한 논문 {data.rows.length}편과, 가장 최근 검색 결과 상위 논문을 AI가 읽고 소주제·학교급·연구 방법으로 나눕니다. 보관한 논문 중 이미 요약된 것은 AI를 쓰지 않습니다.
          </p>
          <div className="line">
            <span className="lbl">최근 검색 상위</span>
            <span className="seg">
              {[0, 50, 100, 200].map((n) => (
                <button key={n} type="button" aria-pressed={top === n} onClick={() => setTop(n)}>
                  {n ? `${n}편` : "넣지 않음"}
                </button>
              ))}
            </span>
          </div>
          <details style={{ marginTop: 10 }} open={!!custom.name}>
            <summary className="hint" style={{ cursor: "pointer" }}>
              + 가로 축 직접 정의 (선택)
            </summary>
            <div className="line" style={{ marginTop: 8 }}>
              <input className="field-in" style={{ width: 160 }} placeholder="축 이름 (예: 평가 영역)" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
              <input className="field-in" style={{ flex: 1, minWidth: 220 }} placeholder="범주를 쉼표로 (예: 읽기, 쓰기, 문법, 문학)" value={custom.cats} onChange={(e) => setCustom({ ...custom, cats: e.target.value })} />
            </div>
          </details>
          <div className="line" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={create}>
              AI로 분류해 지도 그리기
            </button>
            <span className="hint" style={{ margin: 0 }}>
              20편마다 AI를 한 번 부릅니다 (예: 100편이면 약 5번). 몇십 초 걸립니다.
            </span>
          </div>
        </section>
      )}

      {progress && (
        <p className="progress-line">
          <span className="spin" /> AI가 논문을 나누는 중… {progress.done}/{progress.total}편
        </p>
      )}
      {fail && (
        <p className="warnbox" style={{ marginTop: 10 }}>
          {fail}
          {map && pending > 0 && canEdit && (
            <>
              {" "}
              <button className="linkbtn" onClick={() => classify(map.id, map.items.length + pending, map.items.length)}>
                이어서 분류
              </button>
            </>
          )}
        </p>
      )}
      {!fail && !progress && map && pending > 0 && canEdit && (
        <p className="warnbox" style={{ marginTop: 10 }}>
          아직 {pending}편을 분류하지 않았습니다.{" "}
          <button className="linkbtn" onClick={() => classify(map.id, map.items.length + pending, map.items.length)}>
            이어서 분류
          </button>
        </p>
      )}

      {!map ? (
        <div className="empty-state">
          <h2>아직 그린 지도가 없습니다</h2>
          <p>{canEdit ? "“지도 그리기”를 누르면 보관한 논문과 최근 검색 결과로 소주제별 연구 공백을 찾아 줍니다." : "편집 권한이 있는 멤버가 지도를 그리면 여기에 보입니다."}</p>
        </div>
      ) : (
        matrix && (
          <div className="panel" style={{ marginTop: 12 }}>
            <p className="sub" style={{ marginTop: 0 }}>
              소주제 × {axisLabel}별 논문 수입니다. <b>빈칸</b>이 선행연구가 없는 곳, 곧 “연구의 필요성”을 쓸 자리입니다. 칸을 누르면 그 칸의 논문이 아래에 나옵니다.
              {src && (
                <span className="meta">
                  {" "}
                  · 대상: 보관 논문 {src.savedCount}편{src.top && src.query ? ` + “${src.query}” 검색 상위 ${src.top}편` : ""} (겹친 것 제외 {map.items.length}편)
                </span>
              )}
            </p>
            <div className="gapwrap">
              <div className="gap" style={{ gridTemplateColumns: `minmax(150px,1.3fr) repeat(${matrix.cols.length},minmax(70px,1fr))` }} role="table" aria-label={`연구 공백 지도: 소주제 × ${axisLabel}`}>
                <span role="columnheader" />
                {matrix.cols.map((c) => (
                  <span key={c} className="h" role="columnheader">
                    {c}
                  </span>
                ))}
                {matrix.rows.map((r) => (
                  <div key={r.name} role="row" style={{ display: "contents" }}>
                    <span className="rl" title={r.name} role="rowheader">
                      {r.name}
                    </span>
                    {r.counts.map((v, j) => {
                      const col = matrix.cols[j];
                      const t = v / matrix.max;
                      const isMine = mine?.row === r.name && mineCol === col;
                      const isSel = cell?.row === r.name && cell.col === col;
                      return (
                        <button
                          key={col}
                          role="cell"
                          className={`cell${v === 0 ? " zero" : ""}${isMine ? " mine" : ""}`}
                          style={
                            v === 0
                              ? isSel
                                ? { boxShadow: "0 0 0 2px var(--ink)" }
                                : undefined
                              : {
                                  background: `color-mix(in srgb,var(--accent) ${Math.round(12 + t * 78)}%,var(--surface))`,
                                  color: t > 0.5 ? "var(--accent-ink)" : "var(--ink)",
                                  boxShadow: isSel ? "0 0 0 2px var(--ink)" : undefined,
                                }
                          }
                          title={`${r.name} × ${col}: ${v}편${v === 0 ? " — 선행연구 없음" : ""}`}
                          aria-label={`${r.name} × ${col}: ${v}편${v === 0 ? ", 공백" : ""}${isMine ? ", 내 연구 위치" : ""}`}
                          onClick={() => onCell(r.name, col)}
                        >
                          {isMine && <span className="pin">내 연구</span>}
                          {v}
                          {v === 0 && <small>공백</small>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="insight">
              <span className="ramp">
                적음
                <span className="sw" style={{ background: "color-mix(in srgb,var(--accent) 12%,var(--surface))" }} />
                <span className="sw" style={{ background: "color-mix(in srgb,var(--accent) 50%,var(--surface))" }} />
                <span className="sw" style={{ background: "var(--accent)" }} />
                많음
              </span>
              {matrix.gaps.length > 0 && (
                <span style={{ color: "var(--warn)" }}>
                  ▲ 공백 {matrix.gaps.length}칸: {matrix.gaps.slice(0, 3).map((g) => `${g.row} × ${g.col}`).join(", ")}
                  {matrix.gaps.length > 3 ? " 외" : ""}
                </span>
              )}
              {mine && mineCol ? (
                <span style={{ color: "var(--info)" }}>
                  ● 내 연구 위치: {mine.row} × {mineCol}
                </span>
              ) : null}
              {canEdit && (
                <button className="linkbtn" onClick={() => setPinMode(!pinMode)}>
                  {pinMode ? "칸을 눌러 고르세요 (취소)" : mine && mineCol ? "내 연구 위치 바꾸기" : "내 연구 위치 찍기"}
                </button>
              )}
              {matrix.unplaced > 0 && <span className="meta">소주제·{axisLabel}에 맞지 않아 빠진 논문 {matrix.unplaced}편</span>}
            </div>
            <p className="hint">
              {curAxis === "period" || curAxis === "region" ? "논문 정보(출판 연도·언어)로 나눈 지도입니다." : "AI가 제목과 초록을 읽고 나눈 결과라 틀린 칸이 있을 수 있습니다. 칸을 눌러 확인해 보세요."}{" "}
              {map.saved ? `저장본 · ${map.label ?? when(map.created_at)}` : `${when(map.created_at)}에 그림`}
            </p>
          </div>
        )
      )}

      {cell && map && (
        <section className="core">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
            <h3>
              {cell.row} × {cell.col} · {selected.length}편
            </h3>
            <button className="btn sm" onClick={() => onSearch(`${cell.row} ${curAxis === "period" || curAxis === "region" ? "" : cell.col}`.trim())}>
              이 조합으로 더 찾기
            </button>
          </div>
          {selected.length === 0 ? (
            <p className="hint" style={{ margin: "6px 0 0" }}>
              이 칸에 해당하는 논문이 없습니다. 연구 공백일 수 있습니다. “이 조합으로 더 찾기”로 정말 없는지 확인해 보세요.
            </p>
          ) : (
            <div className="nd-list" style={{ marginTop: 8 }}>
              {selected.map((it) => (
                <div key={it.key}>
                  {it.url ? (
                    <a className="title-link" href={it.url} target="_blank" rel="noreferrer">
                      <span>{it.title}</span>
                    </a>
                  ) : (
                    it.title
                  )}{" "}
                  <span className="meta">
                    {it.year ?? "연도 미상"}
                    {it.saved ? " · 보관함" : ""}
                    {it.method ? ` · ${it.method}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
