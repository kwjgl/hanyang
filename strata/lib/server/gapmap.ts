import { GapSchema, LEVELS, STUDY_TYPES } from "@/lib/claude/schemas";
import { GAP_SYSTEM, gapUser } from "@/lib/claude/prompts";
import { type CustomAxis, type GapConfig, type GapItem, type GapQueued, isKoreanPaper } from "@/lib/gapmap";
import type { Supa } from "@/lib/supabase/server";
import { titleKey } from "@/lib/text";
import type { Candidate, SummaryData } from "@/lib/types";
import { HttpError, must } from "./api";
import { runAi } from "./ai";
import { isMissingTable } from "./alerts";

/** 한 번에 AI에 보내는 논문 수 */
const BATCH = 20;

export interface GapMapRow {
  id: string;
  project_id: string;
  created_at: string;
  created_by: string;
  saved: boolean;
  label: string | null;
  config: GapConfig;
  items: GapItem[];
}

export type GapMapMeta = Pick<GapMapRow, "id" | "saved" | "label" | "created_at"> & { count: number; pending: number };

const meta = (m: GapMapRow): GapMapMeta => ({ id: m.id, saved: m.saved, label: m.label, created_at: m.created_at, count: m.items.length, pending: m.config.queue?.length ?? 0 });

/** 이 프로젝트의 지도 목록과, 고른 지도(없으면 가장 최근 것) */
export async function loadGapMaps(supabase: Supa, projectId: string, mapId?: string | null) {
  const { data, error } = await supabase.from("gap_maps").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30);
  if (isMissingTable(error) || error?.code === "PGRST205" || /gap_maps/.test(error?.message ?? "")) return { ready: false, maps: [] as GapMapMeta[], map: null };
  if (error) throw error;
  const rows = (data ?? []) as GapMapRow[];
  const map = (mapId ? rows.find((m) => m.id === mapId) : rows[0]) ?? null;
  return { ready: true, maps: rows.map(meta), map: map ? { ...map, config: { ...map.config, queue: undefined } } : null };
}

type PP = {
  subtopic: { name: string } | null;
  paper: { id: string; doi: string | null; title: string; year: number | null; abstract: string | null; url: string | null; summaries: { data: SummaryData } | { data: SummaryData }[] | null } | null;
};

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

/**
 * 새 지도를 만든다. 보관한 논문 + 최근 검색 상위 top편을 모으고,
 * 소주제·요약을 이미 아는 보관 논문은 바로 놓고 나머지는 AI 분류 대기열에 넣는다.
 */
export async function createGapMap(supabase: Supa, projectId: string, opts: { top: number; searchId?: string | null; custom?: CustomAxis | null }) {
  const [{ data: subs }, { data: pp }, prev] = await Promise.all([
    supabase.from("subtopics").select("name").eq("project_id", projectId).order("position"),
    supabase.from("project_papers").select("subtopic:subtopics(name), paper:papers(id, doi, title, year, abstract, url, summaries(data))").eq("project_id", projectId),
    supabase.from("gap_maps").select("config").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (isMissingTable(prev.error) || /gap_maps/.test(prev.error?.message ?? "")) throw new HttpError(409, "공백 지도 표가 아직 없습니다. 화면의 안내대로 SQL을 한 번 실행해 주세요.");
  const subtopics = (subs ?? []).map((s) => s.name as string);
  if (!subtopics.length) throw new HttpError(400, "소주제가 있어야 지도를 그릴 수 있습니다. 프로젝트 편집에서 소주제를 먼저 만들어 주세요.");
  const custom = opts.custom?.name && opts.custom.categories.length >= 2 ? opts.custom : null;

  type Search = { id: string; query: string; results: Candidate[] };
  const sq = supabase.from("searches").select("id, query, results").eq("project_id", projectId);
  const { data: sdata } = await (opts.searchId ? sq.eq("id", opts.searchId) : sq.order("created_at", { ascending: false }).limit(1)).maybeSingle();
  const search = (sdata as Search | null) ?? null;

  const items: GapItem[] = [];
  const queue: GapQueued[] = [];
  const seen = new Set<string>();
  const mark = (doi: string | null, title: string, year: number | null) => {
    const keys = [doi ? `doi:${doi}` : null, `t:${titleKey(title)}:${year ?? ""}`].filter((k): k is string => !!k);
    const dup = keys.some((k) => seen.has(k));
    keys.forEach((k) => seen.add(k));
    return dup;
  };

  for (const r of (pp ?? []) as unknown as PP[]) {
    const p = r.paper;
    if (!p || mark(p.doi, p.title, p.year)) continue;
    const s = one(p.summaries)?.data;
    const base = { key: `p:${p.id}`, title: p.title, year: p.year, url: p.url, ko: isKoreanPaper(p.title, p.abstract), saved: true };
    const known = { subtopic: r.subtopic?.name ?? null, levels: s?.levels, method: s?.study_type ?? null };
    if (known.subtopic && s && !custom) items.push({ ...base, subtopic: known.subtopic, levels: s.levels ?? [], method: s.study_type ?? null, custom: null });
    else queue.push({ ...base, abstract: p.abstract, known });
  }
  for (const c of (search?.results ?? []).slice(0, opts.top)) {
    if (mark(c.doi, c.title, c.year) || c.domain === "out") continue;
    const abstract = c.abstract ?? c.snippet ?? null;
    queue.push({ key: c.key, title: c.title, abstract, year: c.year, url: c.url, ko: isKoreanPaper(c.title, abstract), saved: false });
  }

  const config: GapConfig = {
    subtopics,
    custom,
    mine: (prev.data?.config as GapConfig | undefined)?.mine ?? null,
    source: { query: search?.query ?? null, searchId: search?.id ?? null, top: opts.top, savedCount: (pp ?? []).length },
    queue,
    total: items.length + queue.length,
  };
  // 저장하지 않은 예전 "지금 지도"는 지운다 (저장본은 남긴다)
  await supabase.from("gap_maps").delete().eq("project_id", projectId).eq("saved", false);
  const row = must(await supabase.from("gap_maps").insert({ project_id: projectId, config, items }).select("id").single(), "공백 지도");
  return { id: row.id as string, total: config.total!, done: items.length };
}

/** 대기열에서 BATCH편을 꺼내 AI로 분류하고 지도에 더한다 */
export async function classifyGapBatch(supabase: Supa, userId: string, mapId: string) {
  const map = must(await supabase.from("gap_maps").select("*").eq("id", mapId).single(), "공백 지도") as GapMapRow;
  const queue = map.config.queue ?? [];
  const total = map.config.total ?? map.items.length + queue.length;
  if (!queue.length) return { done: map.items.length, total, finished: true };

  const batch = queue.slice(0, BATCH);
  const ids = batch.map((_, i) => String(i + 1));
  const result = await runAi(supabase, userId, "gapmap", {
    system: GAP_SYSTEM,
    user: gapUser(
      map.config.subtopics,
      map.config.custom,
      batch.map((p, i) => ({ id: ids[i], title: p.title, year: p.year, abstract: p.abstract })),
    ),
    schema: GapSchema,
    maxTokens: 6000,
  });
  const byId = new Map(result.items.map((x) => [x.id.replace(/[[\]\s]/g, ""), x]));
  const subs = new Set(map.config.subtopics);
  const cats = new Set(map.config.custom?.categories ?? []);
  const placed: GapItem[] = batch.map((p, i) => {
    const r = byId.get(ids[i]);
    const subtopic = p.known?.subtopic ?? (r && subs.has(r.subtopic.trim()) ? r.subtopic.trim() : null);
    return {
      key: p.key,
      title: p.title,
      year: p.year,
      url: p.url,
      ko: p.ko,
      saved: p.saved,
      subtopic,
      levels: p.known?.levels?.length ? p.known.levels : (r?.levels ?? []).map((l) => l.trim()).filter((l) => (LEVELS as readonly string[]).includes(l)),
      method: p.known?.method ?? ((STUDY_TYPES as readonly string[]).includes(r?.method?.trim() ?? "") ? r!.method.trim() : null),
      custom: r && cats.has(r.custom.trim()) ? r.custom.trim() : null,
    };
  });
  const rest = queue.slice(BATCH);
  must(
    await supabase
      .from("gap_maps")
      .update({ items: [...map.items, ...placed], config: { ...map.config, queue: rest } })
      .eq("id", mapId),
    "공백 지도",
  );
  return { done: map.items.length + placed.length, total, finished: rest.length === 0 };
}
