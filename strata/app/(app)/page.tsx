import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("projects").select("id").order("created_at").limit(1);
  if (data?.[0]) redirect(`/p/${data[0].id}`);
  return (
    <div className="empty-state">
      <h2>첫 프로젝트를 만들어 보세요</h2>
      <p>학위논문, 학회 발표, 수업 준비처럼 연구 주제마다 프로젝트를 하나씩 만듭니다.</p>
      <p style={{ marginTop: 16 }}>
        <Link className="btn primary" href="/p/new">
          새 프로젝트 만들기
        </Link>
      </p>
      <p className="hint" style={{ marginTop: 24 }}>
        동료에게 초대받았다면, 초대받은 이메일로 로그인했는지 확인해 주세요.
      </p>
    </div>
  );
}
