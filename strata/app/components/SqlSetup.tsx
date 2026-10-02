"use client";
import { copyText, toast } from "@/lib/client";

/** Supabase에 표를 한 번 만들어야 쓸 수 있는 기능의 안내 (SQL 복사 → SQL Editor에서 Run) */
export function SqlSetup({ what, sql }: { what: string; sql: string }) {
  return (
    <>
      <div className="warnbox" style={{ marginTop: 14 }}>
        <b>처음 한 번만 준비가 필요합니다.</b> {what}을 저장할 표를 Supabase에 만들어야 합니다 (관리자 한 명만 하면 됩니다).
      </div>
      <ol style={{ fontSize: 14, lineHeight: 1.8 }}>
        <li>
          아래 <b>SQL 복사</b>를 누릅니다.
        </li>
        <li>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
            Supabase
          </a>
          에서 Strata 프로젝트 → 왼쪽 메뉴 <b>SQL Editor</b>를 엽니다.
        </li>
        <li>
          빈 칸에 붙여 넣고 오른쪽 아래 <b>Run</b>을 누릅니다. “Success”가 나오면 끝입니다.
        </li>
        <li>이 화면을 새로 고칩니다.</li>
      </ol>
      <button className="btn primary" onClick={async () => toast((await copyText(sql)) ? "SQL을 복사했습니다" : "복사하지 못했습니다. 아래 글을 직접 선택해 복사해 주세요")}>
        SQL 복사
      </button>
      <pre className="cite" style={{ marginTop: 10, maxHeight: 280, overflow: "auto", fontSize: 12 }}>
        {sql}
      </pre>
    </>
  );
}
