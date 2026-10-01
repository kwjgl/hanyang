import { LibraryView } from "@/app/components/LibraryView";
import { loadLibrary } from "@/lib/server/load";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Library({ searchParams }: { searchParams: Promise<{ view?: string; f?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const data = await loadLibrary(supabase, user!.id);
  return <LibraryView {...data} view={sp.view ?? "all"} fieldId={sp.f ?? null} />;
}
