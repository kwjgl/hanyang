"use client";

/** 앱 API 호출. 실패하면 서버가 준 문장을 그대로 담아 던진다. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `요청 실패 (${res.status})`);
  return data as T;
}

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("strata-toast", { detail: message }));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast("복사했습니다");
    return true;
  } catch {
    toast("복사가 막혀 있습니다. 아래 텍스트를 선택해 복사하세요");
    return false;
  }
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "처리하지 못했습니다");
