"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg } from "@/lib/client";
import type { CitationsResponse } from "@/app/api/projects/[id]/citations/route";

export type Citations = { state: "idle" | "loading" | "done" | "error"; data: CitationsResponse | null; error: string | null; load: () => void };

/**
 * 보관한 논문의 인용 관계·핵심 문헌 후보. 대시보드·비교표·관계도를 처음 열 때 한 번 불러오고,
 * 보관한 논문이 바뀌면 다시 불러온다.
 */
export function useCitations(projectId: string, paperIds: string[], active: boolean): Citations {
  const router = useRouter();
  const key = [...paperIds].sort().join(",");
  const [state, setState] = useState<Citations["state"]>("idle");
  const [data, setData] = useState<CitationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    loadedKey.current = key;
    setState("loading");
    try {
      const r = await api<CitationsResponse>(`/api/projects/${projectId}/citations`);
      setData(r);
      setError(null);
      setState("done");
      // 피인용 수·영향력 지표를 새로 채웠으면 화면의 숫자도 새로 받는다
      if (r.updated > 0) router.refresh();
    } catch (e) {
      setError(errMsg(e));
      setState("error");
    }
  }, [projectId, key, router]);

  useEffect(() => {
    if (active && key && loadedKey.current !== key) load();
  }, [active, key, load]);

  return { state, data, error, load };
}
