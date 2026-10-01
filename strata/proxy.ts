import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/allow";
import { env, isConfigured } from "@/lib/env";

const PUBLIC = ["/login", "/auth", "/setup", ...(process.env.STRATA_PREVIEW === "1" ? ["/preview"] : [])];

/** 모든 요청에서 로그인 세션을 갱신하고, 로그인하지 않았으면 로그인 화면으로 보낸다 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (process.env.STRATA_PREVIEW === "1" && path.startsWith("/preview")) return NextResponse.next();
  // Supabase의 Redirect URLs 설정이 빠지면 로그인 링크가 /?code=... 로 돌아온다. 받아서 로그인 처리로 넘긴다.
  const code = request.nextUrl.searchParams.get("code");
  if (code && path !== "/auth/callback") {
    const url = new URL("/auth/callback", request.url);
    url.searchParams.set("code", code);
    url.searchParams.set("next", path === "/login" ? "/" : path);
    return NextResponse.redirect(url);
  }
  if (!isConfigured()) {
    return path.startsWith("/setup") ? NextResponse.next() : NextResponse.redirect(new URL("/setup", request.url));
  }
  try {
    return await withSession(request, path);
  } catch (e) {
    // Supabase에 연결하지 못하면 페이지마다 서버 오류를 내지 않고 설정 점검 화면으로 보낸다
    console.error("proxy:", e);
    if (path.startsWith("/setup")) return NextResponse.next();
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Supabase에 연결하지 못했습니다" }, { status: 503 });
    return NextResponse.redirect(new URL("/setup", request.url));
  }
}

async function withSession(request: NextRequest, path: string) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 허용되지 않은 이메일이면 세션을 지우고 로그인 화면으로 돌려보낸다
  if (user && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    if (path.startsWith("/api/")) return NextResponse.json({ error: "이 계정은 사용할 수 없습니다" }, { status: 403 });
    const out = NextResponse.redirect(new URL("/login?error=email", request.url));
    response.cookies.getAll().forEach((c) => out.cookies.set(c));
    return out;
  }

  const isPublic = PUBLIC.some((p) => path.startsWith(p));
  if (!user && !isPublic) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    const url = new URL("/login", request.url);
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
