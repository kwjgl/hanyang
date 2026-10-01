import { body, HttpError, json, must, route, type RouteCtx } from "@/lib/server/api";

type Role = "editor" | "viewer";
const role = (r: string | undefined): Role => (r === "viewer" ? "viewer" : "editor");

/**
 * 이메일로 초대. 이미 가입한 사람이면 바로 멤버가 되고,
 * 아직 가입하지 않았으면 초대를 남겨 두었다가 그 이메일로 가입하는 순간 멤버가 된다.
 */
export const POST = route<RouteCtx<{ id: string }>>(async ({ req, supabase, userId, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ email: string; role?: string }>(req);
  const email = b.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new HttpError(400, "이메일을 확인해 주세요");
  const { data: profile } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (profile) {
    must(await supabase.from("project_members").insert({ project_id: id, user_id: profile.id, role: role(b.role) }), "멤버");
    return json({ status: "added" });
  }
  must(await supabase.from("project_invites").upsert({ project_id: id, email, role: role(b.role), invited_by: userId }, { onConflict: "project_id,email" }), "초대");
  return json({ status: "invited" });
});

export const PATCH = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const b = await body<{ userId: string; role: string }>(req);
  must(await supabase.from("project_members").update({ role: role(b.role) }).eq("project_id", id).eq("user_id", b.userId), "멤버");
  return json({ ok: true });
});

/** 멤버 내보내기·나가기 또는 대기 중인 초대 취소 */
export const DELETE = route<RouteCtx<{ id: string }>>(async ({ req, supabase, ctx }) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const uid = url.searchParams.get("userId");
  const email = url.searchParams.get("email");
  if (uid) must(await supabase.from("project_members").delete().eq("project_id", id).eq("user_id", uid), "멤버");
  else if (email) must(await supabase.from("project_invites").delete().eq("project_id", id).eq("email", email), "초대");
  else throw new HttpError(400, "누구를 뺄지 알려 주세요");
  return json({ ok: true });
});
