import { notFound } from "next/navigation";
import { ProjectView } from "@/app/components/project/ProjectView";
import { loadProject } from "@/lib/server/load";
import { supabaseServer } from "@/lib/supabase/server";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const data = user ? await loadProject(supabase, user.id, id) : null;
  if (!data) notFound();
  return <ProjectView data={data} />;
}
