import { json, route } from "@/lib/server/api";
import { SourceError } from "@/lib/sources/http";
import { scholarAccount, serpKey } from "@/lib/sources/scholar";

/** 구글 학술검색(SerpApi) 연결 상태와 이번 달 남은 횟수 (조회 자체는 횟수를 쓰지 않는다) */
export const GET = route(async () => {
  if (!serpKey()) return json({ ready: false });
  try {
    return json({ ready: true, ok: true, ...(await scholarAccount()) });
  } catch (e) {
    return json({ ready: true, ok: false, error: e instanceof SourceError ? e.message : "확인하지 못했습니다" });
  }
});
