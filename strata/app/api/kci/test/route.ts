export const maxDuration = 40;

import { HttpError, json, route } from "@/lib/server/api";
import { SourceError } from "@/lib/sources/http";
import { kciKey, kciPing, searchKci } from "@/lib/sources/kci";

export interface KciTestRow {
  query: string;
  total: number | null;
  titles: { title: string; year: number | null; doi: string | null; abstract: boolean }[];
  error: string | null;
  ms: number;
}

export interface KciPingResult {
  ready: boolean;
  /** Strata 서버가 도는 곳 (Vercel 지역 코드, 예: iad1 = 미국 동부, icn1 = 서울) */
  region: string | null;
  /** Supabase에 한 번 다녀오는 데 걸린 시간 */
  dbMs: number | null;
  ok: boolean;
  ms: number;
  error: string | null;
  total: number | null;
}

const LIMIT = 30_000;

async function timed<T>(fn: () => Promise<T>) {
  const t = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t, error: null as string | null };
  } catch (e) {
    return { value: null, ms: Date.now() - t, error: e instanceof SourceError ? e.message : "확인하지 못했습니다" };
  }
}

/**
 * KCI 연결 확인 (설정 화면). 서버 시간 제한에 걸리지 않게 한 번에 한 가지만 확인한다.
 * - ?step=ping : 검색어 없이 1건만 물어 연결 자체가 되는지, 서버 위치와 Supabase 왕복 시간
 * - ?q=…       : 그 말로 제목 검색
 */
export const GET = route(async ({ req, supabase }) => {
  const url = new URL(req.url);
  const region = process.env.VERCEL_REGION ?? null;
  if (url.searchParams.get("step") === "ping") {
    const db = await timed(async () => supabase.from("fields").select("id").limit(1));
    if (!kciKey()) return json({ ready: false, region, dbMs: db.ms, ok: false, ms: 0, error: null, total: null } satisfies KciPingResult);
    const r = await timed(() => kciPing(LIMIT));
    return json({ ready: true, region, dbMs: db.ms, ok: !r.error, ms: r.ms, error: r.error, total: r.value?.total ?? null } satisfies KciPingResult);
  }
  const q = url.searchParams.get("q")?.trim();
  if (!q) throw new HttpError(400, "검색어를 넣어 주세요");
  const r = await timed(() => searchKci(q, { perPage: 10, timeoutMs: LIMIT }));
  return json({
    query: q,
    total: r.value?.total ?? null,
    titles: (r.value?.items ?? []).map((c) => ({ title: c.title, year: c.year, doi: c.doi, abstract: !!c.abstract })),
    error: r.error,
    ms: r.ms,
  } satisfies KciTestRow);
});
