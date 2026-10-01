import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/allow";
import { supabaseServer } from "@/lib/supabase/server";

/** Google 로그인·이메일 링크에서 돌아오는 곳. 세션을 만들고 받은 초대를 수락한다. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isAllowedEmail(user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=email", url.origin));
      }
      await supabase.rpc("accept_my_invites");
      return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
