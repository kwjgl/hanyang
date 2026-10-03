"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CitedRef, citedInBody, inTextCitation, insertCitation, paragraphAt, referenceList } from "@/lib/cite";
import { api, copyText, errMsg, toast } from "@/lib/client";
import type { CiteClaimOut, CiteRec } from "@/lib/server/cite";
import type { ProjectData } from "@/lib/server/load";
import { WRITING_SQL } from "@/lib/writing-sql";
import { firstAuthor, Tier } from "../bits";
import { SqlSetup } from "../SqlSetup";

interface Draft {
  id: string;
  title: string;
  body: string;
  citations: CitedRef[];
  updated_at: string;
}

const refOf = (r: CiteRec): CitedRef => {
  const c = r.candidate;
  return { key: c.doi ? `doi:${c.doi}` : c.key, inText: inTextCitation(c), title: c.title, authors: c.authors, year: c.year, venue: c.venue, doi: c.doi, url: c.url };
};

/** 글쓰기: 내가 쓴 글에서 근거가 필요한 문장을 찾아 어울리는 실제 문헌을 추천하고, 본문 인용과 참고문헌을 정리한다 */
export function WriteTab({ data }: { data: ProjectData }) {
  const router = useRouter();
  const canEdit = data.role !== "viewer";
  const [ready, setReady] = useState<boolean | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [cur, setCur] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [busy, setBusy] = useState(false);
  const [claims, setClaims] = useState<CiteClaimOut[] | null>(null);
  const [scope, setScope] = useState<string>("");
  const [scholar, setScholar] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const ta = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ ready: boolean; drafts: Draft[] }>(`/api/projects/${data.project.id}/drafts`);
      setReady(r.ready);
      setDrafts(r.drafts);
      setCur((c) => r.drafts.find((d) => d.id === c?.id) ?? r.drafts[0] ?? null);
    } catch (e) {
      toast(errMsg(e));
    }
  }, [data.project.id]);
  useEffect(() => {
    load();
  }, [load]);

  const pending = useRef<Draft | null>(null);
  // 다른 화면으로 가거나 창을 닫을 때 아직 저장 안 된 글을 마저 보낸다
  useEffect(() => {
    const flush = () => {
      const d = pending.current;
      if (!d) return;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      fetch(`/api/projects/${data.project.id}/drafts/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: d.title, body: d.body, citations: d.citations }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [data.project.id]);

  // 고치면 1.2초 뒤 저장
  const save = useCallback(
    (d: Draft) => {
      if (!canEdit) return;
      setSaveState("dirty");
      pending.current = d;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        pending.current = null;
        setSaveState("saving");
        try {
          await api(`/api/projects/${data.project.id}/drafts/${d.id}`, { method: "PATCH", body: { title: d.title, body: d.body, citations: d.citations } });
          setSaveState("saved");
          setDrafts((ds) => ds.map((x) => (x.id === d.id ? d : x)));
        } catch (e) {
          setSaveState("dirty");
          toast(errMsg(e));
        }
      }, 1200);
    },
    [canEdit, data.project.id],
  );
  const edit = (patch: Partial<Draft>) => {
    if (!cur) return;
    const d = { ...cur, ...patch };
    setCur(d);
    setDrafts((ds) => ds.map((x) => (x.id === d.id ? d : x)));
    save(d);
  };

  const create = async () => {
    try {
      const r = await api<{ draft: Draft }>(`/api/projects/${data.project.id}/drafts`, { body: {} });
      setDrafts((ds) => [r.draft, ...ds]);
      setCur(r.draft);
      setClaims(null);
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const remove = async () => {
    if (!cur || !confirm(`“${cur.title}”을(를) 지울까요?`)) return;
    try {
      await api(`/api/projects/${data.project.id}/drafts/${cur.id}`, { method: "DELETE" });
      const rest = drafts.filter((d) => d.id !== cur.id);
      setDrafts(rest);
      setCur(rest[0] ?? null);
      setClaims(null);
    } catch (e) {
      toast(errMsg(e));
    }
  };

  /** 선택한 부분 → 커서가 있는 문단 → 글 전체 순서로 범위를 정해 인용을 찾는다 */
  const findCitations = async () => {
    if (!cur) return;
    const el = ta.current;
    const sel = el && el.selectionEnd > el.selectionStart ? cur.body.slice(el.selectionStart, el.selectionEnd) : "";
    const para = el ? paragraphAt(cur.body, el.selectionStart) : "";
    const text = sel.trim().length >= 20 ? sel : para.length >= 20 ? para : cur.body;
    setScope(sel.trim().length >= 20 ? "선택한 부분" : para.length >= 20 && para.length < cur.body.trim().length ? "커서가 있는 문단" : "글 전체");
    setBusy(true);
    setClaims(null);
    try {
      const r = await api<{ claims: CiteClaimOut[] }>(`/api/projects/${data.project.id}/cite`, { body: { text, scholar } });
      setClaims(r.claims);
      if (!r.claims.length) toast("근거가 필요한 문장을 찾지 못했습니다");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const cite = (claim: CiteClaimOut, rec: CiteRec) => {
    if (!cur || !canEdit) return;
    const ref = refOf(rec);
    const body = insertCitation(cur.body, claim.sentence, ref.inText, ta.current?.selectionEnd);
    if (body === cur.body) return toast("이미 넣은 인용입니다");
    const citations = [...cur.citations.filter((c) => c.key !== ref.key), ref];
    edit({ body, citations });
    toast(`${ref.inText}을 넣었습니다`);
  };

  const keep = async (rec: CiteRec) => {
    const k = refOf(rec).key;
    try {
      const s = await api<{ paperId: string; noAbstract: boolean }>("/api/summarize", { body: { candidate: rec.candidate } });
      await api(`/api/projects/${data.project.id}/papers`, { body: { paperId: s.paperId } });
      setSavedKeys((x) => new Set(x).add(k));
      toast(s.noAbstract ? "보관했습니다 (초록이 없어 요약은 못 했습니다)" : "요약해서 이 프로젝트에 보관했습니다");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const refs = useMemo(() => (cur ? referenceList(citedInBody(cur.body, cur.citations)) : []), [cur]);

  if (ready === null) return <p className="progress-line"><span className="spin" /> 글을 불러오는 중…</p>;
  if (!ready) return <SqlSetup what="글과 상담 기록" sql={WRITING_SQL} />;

  return (
    <div className="write">
      <div className="write-main">
        <div className="toolbar" style={{ marginTop: 0 }}>
          {drafts.length > 0 && (
            <select className="field-in" style={{ padding: "5px 8px", maxWidth: 220 }} value={cur?.id ?? ""} onChange={(e) => (setCur(drafts.find((d) => d.id === e.target.value) ?? null), setClaims(null))} aria-label="글 고르기">
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          )}
          {canEdit && (
            <button className="btn sm" onClick={create}>
              + 새 글
            </button>
          )}
          {cur && canEdit && (
            <button className="btn sm danger" onClick={remove}>
              지우기
            </button>
          )}
          {cur && <span className="meta" style={{ marginLeft: "auto" }}>{saveState === "saved" ? "저장됨" : saveState === "saving" ? "저장 중…" : "고치는 중"}</span>}
        </div>
        {!cur ? (
          <div className="empty-state">
            <h2>아직 쓴 글이 없습니다</h2>
            <p>{canEdit ? "“+ 새 글”을 눌러 서론이나 이론적 배경을 써 보세요. 쓰다가 “인용 찾기”를 누르면 문장마다 어울리는 문헌을 추천합니다." : "편집 권한이 있는 멤버가 쓴 글이 여기에 보입니다."}</p>
          </div>
        ) : (
          <>
            <input className="write-title" value={cur.title} onChange={(e) => edit({ title: e.target.value })} readOnly={!canEdit} aria-label="글 제목" />
            <textarea
              ref={ta}
              className="write-body"
              value={cur.body}
              onChange={(e) => edit({ body: e.target.value })}
              readOnly={!canEdit}
              placeholder={"여기에 글을 씁니다. 문단은 빈 줄로 나눕니다.\n\n예) 디지털 텍스트를 읽을 때 독자는 종이 텍스트와 다른 전략을 사용한다. 화면 읽기는 종이 읽기보다 이해도가 낮다는 연구가 꾸준히 보고되었다."}
              aria-label="글 본문"
            />
            <section className="core" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
                <h3>참고문헌 {refs.length}편</h3>
                {refs.length > 0 && (
                  <button className="btn sm" onClick={() => copyText(refs.join("\n"))}>
                    복사 (APA)
                  </button>
                )}
              </div>
              {refs.length === 0 ? (
                <p className="hint" style={{ margin: "4px 0 0" }}>
                  추천 문헌의 “인용 넣기”를 누르면 본문에 (저자, 연도)가 들어가고 여기에 APA 참고문헌이 정리됩니다. 본문에서 인용을 지우면 여기서도 빠집니다.
                </p>
              ) : (
                <ol className="refs">
                  {refs.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>

      <aside className="write-side">
        <h3 style={{ margin: 0 }}>인용 추천</h3>
        <p className="hint" style={{ margin: "4px 0 10px" }}>
          글을 고르거나 커서를 문단에 두고 누르세요. 근거가 필요한 문장을 찾아, 보관함과 논문 데이터베이스에서 <b>실제로 있는 문헌만</b> 추천합니다.
        </p>
        <button className="btn primary" onClick={findCitations} disabled={!cur || busy || !cur.body.trim()} style={{ width: "100%" }}>
          {busy ? "문장 찾고 문헌 고르는 중… (20~40초)" : "인용 찾기"}
        </button>
        {data.scholarReady && (
          <label className="chk" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={scholar} onChange={(e) => setScholar(e.target.checked)} /> 구글 학술검색도 (문장마다 1회 사용)
          </label>
        )}
        {claims && claims.length > 0 && (
          <p className="meta" style={{ margin: "10px 0 0" }}>
            {scope}에서 근거가 필요한 문장 {claims.length}개
          </p>
        )}
        {claims?.map((cl, i) => (
          <div key={i} className="claim">
            <blockquote>{cl.sentence}</blockquote>
            <div className="meta" style={{ margin: "2px 0 6px" }}>
              {cl.claim}
              {cl.wantsClassic && <span className="imp imp-10" style={{ marginLeft: 6 }}>대표 문헌 필요</span>}
            </div>
            {cl.recs.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                어울리는 문헌을 찾지 못했습니다. 검색 탭에서 “{cl.queries[0]}”로 찾아보세요.
              </p>
            ) : (
              cl.recs.map((r) => {
                const c = r.candidate;
                const k = refOf(r).key;
                const inProject = !!r.paperId || savedKeys.has(k) || !!c.placements?.some((p) => p.projectId === data.project.id);
                return (
                  <div key={k} className="rec">
                    <div className="title" style={{ fontSize: 14 }}>
                      {c.url ? (
                        <a className="title-link" href={c.url} target="_blank" rel="noreferrer">
                          <span>{c.title}</span>
                        </a>
                      ) : (
                        c.title
                      )}
                    </div>
                    <div className="meta">
                      {firstAuthor(c.authors)} ({c.year ?? "연도 미상"}){c.venue ? ` · ${c.venue}` : ""}
                    </div>
                    <div className="badges" style={{ marginTop: 4 }}>
                      {inProject && <span className="inproj">보관함</span>}
                      {r.classic && <span className="imp imp-1">대표 문헌</span>}
                      <Tier impact={c.impact} year={c.year} />
                      {c.citations != null && <span className="b">피인용 {c.citations.toLocaleString()}</span>}
                      <span className={`b ${r.fit === "직접" ? "fit-direct" : ""}`}>{r.fit === "직접" ? "직접 근거" : "관련 근거"}</span>
                    </div>
                    <p className="why-line">{r.reason}</p>
                    {canEdit && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn sm primary" onClick={() => cite(cl, r)}>
                          인용 넣기 {inTextCitation(c)}
                        </button>
                        {!inProject && (
                          <button className="btn sm" onClick={() => keep(r)}>
                            요약해서 보관
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ))}
        <p className="hint" style={{ marginTop: 12 }}>
          추천 이유는 AI가 초록을 읽고 쓴 것입니다. 인용하기 전에 원문에서 그 내용을 꼭 확인하세요.
        </p>
      </aside>
    </div>
  );
}
