export const maxDuration = 60;

import { HttpError, json, route } from "@/lib/server/api";
import { SourceError } from "@/lib/sources/http";
import { kciKey, searchKci, kciPing } from "@/lib/sources/kci";

export interface KciTestRow {
  query: string;
  total: number | null;
  titles: { title: string; year: number | null; doi: string | null; abstract: boolean }[];
  error: string | null;
  ms: number;
}

export interface KciTestResult {
  ready: boolean;
  /** Strata 서버가 도는 곳 (Vercel 지역 코드, 예: iad1 = 미국 동부, icn1 = 서울) */
  region: string | null;
  /** Supabase에 한 번 다녀오는 데 걸린 시간 */
  dbMs: number | null;
  /** 검색어 없이 KCI에 1건만 물어본 결과 (연결 자체가 되는지) */
  ping: { ok: boolean; ms: number; error: string | null; total: number | null } | null;
  rows: KciTestRow[];
}

const timed = async <T,>(fn: () => Promise<T>) => {
  const t = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t, error: null as string | null };
  } catch (e) {
    return { value: null, ms: Date.now() - t, error: e instanceof SourceError ? e.message : "확인하지 못했습니다" };
  }
};

/**
 * KCI 연결 확인 (설정 화면).
 * - 검색어 없이 1건만 물어서 연결 자체가 되는지와 걸린 시간을 재고
 * - 같은 말을 띄어쓰기 그대로·없이 물어서 제목 검색이 어떻게 맞추는지 본다
 * 원인을 가리려고 평소(20초)보다 길게 기다린다.
 */
export const GET = route(async ({ req, supabase }) => {
  const region = process.env.VERCEL_REGION ?? null;
  if (!kciKey()) return json({ ready: false, region, dbMs: null, ping: null, rows: [] } satisfies KciTestResult);
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) throw new HttpError(400, "검색어를 넣어 주세요");

  const db = await timed(async () => supabase.from("fields").select("id").limit(1));
  const queries = [...new Set([q, q.replace(/\s+/g, "")])];
  const [ping, ...rows] = await Promise.all([
    timed(() => kciPing(45_000)),
    ...queries.map(async (query): Promise<KciTestRow> => {
      const r = await timed(() => searchKci(query, { perPage: 10, timeoutMs: 50_000 }));
      return {
        query,
        total: r.value?.total ?? null,
        titles: (r.value?.items ?? []).map((c) => ({ title: c.title, year: c.year, doi: c.doi, abstract: !!c.abstract })),
        error: r.error,
        ms: r.ms,
      };
    }),
  ]);
  return json({
    ready: true,
    region,
    dbMs: db.ms,
    ping: { ok: !ping.error, ms: ping.ms, error: ping.error, total: ping.value?.total ?? null },
    rows,
  } satisfies KciTestResult);
});
