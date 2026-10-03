"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isClassic } from "@/lib/cite";
import { api, errMsg, scholarUsed, toast } from "@/lib/client";
import { type Consult, type ConsultMsg, type ConsultTheory, type ConsultWork, MAX_MESSAGES, refKey, scholarLink, verifiedWorks } from "@/lib/consult";
import type { ProjectData } from "@/lib/server/load";
import { firstAuthor, Tier } from "../bits";

type Meta = Pick<Consult, "id" | "title" | "updated_at">;

const STARTERS = [
  "제 연구 질문에 어울리는 이론적 배경을 추천해 주세요.",
  "이 주제에서 꼭 인용해야 할 대표 문헌(고전)은 무엇인가요?",
  "연구 질문을 더 좁히거나 분명하게 하려면 어떻게 하면 좋을까요?",
  "헷갈리기 쉬운 핵심 개념들을 어떻게 구분해서 정의하면 좋을까요?",
];

/** 주제 상담: 연구 주제를 두고 AI와 이야기하며 이론적 배경과 대표 문헌을 추천받는다. 문헌은 데이터베이스에서 확인된 것만 쓸 수 있다 */
export function ConsultPanel({ data, onSearch, onDraft }: { data: ProjectData; onSearch: (q: string) => void; onDraft: (draftId: string) => void }) {
  const router = useRouter();
  const canEdit = data.role !== "viewer";
  const base = `/api/projects/${data.project.id}/consults`;
  const [list, setList] = useState<Meta[] | null>(null);
  const [cur, setCur] = useState<Consult | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "outline">("");
  const [pendingText, setPendingText] = useState("");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [scholar, setScholar] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const open = useCallback(
    async (id: string) => {
      try {
        const r = await api<{ consult: Consult }>(`${base}/${id}`);
        setCur(r.consult);
      } catch (e) {
        toast(errMsg(e));
      }
    },
    [base],
  );

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ consults: Meta[] }>(base);
        setList(r.consults);
        if (r.consults[0]) open(r.consults[0].id);
      } catch (e) {
        toast(errMsg(e));
        setList([]);
      }
    })();
  }, [base, open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [cur?.messages.length, busy]);

  const send = async (text = input) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy("send");
    setPendingText(t);
    setInput("");
    try {
      const r = await api<{ consult: Consult }>(cur ? `${base}/${cur.id}` : base, { body: { text: t, scholar: data.scholarReady && scholar } });
      setCur(r.consult);
      if (data.scholarReady && scholar) scholarUsed();
      setList((l) => [{ id: r.consult.id, title: r.consult.title, updated_at: r.consult.updated_at }, ...(l ?? []).filter((x) => x.id !== r.consult.id)]);
    } catch (e) {
      setInput(t);
      toast(errMsg(e));
    } finally {
      setBusy("");
      setPendingText("");
    }
  };

  const fresh = () => {
    setCur(null);
    setInput("");
    inputRef.current?.focus();
  };

  const remove = async () => {
    if (!cur || !confirm(`“${cur.title}” 상담을 지울까요?`)) return;
    try {
      await api(`${base}/${cur.id}`, { method: "DELETE" });
      const rest = (list ?? []).filter((x) => x.id !== cur.id);
      setList(rest);
      setCur(null);
      if (rest[0]) open(rest[0].id);
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const outline = async () => {
    if (!cur) return;
    setBusy("outline");
    try {
      const r = await api<{ draft: { id: string } }>(`${base}/${cur.id}/outline`, { body: {} });
      toast("개요를 새 글로 만들었습니다");
      onDraft(r.draft.id);
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy("");
    }
  };

  const keep = async (w: ConsultWork) => {
    if (!w.candidate) return;
    const k = refKey(w.candidate);
    try {
      const s = await api<{ paperId: string; noAbstract: boolean }>("/api/summarize", { body: { candidate: w.candidate } });
      await api(`/api/projects/${data.project.id}/papers`, { body: { paperId: s.paperId } });
      setSavedKeys((x) => new Set(x).add(k));
      toast(s.noAbstract ? "보관했습니다 (초록이 없어 요약은 못 했습니다)" : "요약해서 이 프로젝트에 보관했습니다");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const verified = cur ? verifiedWorks(cur.messages).length : 0;
  const full = !!cur && cur.messages.length >= MAX_MESSAGES;

  if (list === null) return <p className="progress-line"><span className="spin" /> 상담 기록을 불러오는 중…</p>;

  return (
    <div className="consult">
      <div className="toolbar" style={{ marginTop: 0 }}>
        {list.length > 0 && (
          <select className="field-in" style={{ padding: "5px 8px", maxWidth: 260 }} value={cur?.id ?? ""} onChange={(e) => (e.target.value ? open(e.target.value) : fresh())} aria-label="상담 고르기">
            {!cur && <option value="">새 상담</option>}
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
        {canEdit && cur && (
          <button className="btn sm" onClick={fresh}>
            + 새 상담
          </button>
        )}
        {canEdit && cur && (
          <button className="btn sm danger" onClick={remove}>
            지우기
          </button>
        )}
        {canEdit && cur && (
          <button className="btn sm primary" style={{ marginLeft: "auto" }} onClick={outline} disabled={!verified || !!busy} title={verified ? "확인된 문헌으로 이론적 배경 개요를 만들어 새 글로 엽니다" : "확인된 문헌이 생기면 쓸 수 있습니다"}>
            {busy === "outline" ? "개요 만드는 중…" : `이론적 배경 개요 → 새 글${verified ? ` (문헌 ${verified}편)` : ""}`}
          </button>
        )}
      </div>

      <div className="chat">
        {!cur && !busy && (
          <div className="empty-state" style={{ textAlign: "left" }}>
            <h2>쓰려는 주제를 이야기해 주세요</h2>
            <p>
              연구 질문{data.project.research_question ? `(“${data.project.research_question}”)` : ""}과 보관한 논문을 알고 있는 상담자가 이론적 배경, 핵심 개념, 대표 문헌을 함께 고민합니다. 권하는 문헌은 논문 데이터베이스에서 <b>실제로 있는지 확인</b>해 표시합니다.
            </p>
            {canEdit && (
              <div className="q-chips">
                {STARTERS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {cur?.messages.map((m, i) => (
          <Message key={i} m={m} last={i === cur.messages.length - 1} canEdit={canEdit} projectId={data.project.id} savedKeys={savedKeys} onKeep={keep} onSearch={onSearch} onAsk={(q) => (setInput(q), inputRef.current?.focus())} />
        ))}
        {busy === "send" && (
          <>
            <div className="msg user">{pendingText}</div>
            <p className="progress-line">
              <span className="spin" /> 생각하고, 권할 문헌이 실제로 있는지 확인하는 중… (20~40초)
            </p>
          </>
        )}
        <div ref={endRef} />
      </div>

      {canEdit &&
        (full ? (
          <p className="hint">이 상담이 길어졌습니다. “+ 새 상담”으로 이어 가 주세요. 지난 상담은 그대로 남습니다.</p>
        ) : (
          <div className="chat-input">
            <textarea
              ref={inputRef}
              className="field-in"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={cur ? "이어서 묻거나 생각을 말해 주세요 (Ctrl+Enter로 보내기)" : "예) 디지털 읽기에서 학생들이 정보를 평가하는 과정을 연구하려고 해요. 어떤 이론으로 설명하면 좋을까요?"}
              aria-label="상담 내용"
              disabled={!!busy}
            />
            <div className="chat-send">
              <button className="btn primary" onClick={() => send()} disabled={!input.trim() || !!busy}>
                보내기
              </button>
              {data.scholarReady && (
                <label className="chk" title="데이터베이스에서 못 찾은 문헌(특히 국내 문헌·책)을 구글 학술검색에서 한 번 더 찾습니다. 한 번 답할 때 최대 3회 사용">
                  <input type="checkbox" checked={scholar} onChange={(e) => setScholar(e.target.checked)} /> 구글로도 확인
                </label>
              )}
            </div>
          </div>
        ))}
      <p className="hint" style={{ marginTop: 8 }}>
        상담 내용과 추천 이유는 AI가 쓴 것입니다. “확인됨” 문헌도 인용하기 전에 원문을 꼭 확인하세요. “확인 안 됨”은 데이터베이스에서 찾지 못한 것이라 인용 목록에 넣을 수 없습니다.
      </p>
    </div>
  );
}

function Message({
  m,
  last,
  canEdit,
  projectId,
  savedKeys,
  onKeep,
  onSearch,
  onAsk,
}: {
  m: ConsultMsg;
  last: boolean;
  canEdit: boolean;
  projectId: string;
  savedKeys: Set<string>;
  onKeep: (w: ConsultWork) => void;
  onSearch: (q: string) => void;
  onAsk: (q: string) => void;
}) {
  if (m.role === "user") return <div className="msg user">{m.text}</div>;
  return (
    <div className="msg ai">
      <div className="msg-text">{m.text}</div>
      {m.theories?.map((t, i) => <Theory key={i} t={t} canEdit={canEdit} projectId={projectId} savedKeys={savedKeys} onKeep={onKeep} onSearch={onSearch} />)}
      {last && canEdit && !!m.questions?.length && (
        <div className="q-chips" style={{ marginTop: 10 }}>
          <span className="meta">더 생각해 볼 질문:</span>
          {m.questions.map((q) => (
            <button key={q} className="chip" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Theory({
  t,
  canEdit,
  projectId,
  savedKeys,
  onKeep,
  onSearch,
}: {
  t: ConsultTheory;
  canEdit: boolean;
  projectId: string;
  savedKeys: Set<string>;
  onKeep: (w: ConsultWork) => void;
  onSearch: (q: string) => void;
}) {
  const q = t.query_en || t.query_ko;
  return (
    <section className="theory">
      <h4>{t.name}</h4>
      <p>{t.summary}</p>
      {t.fit && (
        <p className="theory-fit">
          <b>내 연구에는</b> {t.fit}
        </p>
      )}
      {t.works.map((w, i) => {
        const c = w.candidate;
        if (w.status !== "verified" || !c)
          return (
            <div key={i} className="work unverified">
              <div className="badges">
                <span className="b">확인 안 됨</span>
              </div>
              <div className="meta">
                {w.author} ({w.year ?? "연도 미상"}). {w.title}
              </div>
              <div className="meta">
                {w.scholar ? "데이터베이스와 구글 학술검색에서 찾지 못했습니다. 제목이 다르게 기억됐거나 없는 문헌일 수 있습니다." : "데이터베이스에서 찾지 못했습니다(책·국내 문헌이면 흔합니다)."}{" "}
                <a href={scholarLink(w)} target="_blank" rel="noreferrer">
                  구글 학술검색에서 직접 확인 ↗
                </a>
              </div>
            </div>
          );
        const inProject = !!w.paperId || savedKeys.has(refKey(c)) || !!c.placements?.some((p) => p.projectId === projectId);
        return (
          <div key={i} className="work">
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
              <span className="b fit-direct">확인됨</span>
              {inProject && <span className="inproj">보관함</span>}
              {isClassic(c) && <span className="imp imp-1">대표 문헌</span>}
              <Tier impact={c.impact} year={c.year} />
              {c.citations != null && <span className="b">피인용 {c.citations.toLocaleString()}</span>}
              {canEdit && !inProject && (
                <button className="btn sm" style={{ marginLeft: 4 }} onClick={() => onKeep(w)}>
                  요약해서 보관
                </button>
              )}
            </div>
          </div>
        );
      })}
      {q && (
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => onSearch(q)}>
          이 이론으로 관련 연구 검색 →
        </button>
      )}
    </section>
  );
}
