import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/env";

export default function Setup() {
  if (isConfigured()) redirect("/");
  return (
    <div className="login">
      <div className="box" style={{ width: "min(560px,100%)" }}>
        <h1>Strata 설정이 필요합니다</h1>
        <p>Supabase 연결 정보가 없습니다. 저장소의 <code>strata/README.md</code>에 있는 순서대로 진행해 주세요.</p>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          <li>Supabase 프로젝트를 만들고 <code>supabase/migrations</code>의 SQL을 실행합니다.</li>
          <li>
            <code>.env.example</code>을 <code>.env.local</code>로 복사해 <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code>API_KEY_ENCRYPTION_SECRET</code>을 채웁니다.
          </li>
          <li>서버를 다시 시작합니다.</li>
        </ol>
      </div>
    </div>
  );
}
