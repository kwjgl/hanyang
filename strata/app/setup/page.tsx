import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { checkConfig, env, isConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Supabase에 실제로 붙어서 테이블이 만들어졌는지 확인한다 */
async function checkDatabase(): Promise<{ ok: boolean; message: string }> {
  if (!isConfigured()) return { ok: false, message: "위의 주소·키 문제를 먼저 고쳐 주세요." };
  try {
    const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
    const { error } = await sb.from("fields").select("id").limit(1);
    if (!error) return { ok: true, message: "정상" };
    if (error.code === "PGRST205" || error.code === "42P01" || /could not find the table/i.test(error.message))
      return { ok: false, message: "테이블이 없습니다. Supabase SQL Editor에서 supabase/migrations의 SQL을 실행해 주세요." };
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(error.message))
      return { ok: false, message: "Supabase에 연결하지 못했습니다. 주소가 맞는지, Supabase 프로젝트가 일시 정지되지 않았는지 확인해 주세요." };
    if (/invalid api key|jwt|apikey/i.test(error.message)) return { ok: false, message: "키가 이 프로젝트의 키가 아닙니다. 같은 프로젝트의 키인지 확인해 주세요." };
    return { ok: false, message: `연결은 됐지만 오류가 납니다: ${error.message}` };
  } catch {
    return { ok: false, message: "Supabase에 연결하지 못했습니다. 주소가 맞는지, Supabase 프로젝트가 일시 정지되지 않았는지 확인해 주세요." };
  }
}

export default async function Setup() {
  const checks = checkConfig();
  const db = await checkDatabase();
  const allOk = checks.every((c) => c.ok) && db.ok;
  const row = (label: string, ok: boolean, message: string, warn = false) => (
    <li key={label} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <span style={{ color: ok ? "var(--good)" : warn ? "var(--muted)" : "var(--warn)", fontWeight: 700 }}>{ok ? "✓" : "!"}</span>
      <span>
        <b style={{ fontSize: 13 }}>{label}</b>
        <br />
        <span className="meta">{message}</span>
      </span>
    </li>
  );
  return (
    <div className="login">
      <div className="box" style={{ width: "min(620px,100%)" }}>
        <h1>Strata 설정 점검</h1>
        <p>{allOk ? "모든 설정이 정상입니다." : "아래에서 ! 표시가 있는 항목을 고쳐 주세요."}</p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {checks.map((c) => row(c.label, c.ok, c.message, !c.blocking))}
          {row("Supabase 연결과 테이블", db.ok, db.message)}
        </ul>
        {allOk || isConfigured() ? (
          <Link className="btn primary" href="/login" style={{ textAlign: "center" }}>
            로그인 화면으로
          </Link>
        ) : null}
        <p style={{ fontSize: 12.5 }}>
          값을 고치는 곳: Vercel → 이 프로젝트 → <b>Settings → Environment Variables</b>. 고친 뒤에는 <b>Deployments</b> 탭에서 맨 위 배포의 <b>⋯ → Redeploy</b>를 눌러야 반영됩니다.
        </p>
      </div>
    </div>
  );
}
