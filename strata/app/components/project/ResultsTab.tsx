"use client";
import { useEffect, useMemo, useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import { koreanSearchLinks } from "@/lib/korean-links";
import type { ProjectData } from "@/lib/server/load";
import { SOURCE_LABEL, type Candidate, type Scope, type SourceId } from "@/lib/types";
import { ImpactBadges } from "../bits";
import { AddByDoi } from "./AddByDoi";
import { Tray } from "./Tray";
import { ALL_SOURCES, type Hit, type SearchState, type Sort } from "./useSearch";

const PAGE = 30;

export function ResultsTab({ s, data }: { s: SearchState; data: ProjectData }) {
  const { project, role } = data;
  const canEdit = role !== "viewer";
  const [sort, setSort] = useState<Sort>("rel");
  const [onlyTop, setOnlyTop] = useState(false);
  const [onlyReview, setOnlyReview] = useState(false);
  const [hideSaved, setHideSaved] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [openAbs, setOpenAbs] = useState<Set<string>>(new Set());
  const [histOpen, setHistOpen] = useState(false);
  const [history, setHistory] = useState<{ id: string; query: string; total_unique: number; saved: boolean; created_at: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const base: Hit[] = s.related ? s.related.results : (s.result?.results ?? []);
  const list = useMemo(() => {
    let l = [...base];
    if (onlyTop) l = l.filter((c) => (c.impact?.pct ?? 0) >= 90);
    if (onlyReview) l = l.filter((c) => c.kind === "review");
    if (hideSaved) l = l.filter((c) => !c.placements?.some((p) => p.projectId === project.id));
    if (sort === "imp") l.sort((a, b) => (b.impact?.pct ?? -1) - (a.impact?.pct ?? -1));
    if (sort === "cite") l.sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1));
    if (sort === "new") l.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return l;
  }, [base, onlyTop, onlyReview, hideSaved, sort, project.id]);

  useEffect(() => setShown(PAGE), [s.result, s.related]);

  useEffect(() => {
    if (!histOpen) return;
    api<{ searches: typeof history }>(`/api/projects/${project.id}/searches`)
      .then((r) => setHistory(r.searches))
      .catch((e) => toast(errMsg(e)));
  }, [histOpen, project.id, s.result?.searchId]);

  const toggleSel = (key: string, on: boolean) => {
    const n = new Set(s.sel);
    if (on) n.add(key);
    else n.delete(key);
    s.setSel(n);
  };
  const selected = base.filter((c) => s.sel.has(c.key));
  const showKoreanLinks = s.scope === "ko" || /[가-힣]/.test(s.query);

  return (
    <>
      {s.expandError && s.result && !s.related && (
        <div className="warnbox" style={{ marginTop: 12 }}>
          검색어를 넓히지 못해 입력한 검색어로만 찾았습니다 ({s.expandError}){" "}
          {/[\uAC00-\uD7A3]/.test(s.query) && "한국어로만 찾으면 국내 자료만 걸립니다. "}
          아래 <b>+ 추가</b>로 영어 키워드(예: digital reading assessment)를 넣고 <b>이 검색어로 다시 찾기</b>를 누르거나, 설정에서 API 키를 등록하면 해외 논문까지 넓게 찾습니다.
        </div>
      )}
      {(s.chips.length > 0 || s.result) && (
        <div className="expand">
          <span className="lbl">{s.chips.length ? "확장 검색어" : "검색어 추가"}</span>
          {s.chips.map((c, i) => (
            <span key={c.text} className={`chip ${c.on ? "on" : ""}`}>
              <button
                type="button"
                style={{ color: "inherit", fontSize: 13 }}
                aria-pressed={c.on}
                onClick={() => s.setChips(s.chips.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
              >
                {c.text}
              </button>
              <button type="button" aria-label={`${c.text} 삭제`} onClick={() => s.setChips(s.chips.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
          <AddChip onAdd={(t) => s.setChips([...s.chips, { text: t, on: true }])} />
          <button className="btn sm" type="button" onClick={() => s.runSearch({ expand: false })} disabled={s.phase !== "idle"}>
            이 검색어로 다시 찾기
          </button>
        </div>
      )}

      <div className="filters">
        <span className="lbl">범위</span>
        <span className="seg">
          {(
            [
              ["all", "전체"],
              ["ko", "국내"],
              ["intl", "해외"],
            ] as [Scope, string][]
          ).map(([k, v]) => (
            <button key={k} type="button" aria-pressed={s.scope === k} onClick={() => s.setScope(k)}>
              {v}
            </button>
          ))}
        </span>
        <span className="lbl">출처</span>
        {ALL_SOURCES.map((src: SourceId) => (
          <label className="src" key={src}>
            <input
              type="checkbox"
              checked={s.sources.includes(src)}
              onChange={(e) => s.setSources(e.target.checked ? [...s.sources, src] : s.sources.filter((x) => x !== src))}
            />{" "}
            {src === "crossref" ? "Crossref (국내 학술지)" : SOURCE_LABEL[src]}
          </label>
        ))}
        <span className="lbl">정렬</span>
        <span className="seg">
          {(
            [
              ["rel", "관련도"],
              ["imp", "영향력"],
              ["cite", "피인용"],
              ["new", "최신"],
            ] as [Sort, string][]
          ).map(([k, v]) => (
            <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
              {v}
            </button>
          ))}
        </span>
        <label className="src">
          <input type="checkbox" checked={onlyTop} onChange={(e) => setOnlyTop(e.target.checked)} /> 상위 10%만
        </label>
        <label className="src">
          <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} /> 리뷰만
        </label>
        <label className="src">
          <input type="checkbox" checked={hideSaved} onChange={(e) => setHideSaved(e.target.checked)} /> 이미 보관한 논문 숨기기
        </label>
      </div>

      {showKoreanLinks && (
        <div className="links-bar">
          <span>국내 사이트에서 더 찾기:</span>
          {koreanSearchLinks(s.koreanQuery).map((l) => (
            <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label} ↗
            </a>
          ))}
          <span>· 찾은 논문은</span>
          <button className="linkbtn" onClick={() => setAddOpen(true)}>
            DOI·주소로 추가
          </button>
        </div>
      )}

      <div className="statrow">
        <p className="stat" style={{ margin: 0 }}>
          {s.phase === "expanding" ? (
            <span className="progress-line" style={{ margin: 0 }}>
              <span className="spin" /> 검색어를 넓히는 중…
            </span>
          ) : s.phase === "searching" ? (
            <span className="progress-line" style={{ margin: 0 }}>
              <span className="spin" /> 여러 출처에서 찾는 중…
            </span>
          ) : s.result && !s.related ? (
            <>
              {availableText(s.result.available)}
              관련도 높은 순으로 <b>{s.result.totalRaw.toLocaleString()}</b>건 가져옴 → 중복 제거 <b>{s.result.totalUnique.toLocaleString()}</b>건
              {list.length !== s.result.totalUnique && (
                <>
                  {" "}
                  · 필터 후 <b>{list.length}</b>건
                </>
              )}
            </>
          ) : (
            !s.related && "검색창에 주제를 넣고 찾기를 누르세요."
          )}
        </p>
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {s.result && !s.related && canEdit && (
            <button className={`btn ${s.result.saved ? "" : "primary"}`} onClick={s.toggleSaved}>
              {s.result.saved ? "✓ 저장한 검색" : "이 검색 저장"}
            </button>
          )}
          <button className="btn" onClick={() => setHistOpen(!histOpen)} aria-expanded={histOpen}>
            최근 검색 {histOpen ? "▴" : "▾"}
          </button>
          {canEdit && (
            <button className="btn" onClick={() => setAddOpen(!addOpen)} aria-expanded={addOpen}>
              DOI·직접 추가
            </button>
          )}
        </span>
      </div>

      {histOpen && (
        <section className="share" style={{ marginTop: 8 }}>
          <h3>이 프로젝트의 최근 검색</h3>
          {history.length === 0 && <p className="hint">아직 검색 기록이 없습니다.</p>}
          {history.map((h) => (
            <div key={h.id} className="mrow" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
              <span>
                <b>{h.query}</b>
                <br />
                <span className="meta">
                  {new Date(h.created_at).toLocaleDateString("ko-KR")} · 결과 {h.total_unique.toLocaleString()}건
                </span>
              </span>
              {h.saved ? <span className="inproj">저장함</span> : <span />}
              <button
                className="btn"
                onClick={() => {
                  s.openSearch(h.id);
                  setHistOpen(false);
                }}
              >
                다시 열기
              </button>
            </div>
          ))}
          <p className="hint">
            검색 기록은 30일 동안 남아서 다시 검색하지 않고 열어볼 수 있습니다. <b>이 검색 저장</b>을 누르면 기간 제한 없이 남습니다.
          </p>
        </section>
      )}

      {addOpen && canEdit && (
        <AddByDoi
          onCandidate={(c) => {
            s.summarize([c], null);
            setAddOpen(false);
          }}
        />
      )}

      {s.related && (
        <div className="related-head">
          <button className="btn sm" onClick={() => s.setRelated(null)}>
            ← 검색 결과로
          </button>
          <b>{s.related.title}</b>
          <span className="meta">{s.related.results.length ? `${s.related.results.length}건` : "불러오는 중…"}</span>
        </div>
      )}

      <div className="grid">
        <div className="list">
          {list.slice(0, shown).map((c) => (
            <ResultRow
              key={c.key}
              c={c}
              projectId={project.id}
              canEdit={canEdit}
              selected={s.sel.has(c.key)}
              onSel={(on) => toggleSel(c.key, on)}
              absOpen={openAbs.has(c.key)}
              onAbs={() => {
                const n = new Set(openAbs);
                if (n.has(c.key)) n.delete(c.key);
                else n.add(c.key);
                setOpenAbs(n);
              }}
              onRelated={(kind) => s.loadRelated(kind, c)}
            />
          ))}
          {list.length > shown && (
            <button className="btn" style={{ margin: "14px auto" }} onClick={() => setShown(shown + PAGE)}>
              {Math.min(PAGE, list.length - shown)}건 더 보기
            </button>
          )}
          {!s.related && s.result && shown >= list.length && s.result.hasMore !== false && (
            <div style={{ textAlign: "center", margin: "16px 0" }}>
              <button className="btn" onClick={s.loadMore} disabled={s.phase !== "idle"}>
                {s.phase === "more" ? "가져오는 중…" : "다음 페이지 더 가져오기"}
              </button>
              <p className="hint">출처마다 관련도 다음 순위 논문을 더 가져와 아래에 붙입니다.</p>
            </div>
          )}
          {(s.result || s.related) && list.length === 0 && s.phase === "idle" && <p className="empty">조건에 맞는 결과가 없습니다. 필터를 풀어 보세요.</p>}
        </div>
        <Tray s={s} data={data} />
      </div>

      <div className="selbar" hidden={!canEdit || selected.length === 0}>
        <span>
          <b>{selected.length}</b>편 선택
        </span>
        <button className="btn ghost" onClick={() => s.setSel(new Set())}>
          선택 해제
        </button>
        <button className="btn primary" onClick={() => s.summarize(selected, null)}>
          초록 요약하기
        </button>
      </div>
    </>
  );
}

/** "검색어에 맞는 논문: OpenAlex 약 52,341건 · ERIC 3,120건 중" */
function availableText(a?: Partial<Record<SourceId, number>>) {
  const parts = Object.entries(a ?? {})
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
    .map(([k, n]) => `${SOURCE_LABEL[k as SourceId]} ${(n ?? 0).toLocaleString()}건`);
  return parts.length ? <>검색어에 맞는 논문: {parts.join(" · ")} 중 </> : null;
}

function AddChip({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="chip" type="button" onClick={() => setOpen(true)}>
        + 추가
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onAdd(v.trim());
        setV("");
        setOpen(false);
      }}
      style={{ display: "inline-flex", gap: 4 }}
    >
      <input className="field-in" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="검색어" style={{ padding: "3px 8px", fontSize: 13 }} />
      <button className="btn sm" type="submit">
        추가
      </button>
    </form>
  );
}

function ResultRow(props: {
  c: Hit;
  projectId: string;
  canEdit: boolean;
  selected: boolean;
  onSel: (on: boolean) => void;
  absOpen: boolean;
  onAbs: () => void;
  onRelated: (kind: "citedBy" | "references" | "similar") => void;
}) {
  const { c, projectId } = props;
  const here = c.placements?.find((p) => p.projectId === projectId);
  const others = (c.placements ?? []).filter((p) => p.projectId !== projectId);
  const id = `ck-${c.key.replace(/[^a-zA-Z0-9]/g, "_")}`;
  return (
    <div className={`row ${props.selected ? "sel" : ""}`}>
      {props.canEdit ? (
        <input type="checkbox" id={id} checked={props.selected} disabled={!!here} onChange={(e) => props.onSel(e.target.checked)} aria-label="선택" />
      ) : (
        <span />
      )}
      <div style={{ minWidth: 0 }}>
        <h3 className="title">
          <a className="title-link" href={c.url ?? undefined} target="_blank" rel="noopener noreferrer">
            <span>{c.title}</span>
          </a>
        </h3>
        <div className="meta">
          {c.authors.slice(0, 4).join(", ")}
          {c.authors.length > 4 ? " 외" : ""}
          {c.venue && (
            <>
              {" "}
              · <i>{c.venue}</i>
            </>
          )}{" "}
          · {c.year ?? "연도 미상"} {/[가-힣]/.test(c.title) && <span className="lang">국문</span>}
        </div>
        <div className="badges">
          <ImpactBadges c={c} />
        </div>
        <div className="badges">
          {c.oaUrl && (
            <a className="b oa" href={c.oaUrl} target="_blank" rel="noopener noreferrer">
              무료 원문 ↗
            </a>
          )}
          <span className="b">{c.sources.map((x) => SOURCE_LABEL[x] ?? x).join(" · ")}</span>
          {c.eduLevel?.length ? <span className="b">{c.eduLevel.slice(0, 2).join(", ")}</span> : null}
          {here && <span className="b saved">이 프로젝트에 있음</span>}
          {others.map((o) => (
            <span key={o.projectId} className="inproj">
              {o.projectName}에 있음
            </span>
          ))}
          <button className="linkbtn" type="button" onClick={() => props.onRelated("citedBy")}>
            인용한 논문
          </button>
          <button className="linkbtn" type="button" onClick={() => props.onRelated("references")}>
            참고문헌
          </button>
          {c.doi && (
            <button className="linkbtn" type="button" onClick={() => props.onRelated("similar")}>
              비슷한 논문
            </button>
          )}
        </div>
        {c.abstract ? (
          <p className="ab" style={props.absOpen ? undefined : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {c.abstract}{" "}
          </p>
        ) : (
          <p className="ab">초록 없음 · 요약할 때 다른 출처에서 다시 찾아봅니다</p>
        )}
        {c.abstract && c.abstract.length > 200 && (
          <button className="linkbtn" onClick={props.onAbs}>
            {props.absOpen ? "접기" : "초록 펼치기"}
          </button>
        )}
      </div>
    </div>
  );
}

export type { Candidate };
