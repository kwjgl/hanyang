export const maxDuration = 30;

import { HttpError, json, route } from "@/lib/server/api";
import { SourceError } from "@/lib/sources/http";
import { kciKey, searchKci } from "@/lib/sources/kci";

export interface KciTestRow {
  query: string;
  total: number | null;
  titles: { title: string; year: number | null; doi: string | null; abstract: boolean }[];
  error: string | null;
}

/**
 * KCI 연결 확인 (설정 화면). 같은 말을 띄어쓰기 그대로·띄어쓰기 없이 물어서,
 * 제목 일부만 맞아도 찾는지, 띄어쓰기를 따지는지 한눈에 보이게 한다.
 */
export const GET = route(async ({ req }) => {
  if (!kciKey()) return json({ ready: false, rows: [] });
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) throw new HttpError(400, "검색어를 넣어 주세요");
  const queries = [...new Set([q, q.replace(/\s+/g, "")])];
  const rows: KciTestRow[] = await Promise.all(
    queries.map(async (query) => {
      try {
        const r = await searchKci(query, { perPage: 10 });
        return { query, total: r.total, titles: r.items.map((c) => ({ title: c.title, year: c.year, doi: c.doi, abstract: !!c.abstract })), error: null };
      } catch (e) {
        return { query, total: null, titles: [], error: e instanceof SourceError ? e.message : "확인하지 못했습니다" };
      }
    }),
  );
  return json({ ready: true, rows });
});
