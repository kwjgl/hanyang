"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ShellData } from "@/lib/server/load";

type Sec = "mine" | "shared" | "lib" | "field";
const DEFAULT_OPEN: Record<Sec, boolean> = { mine: true, shared: true, lib: true, field: false };

export function Sidebar({ data }: { data: ShellData }) {
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(DEFAULT_OPEN);
  useEffect(() => {
    try {
      setOpen({ ...DEFAULT_OPEN, ...JSON.parse(localStorage.getItem("strata-sec") ?? "{}") });
    } catch {}
  }, []);
  const toggle = (k: Sec) => {
    const next = { ...open, [k]: !open[k] };
    setOpen(next);
    try {
      localStorage.setItem("strata-sec", JSON.stringify(next));
    } catch {}
  };
  const head = (k: Sec, label: string, count?: number) => (
    <button className="sec-h" onClick={() => toggle(k)} aria-expanded={open[k]}>
      <span className="chev">{open[k] ? "▾" : "▸"}</span>
      <span className="lbl">{label}</span>
      {count != null && <span className="c">{count}</span>}
    </button>
  );
  const mine = data.projects.filter((p) => !p.shared);
  const shared = data.projects.filter((p) => p.shared);
  const view = path === "/library" ? (sp.get("view") ?? "all") : null;
  const fieldSel = sp.get("f");

  const projItem = (p: ShellData["projects"][number]) => (
    <li key={p.id}>
      <Link href={`/p/${p.id}`} aria-current={path === `/p/${p.id}` ? "page" : undefined} className="navlink">
        <span>{p.name}</span>
        <span className="c">
          {p.members > 1 ? `${p.members}명 · ` : ""}
          {p.count}
        </span>
      </Link>
    </li>
  );
  const libItem = (k: string, label: string, n: number) => (
    <li key={k}>
      <Link href={`/library?view=${k}`} aria-current={view === k ? "page" : undefined} className="navlink">
        <span>{label}</span>
        <span className="c">{n}</span>
      </Link>
    </li>
  );

  return (
    <aside className="nav" aria-label="프로젝트와 서재">
      <div className="brand">Strata</div>
      <div>
        {head("mine", "내 프로젝트", mine.length)}
        <ul hidden={!open.mine}>
          {mine.map(projItem)}
          <li>
            <Link href="/p/new" className="navlink newp">
              + 새 프로젝트
            </Link>
          </li>
        </ul>
      </div>
      {shared.length > 0 && (
        <div>
          {head("shared", "공유받은 프로젝트", shared.length)}
          <ul hidden={!open.shared}>{shared.map(projItem)}</ul>
        </div>
      )}
      <div>
        {head("lib", "서재")}
        <ul hidden={!open.lib}>
          {libItem("all", "전체 서재", data.lib.all)}
          {libItem("todo", "읽을 것", data.lib.todo)}
          {libItem("recent", "최근 2주 보관", data.lib.recent)}
          {libItem("star", "별표", data.lib.star)}
        </ul>
      </div>
      <div className="sec-hide">
        {head("field", "분야", data.fields.length)}
        <ul hidden={!open.field}>
          {data.fields.map((f) => (
            <li key={f.id}>
              <Link href={`/library?view=field&f=${f.id}`} aria-current={view === "field" && fieldSel === f.id ? "page" : undefined} className="navlink">
                <span className="dotf" style={{ ["--c" as string]: `var(--fd-${f.color % 12})` }}>
                  {f.name}
                </span>
                <span className="c">{f.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Link className="acct" href="/settings" aria-current={path === "/settings" ? "page" : undefined}>
        <span className="av">{(data.me.name || "나").slice(0, 1)}</span>
        <span>
          {data.me.name}
          <small>이번 달 AI 사용 ${data.monthUsage.toFixed(2)}</small>
        </span>
      </Link>
    </aside>
  );
}
