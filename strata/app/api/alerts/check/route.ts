// 저장한 검색을 다시 돌리므로 Vercel 기본 제한(10초)보다 길게 둔다
export const maxDuration = 60;

import { checkAlerts } from "@/lib/server/alerts";
import { body, json, route } from "@/lib/server/api";

/**
 * 새 논문 알림 확인. 앱을 열 때 사이드바가 조용히 부르며, 일주일이 지난 저장 검색만 최대 2개 확인한다.
 * searchId를 주면 그 검색을 바로 확인한다 (알림 화면의 "지금 확인").
 */
export const POST = route(async ({ req, supabase, userId }) => {
  const { searchId } = await body<{ searchId?: string }>(req).catch(() => ({ searchId: undefined }));
  return json(await checkAlerts(supabase, userId, searchId ? { searchId, limit: 1 } : { limit: 2 }));
});
