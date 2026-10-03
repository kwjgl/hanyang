import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude/client";
import { supabaseServer, type Supa } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** 라우트 공통 처리: 로그인 확인, 오류를 사용자에게 보여줄 문장으로 바꾸기 */
export function route<Ctx = unknown>(
  fn: (args: { req: Request; supabase: Supa; userId: string; ctx: Ctx }) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const supabase = await supabaseServer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return json({ error: "로그인이 필요합니다" }, 401);
      return await fn({ req, supabase, userId: user.id, ctx });
    } catch (e) {
      if (e instanceof HttpError || e instanceof ClaudeError) return json({ error: e.message }, e.status);
      console.error(e);
      // 예상 못 한 오류도 원인 한 줄을 함께 보여 준다 (알려 주면 고치기 쉽다)
      const why = e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 160) : "";
      return json({ error: `처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.${why ? ` (원인: ${why})` : ""}` }, 500);
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "요청 내용을 읽지 못했습니다");
  }
}

/** Supabase 쿼리 결과에서 오류를 꺼내 던진다. RLS에 막힌 경우는 권한 문장으로 바꾼다. */
export function must<R extends { data: unknown; error: { message: string; code?: string } | null }>(res: R, what = "데이터"): NonNullable<R["data"]> {
  if (res.error) {
    if (res.error.code === "42501") throw new HttpError(403, "이 작업을 할 권한이 없습니다");
    if (res.error.code === "23505") throw new HttpError(409, `이미 있는 ${what}입니다`);
    throw new Error(`${what}: ${res.error.message}`);
  }
  return res.data as NonNullable<R["data"]>;
}

export type RouteCtx<P extends Record<string, string>> = { params: Promise<P> };
