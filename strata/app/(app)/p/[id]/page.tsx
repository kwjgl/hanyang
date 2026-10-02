import { notFound } from "next/navigation";
import { type AlertOpen, ProjectView } from "@/app/components/project/ProjectView";
import { loadProject } from "@/lib/server/load";
import { annotate } from "@/lib/server/membership";
import { supabaseServer } from "@/lib/supabase/server";
import type { Candidate } from "@/lib/types";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ alerts?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const data = user ? await loadProject(supabase, user.id, id) : null;
  if (!data) notFound();

  // 새 논문 알림에서 들어왔으면 그 검색의 새 논문을 검색 결과 자리에 보여 준다
  let alert: AlertOpen | null = null;
  if (sp.alerts) {
    const [{ data: search }, { data: hits }] = await Promise.all([
      supabase.from("searches").select("id, query").eq("id", sp.alerts).eq("project_id", id).maybeSingle(),
      supabase.from("alert_hits").select("paper").eq("search_id", sp.alerts).order("found_at", { ascending: false }).limit(200),
    ]);
    if (search && hits?.length) alert = { searchId: search.id, query: search.query, hits: await annotate(supabase, hits.map((h) => h.paper as Candidate)) };
  }
  return <ProjectView key={sp.alerts ?? "p"} data={data} alert={alert} />;
}
