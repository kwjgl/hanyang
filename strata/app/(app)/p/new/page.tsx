import { NewProjectForm } from "@/app/components/NewProjectForm";
import { listFields } from "@/lib/server/papers";
import { supabaseServer } from "@/lib/supabase/server";

export default async function NewProject() {
  const supabase = await supabaseServer();
  const fields = (await listFields(supabase)).filter((f) => !f.hidden);
  return <NewProjectForm fields={fields} />;
}
