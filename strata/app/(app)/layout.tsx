import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import { loadShell } from "@/lib/server/load";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const shell = await loadShell(supabase, user.id);
  return (
    <div className="shell">
      <Suspense>
        <Sidebar data={shell} />
      </Suspense>
      <main className="main">
        {children}
        <p className="kci-note" style={{ marginTop: 40 }}>
          논문 정보: OpenAlex · Semantic Scholar · ERIC · Crossref. 요약은 AI가 초록만 근거로 만든 것이며 원문 초록을 함께 보관합니다.
        </p>
      </main>
    </div>
  );
}
