"use client";
import { useEffect, useRef, useState } from "react";
import { downloadText, safeName, toast } from "@/lib/client";
import { bibtex, csv, type ExportPaper, markdown, ris } from "@/lib/export";

/** 비교표·서재의 "내보내기" 메뉴: BibTeX · RIS · 엑셀(CSV) · Markdown 파일로 내려받기 */
export function ExportMenu(props: { name: string; papers: ExportPaper[]; question?: string | null; groups?: { name: string; papers: ExportPaper[] }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const file = safeName(props.name);
  const save = (ext: string, text: string, mime: string) => {
    if (!props.papers.length) return toast("내보낼 논문이 없습니다");
    downloadText(`${file}.${ext}`, text, mime);
    toast(`${props.papers.length}편을 ${ext.toUpperCase()} 파일로 내려받았습니다`);
    setOpen(false);
  };
  const items: [string, string, () => void][] = [
    ["BibTeX (.bib)", "LaTeX · Overleaf · JabRef", () => save("bib", bibtex(props.papers), "application/x-bibtex")],
    ["RIS (.ris)", "EndNote · Zotero · Mendeley · RefWorks", () => save("ris", ris(props.papers), "application/x-research-info-systems")],
    ["엑셀 (.csv)", "요약까지 표로 · 엑셀·한셀에서 열기", () => save("csv", csv(props.papers), "text/csv")],
    [
      "Markdown (.md)",
      "요약·메모 정리 문서 · 노션·옵시디언",
      () => save("md", markdown({ title: props.name, question: props.question, groups: props.groups ?? [{ name: "논문", papers: props.papers }] }), "text/markdown"),
    ],
  ];
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        내보내기 ▾
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="meta" style={{ margin: "2px 8px 6px" }}>
            지금 보이는 {props.papers.length}편
          </p>
          {items.map(([label, hint, run]) => (
            <button key={label} role="menuitem" className="menu-item" onClick={run}>
              <b>{label}</b>
              <span>{hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
