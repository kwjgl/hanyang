"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ALERTS_SQL } from "@/lib/alerts-sql";
import { api, copyText, errMsg, toast } from "@/lib/client";
import type { AlertSearch } from "@/lib/server/alerts";
import { firstAuthor, ImpactBadges } from "./bits";

const CHECK_EVERY_DAYS = 7;

const when = (iso: string | null) => {
  if (!iso) return "아직 안 함";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? "오늘" : d === 1 ? "어제" : `${d}일 전`;
};

function nextCheck(s: AlertSearch) {
  const base = new Date(s.checkedAt ?? s.createdAt).getTime() + CHECK_EVERY_DAYS * 864e5;
  const d = Math.ceil((base - Date.now()) / 864e5);
  return d <= 0 ? "다음에 앱을 열 때" : `${d}일 뒤`;
}

export function AlertsView({ ready, searches }: { ready: boolean; searches: AlertSearch[] }) {
  if (!ready) return <SetupNotice />;
  return (
    <>
      <div className="phead">
        <h1>새 논문 알림</h1>
      </div>
      <p className="rq">
        프로젝트에서 <b>“이 검색 저장”</b>을 누른 검색을 일주일마다 다시 돌려서, 그 뒤에 새로 나온 논문(작년·올해 출판)만 모아 보여 줍니다. 확인은 누군가 앱을 열 때 저절로 합니다.
      </p>
      {searches.length === 0 ? (
        <div className="empty-state">
          <h2>저장한 검색이 없습니다</h2>
          <p>프로젝트에서 검색한 뒤 결과 위의 “이 검색 저장”을 누르면 여기에서 새 논문을 알려 드립니다.</p>
        </div>
      ) : (
        searches.map((s) => <AlertCard key={s.id} s={s} />)
      )}
    </>
  );
}

function AlertCard({ s }: { s: AlertSearch }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const fresh = s.hits.filter((h) => h.foundAt > (s.readAt ?? ""));
  const shown = open ? s.hits : fresh.length ? fresh : s.hits.slice(0, 5);

  const checkNow = async () => {
    setBusy(true);
    try {
      const r = await api<{ found: number }>("/api/alerts/check", { body: { searchId: s.id } });
      toast(r.found ? `새 논문 ${r.found}편을 찾았습니다` : "새로 나온 논문이 없습니다");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const markRead = async () => {
    try {
      await api("/api/alerts/read", { body: { searchId: s.id } });
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  return (
    <section className="share" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>“{s.query}”</h3>
          <div className="meta">
            <Link href={`/p/${s.projectId}`}>{s.projectName}</Link> · 마지막 확인 {when(s.checkedAt)} · 다음 확인 {nextCheck(s)}
          </div>
        </div>
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {fresh.length > 0 && <span className="newcnt alert-n">새 논문 {fresh.length}편</span>}
          {s.hits.length > 0 && (
            <Link className="btn sm" href={`/p/${s.projectId}?alerts=${s.id}`}>
              프로젝트에서 열어 요약·보관
            </Link>
          )}
          {fresh.length > 0 && (
            <button className="btn sm" onClick={markRead}>
              읽음으로 표시
            </button>
          )}
          {s.canEdit && (
            <button className="btn sm" onClick={checkNow} disabled={busy}>
              {busy ? "확인 중…" : "지금 확인"}
            </button>
          )}
        </span>
      </div>
      {s.hits.length === 0 ? (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          아직 새로 나온 논문이 없습니다.
        </p>
      ) : (
        <div className="list" style={{ marginTop: 8 }}>
          {shown.map((h) => {
            const c = h.paper;
            const isNew = h.foundAt > (s.readAt ?? "");
            return (
              <div className="lib-row" key={h.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">
                    {isNew && <span className="imp imp-new" style={{ marginRight: 6 }}>새</span>}
                    {c.url ? (
                      <a className="title-link" href={c.url} target="_blank" rel="noreferrer">
                        <span>{c.title}</span>
                      </a>
                    ) : (
                      c.title
                    )}
                  </div>
                  <div className="meta">
                    {firstAuthor(c.authors)} ({c.year ?? "연도 미상"}){c.venue ? ` · ${c.venue}` : ""} · {when(h.foundAt)} 찾음
                  </div>
                  <div className="badges">
                    <ImpactBadges c={c} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {s.hits.length > shown.length && (
        <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
          지난 알림까지 모두 보기 ({s.hits.length}편)
        </button>
      )}
    </section>
  );
}

function SetupNotice() {
  return (
    <>
      <div className="phead">
        <h1>새 논문 알림</h1>
      </div>
      <div className="warnbox" style={{ marginTop: 14 }}>
        <b>처음 한 번만 준비가 필요합니다.</b> 알림을 저장할 표를 Supabase에 만들어야 합니다 (관리자 한 명만 하면 됩니다).
      </div>
      <ol style={{ fontSize: 14, lineHeight: 1.8 }}>
        <li>아래 <b>SQL 복사</b>를 누릅니다.</li>
        <li>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
            Supabase
          </a>
          에서 Strata 프로젝트 → 왼쪽 메뉴 <b>SQL Editor</b>를 엽니다.
        </li>
        <li>빈 칸에 붙여 넣고 오른쪽 아래 <b>Run</b>을 누릅니다. “Success”가 나오면 끝입니다.</li>
        <li>이 화면을 새로 고칩니다.</li>
      </ol>
      <button className="btn primary" onClick={async () => toast((await copyText(ALERTS_SQL)) ? "SQL을 복사했습니다" : "복사하지 못했습니다. 아래 글을 직접 선택해 복사해 주세요")}>
        SQL 복사
      </button>
      <pre className="cite" style={{ marginTop: 10, maxHeight: 280, overflow: "auto", fontSize: 12 }}>
        {ALERTS_SQL}
      </pre>
    </>
  );
}
