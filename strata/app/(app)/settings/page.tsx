import { SettingsView } from "@/app/components/SettingsView";
import { parsePublic } from "@/lib/llm/providers";
import { monthUsage } from "@/lib/server/ai";
import { listFields } from "@/lib/server/papers";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Settings() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;
  const [{ data: profile }, { data: s }, usage, fields, { data: pf }, { data: pp }] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", uid).maybeSingle(),
    supabase.from("user_settings").select("api_key_last4").eq("user_id", uid).maybeSingle(),
    monthUsage(supabase, uid),
    listFields(supabase),
    supabase.from("paper_fields").select("field_id"),
    supabase.from("project_papers").select("paper_id, paper:papers(summaries(paper_id))").limit(5000),
  ]);
  const counts: Record<string, number> = {};
  for (const r of pf ?? []) counts[r.field_id] = (counts[r.field_id] ?? 0) + 1;
  // 다시 분류할 대상: 내가 볼 수 있는 프로젝트의 요약된 논문
  const summarized = [...new Set((pp ?? []).filter((r) => (r.paper as unknown as { summaries: unknown } | null)?.summaries).map((r) => r.paper_id))];
  return (
    <SettingsView
      name={profile?.display_name ?? ""}
      email={profile?.email ?? user!.email ?? ""}
      ai={parsePublic(s?.api_key_last4 ?? null)}
      usage={usage}
      fields={fields}
      fieldCounts={counts}
      paperIds={summarized}
    />
  );
}
