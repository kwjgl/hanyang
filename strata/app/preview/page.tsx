import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import { ProjectView } from "@/app/components/project/ProjectView";
import { previewProject, previewResult, previewShell } from "./fixtures";

/**
 * Supabase 없이 화면만 확인하는 미리보기 (예시 데이터).
 * STRATA_PREVIEW=1 일 때만 열린다. 버튼을 눌러도 저장되지 않는다.
 */
export default function Preview() {
  if (process.env.STRATA_PREVIEW !== "1") notFound();
  return (
    <div className="shell">
      <Suspense>
        <Sidebar data={previewShell} />
      </Suspense>
      <main className="main">
        <p className="note" style={{ marginBottom: 12, display: "inline-block" }}>
          미리보기 · 예시 데이터 (저장되지 않음)
        </p>
        <ProjectView data={previewProject} initialResult={previewResult} />
      </main>
    </div>
  );
}
