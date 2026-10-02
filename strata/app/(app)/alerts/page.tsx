import { AlertsView } from "@/app/components/AlertsView";
import { loadAlerts } from "@/lib/server/alerts";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Alerts() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const data = await loadAlerts(supabase, user!.id);
  return <AlertsView {...data} />;
}
