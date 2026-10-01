"use client";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import type { Placement } from "@/lib/server/membership";
import type { PaperRow } from "@/lib/server/papers";
import { hasHangul } from "@/lib/text";
import type { Candidate, Scope, SourceId, SummaryData } from "@/lib/types";

export type Hit = Candidate & { placements?: Placement[] };

export interface SearchResult {
  searchId: string | null;
  createdAt: string;
  query: string;
  terms: string[];
  scope: Scope;
  results: Hit[];
  totalRaw: number;
  totalUnique: number;
  perSource?: Partial<Record<SourceId, number>>;
  /** 출처별로 검색어에 맞는 전체 건수 */
  available?: Partial<Record<SourceId, number>>;
  hasMore?: boolean;
  page?: number;
  warnings: string[];
  saved: boolean;
}

export interface TrayItem {
  key: string;
  candidate: Hit;
  state: "pending" | "running" | "done" | "noAbstract" | "error";
  paperId?: string;
  summary?: SummaryData | null;
  reused?: boolean;
  fieldIds?: string[];
  error?: string;
  subtopicId?: string | null;
  saved?: boolean;
}

export type Sort = "rel" | "imp" | "cite" | "new";
export const ALL_SOURCES: SourceId[] = ["openalex", "s2", "eric", "crossref"];

/** 프로젝트 화면의 검색·요약 상태. 탭을 오가도 유지되도록 화면 최상단에서 한 번만 만든다. */
export function useSearch(projectId: string, defaultQuery: string, initial?: SearchResult | null) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [chips, setChips] = useState<{ text: string; on: boolean }[]>(
    initial ? initial.terms.filter((t) => t !== initial.query).map((text) => ({ text, on: true })) : [],
  );
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [autoExpand, setAutoExpand] = useState(true);
  const [scope, setScope] = useState<Scope>("all");
  const [sources, setSources] = useState<SourceId[]>(ALL_SOURCES);
  const [phase, setPhase] = useState<"idle" | "expanding" | "searching" | "more">("idle");
  /** 검색어 확장을 못 했을 때 그 이유 (결과 위에 계속 보여준다) */
  const [expandError, setExpandError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(initial ?? null);
  const [related, setRelated] = useState<{ title: string; results: Hit[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tray, setTray] = useState<TrayItem[]>([]);
  const running = useRef(0);

  const runSearch = useCallback(
    async (opts: { expand?: boolean } = {}) => {
      const q = query.trim();
      if (!q) return toast("검색어를 입력해 주세요");
      setRelated(null);
      let terms = chips.filter((c) => c.on).map((c) => c.text);
      const shouldExpand = opts.expand ?? (autoExpand && expandedFor !== q);
      if (shouldExpand) {
        setPhase("expanding");
        try {
          const r = await api<{ terms: string[] }>("/api/expand", { body: { query: q, projectId } });
          setChips(r.terms.map((text) => ({ text, on: true })));
          setExpandedFor(q);
          setExpandError(null);
          terms = r.terms;
        } catch (e) {
          setExpandError(errMsg(e));
          setChips([]);
          setExpandedFor(q);
          terms = [];
        }
      }
      setPhase("searching");
      try {
        const r = await api<SearchResult>("/api/search", { body: { projectId, query: q, terms, sources, scope } });
        setResult(r);
        setSel(new Set());
        if (r.warnings.length) toast(`일부 출처를 건너뛰었습니다: ${r.warnings.join(" · ")}`);
      } catch (e) {
        toast(errMsg(e));
      } finally {
        setPhase("idle");
      }
    },
    [query, chips, autoExpand, expandedFor, projectId, sources, scope],
  );

  /** 각 출처의 다음 페이지를 가져와 지금 결과 뒤에 붙인다 */
  const loadMore = useCallback(async () => {
    if (!result) return;
    setPhase("more");
    try {
      const page = (result.page ?? 1) + 1;
      const r = await api<SearchResult>("/api/search", {
        body: { projectId, query: result.query, terms: result.terms, sources, scope: result.scope, page, searchId: result.searchId },
      });
      const have = new Set(result.results.map((x) => x.key));
      const fresh = r.results.filter((x) => !have.has(x.key));
      const available = { ...result.available };
      for (const [k, v] of Object.entries(r.available ?? {})) available[k as SourceId] = Math.max(available[k as SourceId] ?? 0, v ?? 0);
      setResult({
        ...result,
        results: [...result.results, ...fresh],
        totalRaw: result.totalRaw + r.totalRaw,
        totalUnique: result.results.length + fresh.length,
        available,
        page,
        hasMore: !!r.hasMore && fresh.length > 0,
      });
      toast(fresh.length ? `${fresh.length}건을 더 가져왔습니다` : "더 가져올 새 논문이 없습니다");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setPhase("idle");
    }
  }, [result, projectId, sources]);

  const openSearch = useCallback(async (id: string) => {
    try {
      const r = await api<SearchResult>(`/api/searches/${id}`);
      setResult(r);
      setQuery(r.query);
      setChips(r.terms.filter((t) => t !== r.query).map((text) => ({ text, on: true })));
      setExpandedFor(r.query);
      setScope(r.scope);
      setRelated(null);
      setSel(new Set());
    } catch (e) {
      toast(errMsg(e));
    }
  }, []);

  const toggleSaved = useCallback(async () => {
    if (!result?.searchId) return toast("보기 권한으로는 검색을 저장할 수 없습니다");
    const saved = !result.saved;
    try {
      await api(`/api/searches/${result.searchId}`, { method: "PATCH", body: { saved } });
      setResult({ ...result, saved });
      toast(saved ? "검색을 저장했습니다. 기간 제한 없이 남습니다" : "저장을 취소했습니다");
    } catch (e) {
      toast(errMsg(e));
    }
  }, [result]);

  const loadRelated = useCallback(async (kind: "citedBy" | "references" | "similar", c: { title: string; doi: string | null; ids: Candidate["ids"] }) => {
    const label = { citedBy: "을 인용한 논문", references: "의 참고문헌", similar: "과 비슷한 논문" }[kind];
    setRelated({ title: `“${c.title}”${label}`, results: [] });
    try {
      const r = await api<{ results: Hit[] }>("/api/related", { body: { kind, doi: c.doi, openalexId: c.ids.openalex ?? null } });
      setRelated({ title: `“${c.title}”${label}`, results: r.results });
      setSel(new Set());
    } catch (e) {
      setRelated(null);
      toast(errMsg(e));
    }
  }, []);

  // 요약 대기열. 상태 갱신 함수 안에서 API를 부르지 않도록 ref에 최신 목록을 함께 둔다.
  const trayRef = useRef<TrayItem[]>([]);
  const update = useCallback((fn: (xs: TrayItem[]) => TrayItem[]) => {
    trayRef.current = fn(trayRef.current);
    setTray(trayRef.current);
  }, []);

  /** 대기 중인 요약을 두 개씩 처리한다 */
  const pump = useCallback(() => {
    while (running.current < 2) {
      const t = trayRef.current.find((x) => x.state === "pending");
      if (!t) break;
      running.current++;
      update((xs) => xs.map((x) => (x.key === t.key ? { ...x, state: "running" } : x)));
      api<{ paperId: string; paper: PaperRow; summary: SummaryData | null; reused: boolean; noAbstract: boolean; fieldIds: string[] }>("/api/summarize", {
        body: { candidate: t.candidate },
      })
        .then((r) =>
          update((xs) =>
            xs.map((x) =>
              x.key === t.key
                ? { ...x, state: r.noAbstract ? "noAbstract" : "done", paperId: r.paperId, summary: r.summary, reused: r.reused, fieldIds: r.fieldIds }
                : x,
            ),
          ),
        )
        .catch((e) => update((xs) => xs.map((x) => (x.key === t.key ? { ...x, state: "error", error: errMsg(e) } : x))))
        .finally(() => {
          running.current--;
          pump();
        });
    }
  }, [update]);

  const summarize = useCallback(
    (items: Hit[], subtopicId: string | null) => {
      const have = new Set(trayRef.current.map((t) => t.key));
      const add = items.filter((c) => !have.has(c.key)).map<TrayItem>((c) => ({ key: c.key, candidate: c, state: "pending", subtopicId }));
      update((cur) => [...add, ...cur]);
      setSel(new Set());
      pump();
    },
    [pump, update],
  );

  const retry = (key: string) => {
    update((xs) => xs.map((x) => (x.key === key ? { ...x, state: "pending", error: undefined } : x)));
    pump();
  };

  const setItem = (key: string, patch: Partial<TrayItem>) => update((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeItem = (key: string) => update((xs) => xs.filter((x) => x.key !== key));

  const save = useCallback(
    async (item: TrayItem, projectName: string) => {
      if (!item.paperId) return;
      try {
        await api(`/api/projects/${projectId}/papers`, { body: { paperId: item.paperId, subtopicId: item.subtopicId ?? null } });
        setItem(item.key, { saved: true });
        const mark = (h: Hit): Hit =>
          h.key === item.key ? { ...h, placements: [...(h.placements ?? []), { projectId, projectName, subtopic: null, paperId: item.paperId! }] } : h;
        setResult((r) => (r ? { ...r, results: r.results.map(mark) } : r));
        setRelated((r) => (r ? { ...r, results: r.results.map(mark) } : r));
        router.refresh();
        return true;
      } catch (e) {
        toast(errMsg(e));
        return false;
      }
    },
    [projectId, router],
  );

  return {
    query, setQuery, chips, setChips, autoExpand, setAutoExpand, scope, setScope, sources, setSources,
    phase, expandError, result, related, setRelated, sel, setSel, tray, setItem, removeItem, retry,
    runSearch, loadMore, openSearch, toggleSaved, loadRelated, summarize, save,
    koreanQuery: hasHangul(query) ? query : (chips.find((c) => c.on && hasHangul(c.text))?.text ?? query),
  };
}

export type SearchState = ReturnType<typeof useSearch>;
