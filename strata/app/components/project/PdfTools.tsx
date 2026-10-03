"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { inTextCitation } from "@/lib/cite";
import { api, copyText, errMsg, toast } from "@/lib/client";
import { type Cited, type PaperDetails, pagesLabel } from "@/lib/details";
import { FULLTEXT_SQL } from "@/lib/fulltext-sql";
import type { ProjectData, TableRow } from "@/lib/server/load";
import { SqlSetup } from "../SqlSetup";

type Added = { paperId: string; title: string; year: number | null; authors: string[]; how: "attached" | "doi" | "database" | "pdf"; added: boolean };

type Job = { name: string; state: "read" | "find" | "analyze" | "done" | "error"; note: string };

const HOW: Record<Added["how"], string> = {
  attached: "이 논문에 붙였습니다",
  doi: "DOI로 찾아 보관",
  database: "제목으로 데이터베이스에서 찾아 보관",
  pdf: "PDF에서 읽은 정보로 보관",
};

/**
 * PDF 여러 개 넣기: 브라우저에서 글자를 뽑아(파일은 보내지 않는다) 논문을 찾아 보관하고, 원하면 바로 분석한다.
 * paperId를 주면 그 논문 한 편에 붙인다.
 */
export function PdfUploader({ data, paperId, compact, onDone }: { data: ProjectData; paperId?: string; compact?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [analyze, setAnalyze] = useState(true);
  const [needSql, setNeedSql] = useState(!data.fulltextReady);
  const [over, setOver] = useState(false);
  const running = useRef(false);

  const run = async (files: File[]) => {
    if (running.current) return toast("앞의 PDF를 처리하는 중입니다");
    const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!pdfs.length) return toast("PDF 파일만 넣을 수 있습니다");
    if (paperId && pdfs.length > 1) return toast("이 논문에는 PDF 한 개만 넣을 수 있습니다");
    running.current = true;
    setBusy(true);
    const list: Job[] = pdfs.map((f) => ({ name: f.name, state: "read", note: "글자 읽는 중…" }));
    setJobs(list);
    const set = (i: number, j: Partial<Job>) => setJobs((js) => js.map((x, k) => (k === i ? { ...x, ...j } : x)));
    const { extractPdf } = await import("@/lib/pdf-extract");
    let ok = 0;
    let saved = 0;
    for (let i = 0; i < pdfs.length; i++) {
      let stage = "PDF 읽기";
      try {
        const pdf = await extractPdf(pdfs[i], (d, t) => set(i, { note: `글자 읽는 중… ${d}/${t}쪽` }));
        if (pdf.scanned) throw new Error("스캔한 이미지 PDF라 글자를 읽을 수 없습니다");
        stage = paperId ? "저장" : "논문 찾기·보관";
        set(i, { state: "find", note: paperId ? "저장하는 중…" : "어떤 논문인지 찾는 중…" });
        const r = await api<Added>(`/api/projects/${data.project.id}/pdf`, { body: { pages: pdf.pages, pageOffset: pdf.pageOffset, fileName: pdf.fileName, paperId } });
        saved++;
        const who = `${r.authors[0] ?? "저자 미상"}${r.authors.length > 1 ? " 외" : ""} (${r.year ?? "연도 미상"})`;
        const placed = paperId ? HOW.attached : r.added ? HOW[r.how] : "이미 보관한 논문에 붙였습니다";
        const pageNote = pdf.pageOffset != null ? `학술지 쪽 번호 ${pdf.pageOffset + 1}–${pdf.pageOffset + pdf.pages.length}` : `${pdf.pages.length}쪽 (학술지 쪽 번호를 못 찾아 PDF 쪽 번호로 표시)`;
        if (analyze) {
          stage = "분석 (PDF는 저장됨 — 행을 펼쳐 “분석하기”로 다시 할 수 있음)";
          set(i, { state: "analyze", note: `${r.title} — ${who}. 분석하는 중… (20~40초)` });
          await api(`/api/papers/${r.paperId}/analyze`, { body: {} });
        }
        set(i, { state: "done", note: `${r.title} — ${who} · ${placed} · ${pageNote}${analyze ? " · 분석 완료" : ""}` });
        ok++;
      } catch (e) {
        const m = errMsg(e);
        if (/SQL/.test(m)) setNeedSql(true);
        set(i, { state: "error", note: `${stage} 단계: ${m}` });
      }
    }
    running.current = false;
    setBusy(false);
    if (saved) router.refresh();
    if (ok) {
      onDone?.();
    }
  };

  if (needSql) return <SqlSetup what="PDF 본문과 분석 결과" sql={FULLTEXT_SQL} />;

  return (
    <div
      className={`pdfdrop ${over ? "over" : ""} ${compact ? "compact" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) run([...e.dataTransfer.files]);
      }}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple={!paperId} hidden onChange={(e) => (run([...(e.target.files ?? [])]), (e.target.value = ""))} />
      <div className="pdfdrop-row">
        <button className="btn primary sm" disabled={busy} onClick={() => input.current?.click()}>
          {paperId ? "PDF 고르기" : "PDF 고르기 (여러 개 가능)"}
        </button>
        {!compact && <span className="meta">또는 여기에 끌어다 놓기</span>}
        <label className="chk">
          <input type="checkbox" checked={analyze} disabled={busy} onChange={(e) => setAnalyze(e.target.checked)} /> 넣고 바로 분석 (1편당 약 15~50원)
        </label>
      </div>
      {!compact && (
        <p className="hint" style={{ margin: "6px 0 0" }}>
          RISS·KCI·DBpia에서 받은 PDF를 넣으면 제목·저자를 읽어 이 프로젝트에 보관하고, 본문으로 선행연구 분석표를 채웁니다. 파일은 올리지 않고 글자만 저장하며, 이 프로젝트 멤버만 볼 수 있습니다. 스캔한 이미지 PDF는 읽을 수 없습니다.
        </p>
      )}
      {jobs.length > 0 && (
        <ul className="pdfjobs">
          {jobs.map((j, i) => (
            <li key={i} className={`job-${j.state}`}>
              <span className="job-ic">{j.state === "done" ? "✓" : j.state === "error" ? "!" : <span className="spin" />}</span>
              <span>
                <b>{j.name}</b> <span className="meta">{j.note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** PDF가 있는 논문의 분석 버튼 */
export function AnalyzeButton({ paperId, again, label }: { paperId: string; again?: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn sm ${again ? "" : "primary"}`}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await api(`/api/papers/${paperId}/analyze`, { body: {} });
          toast("분석했습니다");
          router.refresh();
        } catch (err) {
          toast(errMsg(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "분석 중… (20~40초)" : (label ?? (again ? "다시 분석" : "분석하기"))}
    </button>
  );
}

/** 근거 쪽 표시 */
export function Pg({ pages, mode }: { pages: number[]; mode: PaperDetails["pageMode"] }) {
  const t = pagesLabel(pages, mode);
  return t ? <span className="pg">{t}</span> : null;
}

const Item = ({ c, mode, extra }: { c: Cited; mode: PaperDetails["pageMode"]; extra?: string }) => (
  <>
    {c.text}
    {extra ? <span className="stat"> {extra}</span> : null} <Pg pages={c.pages} mode={mode} />
  </>
);

/** 상세 보기 표의 칸들 (대상 / 설계·분석 / 도구 / 변인 / 결과 / 한계·제언) */
export function DetailCells({ d }: { d: PaperDetails }) {
  const m = d.pageMode;
  const v = d.variables;
  return (
    <>
      <td>
        <div className="clamp">
          <Item c={d.participants} mode={m} />
        </div>
      </td>
      <td>
        <div className="clamp">
          {d.design.type && <span className="b">{d.design.type}</span>} <Item c={d.design} mode={m} />
          {d.analysis.text && (
            <>
              {" "}
              · 분석: <Item c={d.analysis} mode={m} />
            </>
          )}
        </div>
      </td>
      <td>
        <div className="clamp">
          {d.instruments.length
            ? d.instruments.map((x, i) => (
                <div key={i}>
                  {x.name}
                  {x.reliability && <span className="stat"> ({x.reliability})</span>} <Pg pages={x.pages} mode={m} />
                </div>
              ))
            : <span className="meta">—</span>}
        </div>
      </td>
      <td>
        <div className="clamp">
          {v.independent.length > 0 && <div>독립: {v.independent.join(", ")}</div>}
          {v.dependent.length > 0 && <div>종속: {v.dependent.join(", ")}</div>}
          {v.other.length > 0 && <div>기타: {v.other.join(", ")}</div>}
          {!v.independent.length && !v.dependent.length && !v.other.length && <span className="meta">—</span>}
        </div>
      </td>
      <td>
        <div className="clamp">
          {d.findings.map((f, i) => (
            <div key={i}>
              <Item c={f} mode={m} extra={f.stats ? `(${f.stats})` : ""} />
            </div>
          ))}
        </div>
      </td>
      <td>
        <div className="clamp">
          {d.limitations.map((x, i) => (
            <div key={`l${i}`}>
              한계: <Item c={x} mode={m} />
            </div>
          ))}
          {d.future.map((x, i) => (
            <div key={`f${i}`}>
              제언: <Item c={x} mode={m} />
            </div>
          ))}
          {!d.limitations.length && !d.future.length && <span className="meta">논문에 없음</span>}
        </div>
      </td>
    </>
  );
}

/** 행을 펼쳤을 때 보이는 분석 전체 */
export function DetailFull({ r }: { r: TableRow }) {
  const d = r.pdf?.details;
  if (!d) return null;
  const m = d.pageMode;
  const cite = (pages: number[]) => {
    const base = inTextCitation(r.paper);
    return m === "print" && pages.length ? `${base.slice(0, -1)}, ${pagesLabel(pages)})` : base;
  };
  return (
    <div className="pdf-full">
      <h4>
        상세 분석 <span className="meta">({m === "print" ? `pp. ${d.range.from}–${d.range.to}` : `PDF ${d.range.from}–${d.range.to}쪽`}{d.range.truncated ? ", 앞부분만" : ""}, 참고문헌 제외)</span>
      </h4>
      {d.one_line && <p className="lead">{d.one_line}</p>}
      <dl>
        <dt>목적</dt>
        <dd>
          <Item c={d.purpose} mode={m} />
        </dd>
        {d.questions.length > 0 && (
          <>
            <dt>연구 문제</dt>
            <dd>
              <ol>
                {d.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </dd>
          </>
        )}
        <dt>대상</dt>
        <dd>
          <Item c={d.participants} mode={m} />
        </dd>
        <dt>설계</dt>
        <dd>
          {d.design.type && <span className="b">{d.design.type}</span>} <Item c={d.design} mode={m} />
        </dd>
        <dt>분석</dt>
        <dd>
          <Item c={d.analysis} mode={m} />
        </dd>
        {d.implications && (
          <>
            <dt>시사점</dt>
            <dd>{d.implications}</dd>
          </>
        )}
      </dl>
      {d.quotes.length > 0 && (
        <>
          <h4>인용할 만한 문장 <span className="meta">(원문에서 글자 그대로 확인함)</span></h4>
          <ul className="quotes">
            {d.quotes.map((q, i) => (
              <li key={i}>
                <q>{q.text}</q> <Pg pages={q.pages} mode={m} />
                <button className="linkbtn" onClick={() => copyText(`“${q.text}”${cite(q.pages)}`)}>
                  직접 인용 복사 {cite(q.pages)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {m === "pdf" && <p className="hint">학술지 쪽 번호를 찾지 못해 PDF 쪽 번호로 표시했습니다. 인용할 때는 원문 쪽 번호를 확인하세요.</p>}
      <p className="hint">AI가 본문을 읽고 정리한 것입니다. 숫자는 표시된 쪽에서 원문을 확인하세요.</p>
    </div>
  );
}

/** 상세 보기 표를 한글·엑셀에 붙여 넣을 수 있게 */
export function detailTsv(rows: TableRow[]): string {
  const esc = (s: string) => s.replace(/[\t\n\r]+/g, " ").trim();
  const items = (xs: Cited[], mode: PaperDetails["pageMode"]) => xs.map((x) => `${x.text} (${pagesLabel(x.pages, mode)})`.replace(" ()", "")).join(" / ");
  const head = ["논문", "연도", "대상", "인원", "연구 방법", "설계", "도구(신뢰도)", "독립 변인", "종속 변인", "주요 결과", "한계", "후속 연구 제언"];
  const lines = rows.map((r) => {
    const d = r.pdf?.details;
    const who = `${r.paper.authors[0] ?? ""}${r.paper.authors.length > 1 ? " 외" : ""}`;
    if (!d) return [r.paper.title, String(r.paper.year ?? ""), r.summary?.participants ?? "", "", r.summary?.study_type ?? "", r.summary?.design ?? "", "", "", "", r.summary?.findings ?? "", "", ""].map(esc).join("\t");
    return [
      `${who}, ${r.paper.title}`,
      String(r.paper.year ?? ""),
      d.participants.text,
      d.participants.n != null ? String(d.participants.n) : "",
      d.design.type ?? "",
      d.design.text,
      d.instruments.map((x) => `${x.name}${x.reliability ? ` (${x.reliability})` : ""}`).join(" / "),
      d.variables.independent.join(", "),
      d.variables.dependent.join(", "),
      d.findings.map((f) => `${f.text}${f.stats ? ` [${f.stats}]` : ""} (${pagesLabel(f.pages, d.pageMode)})`.replace(" ()", "")).join(" / "),
      items(d.limitations, d.pageMode),
      items(d.future, d.pageMode),
    ]
      .map(esc)
      .join("\t");
  });
  return [head.join("\t"), ...lines].join("\n");
}
