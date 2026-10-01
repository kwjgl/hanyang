"use client";
import { useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import { titleKey } from "@/lib/text";
import type { Hit } from "./useSearch";

/** 국내 사이트 등에서 찾은 논문을 DOI·주소로 가져오거나, DOI 없는 자료(학위논문·보고서)를 직접 입력한다 */
export function AddByDoi({ onCandidate }: { onCandidate: (c: Hit) => void }) {
  const [mode, setMode] = useState<"doi" | "manual">("doi");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState({ title: "", authors: "", year: "", venue: "", url: "", abstract: "", kind: "article" });

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ candidate: Hit }>("/api/lookup", { body: { input } });
      onCandidate(r.candidate);
      toast("논문 정보를 가져와 요약을 시작했습니다");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const manual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!m.title.trim()) return toast("제목을 입력해 주세요");
    const year = Number(m.year) || null;
    onCandidate({
      key: `t:${titleKey(m.title)}:${year ?? ""}`,
      doi: null,
      title: m.title.trim(),
      authors: m.authors.split(/[,;·]/).map((a) => a.trim()).filter(Boolean),
      year,
      venue: m.venue.trim() || null,
      abstract: m.abstract.trim() || null,
      abstractSource: m.abstract.trim() ? "manual" : null,
      citations: null,
      url: m.url.trim() || null,
      oaUrl: null,
      lang: /[가-힣]/.test(m.title) ? "ko" : null,
      kind: m.kind,
      ids: {},
      sources: [],
      impact: {},
    });
  };

  return (
    <section className="share" style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>논문 직접 추가</h3>
        <span className="seg">
          <button type="button" aria-pressed={mode === "doi"} onClick={() => setMode("doi")}>
            DOI·주소로
          </button>
          <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>
            직접 입력
          </button>
        </span>
      </div>
      {mode === "doi" ? (
        <form className="line" onSubmit={lookup}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="예: 10.1016/j.ijer.2012.12.002 또는 DOI가 들어 있는 주소" aria-label="DOI 또는 주소" />
          <button className="btn primary" disabled={busy || !input.trim()}>
            {busy ? "가져오는 중…" : "가져와서 요약"}
          </button>
        </form>
      ) : (
        <form className="form" onSubmit={manual} style={{ maxWidth: "none" }}>
          <label>
            제목
            <input className="field-in" value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 90px minmax(0,2fr) 140px", gap: 10 }}>
            <label>
              저자 (쉼표로 구분)
              <input className="field-in" value={m.authors} onChange={(e) => setM({ ...m, authors: e.target.value })} />
            </label>
            <label>
              연도
              <input className="field-in" inputMode="numeric" value={m.year} onChange={(e) => setM({ ...m, year: e.target.value })} />
            </label>
            <label>
              학술지·학위 수여 기관
              <input className="field-in" value={m.venue} onChange={(e) => setM({ ...m, venue: e.target.value })} />
            </label>
            <label>
              종류
              <select className="field-in" value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value })}>
                <option value="article">학술지 논문</option>
                <option value="dissertation">학위논문</option>
                <option value="report">보고서</option>
                <option value="book-chapter">책·책의 장</option>
              </select>
            </label>
          </div>
          <label>
            주소 (선택)
            <input className="field-in" value={m.url} onChange={(e) => setM({ ...m, url: e.target.value })} />
          </label>
          <label>
            초록 <span className="hint">붙여넣으면 요약합니다. 비워 두면 서지 정보만 보관합니다.</span>
            <textarea className="field-in" value={m.abstract} onChange={(e) => setM({ ...m, abstract: e.target.value })} />
          </label>
          <div>
            <button className="btn primary">추가해서 요약</button>
          </div>
        </form>
      )}
    </section>
  );
}
