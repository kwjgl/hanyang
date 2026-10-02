import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import { AlertsView } from "@/app/components/AlertsView";
import { ProjectView } from "@/app/components/project/ProjectView";
import { previewAlerts, previewProject, previewResult, previewShell } from "./fixtures";

/**
 * Supabase 없이 화면만 확인하는 미리보기 (예시 데이터).
 * STRATA_PREVIEW=1 일 때만 열린다. 버튼을 눌러도 저장되지 않는다.
 */
export default async function Preview({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.STRATA_PREVIEW !== "1") notFound();
  const { view } = await searchParams;
  return (
    <div className="shell">
      <Suspense>
        <Sidebar data={previewShell} />
      </Suspense>
      <main className="main">
        <p className="note" style={{ marginBottom: 12, display: "inline-block" }}>
          미리보기 · 예시 데이터 (저장되지 않음)
        </p>
        {view === "alerts" ? (
          <AlertsView ready searches={previewAlerts} />
        ) : view === "alerts-setup" ? (
          <AlertsView ready={false} searches={[]} />
        ) : (
          <ProjectView data={previewProject} initialResult={previewResult} />
        )}
      </main>
    </div>
  );
}
