const UA = "Strata/0.1 (research literature tool)";

export class SourceError extends Error {
  constructor(
    public source: string,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(source: string, url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) {
      const msg = res.status === 429 ? "요청이 너무 많아 잠시 막혔습니다" : `응답 오류 ${res.status}`;
      throw new SourceError(source, msg, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof SourceError) throw e;
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new SourceError(source, aborted ? "응답이 늦어 건너뛰었습니다" : "연결하지 못했습니다");
  } finally {
    clearTimeout(timer);
  }
}

/** 동시에 n개까지만 실행하고, 필요하면 호출 사이 간격을 둔다 */
export function limiter(n: number, gapMs = 0) {
  let active = 0;
  let last = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const run = queue.shift()!;
    const wait = Math.max(0, last + gapMs - Date.now());
    setTimeout(() => {
      last = Date.now();
      run();
    }, wait);
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() =>
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          }),
      );
      next();
    });
}
