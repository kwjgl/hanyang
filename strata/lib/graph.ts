import type { CitationLink } from "@/lib/citations";

export interface GNode {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  citations: number | null;
  /** 아직 보관하지 않은 핵심 문헌 후보 */
  cand: boolean;
  /** 연도 계보에서 놓일 줄 (소주제 이름) */
  lane: string;
  x: number;
  y: number;
}

export interface GEdge {
  /** 인용한 논문 */
  a: string;
  /** 인용된 논문 */
  b: string;
}

export const radiusOf = (citations: number | null) => 6 + Math.log10((citations ?? 0) + 1) * 3.2;

/** 첫 저자 성 + 연도 (한글 이름은 그대로) */
export function nodeLabel(n: Pick<GNode, "authors" | "year">) {
  const a = n.authors[0] ?? "";
  const last = /[가-힣]/.test(a) ? a.replace(/\s+/g, "") : (a.split(" ").pop() ?? a);
  return `${last || "저자 미상"} ${n.year ?? ""}`.trim();
}

/** 연결된 논문만 남긴다 (keepAll이면 연결 없는 논문도) */
export function visibleGraph(nodes: GNode[], links: CitationLink[], keepAll: boolean) {
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: GEdge[] = [];
  for (const l of links) {
    const k = `${l.from}|${l.to}`;
    if (!ids.has(l.from) || !ids.has(l.to) || seen.has(k)) continue;
    seen.add(k);
    edges.push({ a: l.from, b: l.to });
  }
  const linked = new Set(edges.flatMap((e) => [e.a, e.b]));
  return { nodes: keepAll ? nodes : nodes.filter((n) => linked.has(n.id)), edges };
}

/** 간단한 힘 배치: 노드끼리는 밀어내고, 연결은 당긴다. 같은 입력이면 늘 같은 결과. */
export function forceLayout(nodes: GNode[], edges: GEdge[], W: number, H: number) {
  const N = nodes.length;
  if (!N) return;
  nodes.forEach((n, i) => {
    const ang = (i / N) * Math.PI * 2;
    n.x = W / 2 + Math.cos(ang) * W * 0.3;
    n.y = H / 2 + Math.sin(ang) * H * 0.3;
  });
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const vx = new Float64Array(N);
  const vy = new Float64Array(N);
  const iters = N > 150 ? 220 : 400;
  const repel = N > 80 ? 14000 : 26000;
  const rest = N > 80 ? 120 : 170;
  for (let it = 0; it < iters; it++) {
    const k = 1 - it / iters;
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const A = nodes[i];
        const B = nodes[j];
        let dx = A.x - B.x;
        let dy = A.y - B.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f = repel / d2;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        vx[i] += dx * f;
        vy[i] += dy * f;
        vx[j] -= dx * f;
        vy[j] -= dy * f;
      }
    for (const e of edges) {
      const i = idx.get(e.a)!;
      const j = idx.get(e.b)!;
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = (d - rest) * 0.02;
      vx[i] += (dx / d) * f;
      vy[i] += (dy / d) * f;
      vx[j] -= (dx / d) * f;
      vy[j] -= (dy / d) * f;
    }
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      vx[i] += (W / 2 - n.x) * 0.002;
      vy[i] += (H / 2 - n.y) * 0.004;
      n.x = Math.max(40, Math.min(W - 150, n.x + vx[i] * 0.5 * k));
      n.y = Math.max(30, Math.min(H - 30, n.y + vy[i] * 0.5 * k));
      vx[i] *= 0.6;
      vy[i] *= 0.6;
    }
  }
}

export interface Lane {
  name: string;
  top: number;
  height: number;
}

/**
 * 연도 계보: 가로는 출판 연도, 세로 줄은 소주제.
 * 이름표는 점 위에 붙고, 한 줄 안에서 이름표가 겹치면 아래 칸으로 내린다.
 */
export function timelineLayout(nodes: GNode[], laneOrder: string[], W: number, opts = { left: 170, right: 64, top: 30, slot: 36, labelW: 88 }) {
  const years = nodes.map((n) => n.year).filter((y): y is number => !!y);
  const now = new Date().getFullYear();
  const lo = years.length ? Math.min(...years) : now - 10;
  const hi = years.length ? Math.max(...years) : now;
  const step = hi - lo > 40 ? 10 : hi - lo > 12 ? 5 : 1;
  const x0 = Math.floor(lo / step) * step;
  const x1 = Math.max(x0 + step, Math.ceil((hi + 1) / step) * step);
  const sx = (y: number) => opts.left + ((y - x0) / (x1 - x0)) * (W - opts.left - opts.right);

  const used = laneOrder.filter((l) => nodes.some((n) => n.lane === l));
  const lanes: Lane[] = [];
  let top = opts.top;
  for (const name of used) {
    const inLane = nodes.filter((n) => n.lane === name).sort((a, b) => (a.year ?? x0) - (b.year ?? x0) || a.id.localeCompare(b.id));
    const slotEnd: number[] = [];
    const slotOf = new Map<string, number>();
    for (const n of inLane) {
      n.x = sx(n.year ?? x0);
      let s = slotEnd.findIndex((end) => n.x - end > opts.labelW);
      if (s < 0) s = slotEnd.push(-Infinity) - 1;
      slotEnd[s] = n.x;
      slotOf.set(n.id, s);
    }
    const height = Math.max(1, slotEnd.length) * opts.slot + 22;
    for (const n of inLane) n.y = top + 32 + slotOf.get(n.id)! * opts.slot;
    lanes.push({ name, top, height });
    top += height;
  }
  const ticks: { x: number; label: string }[] = [];
  for (let y = x0; y <= x1; y += step) ticks.push({ x: sx(y), label: String(y) });
  return { lanes, ticks, height: top + 30 };
}
