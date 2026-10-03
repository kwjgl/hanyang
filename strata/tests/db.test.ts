// Supabase 스키마와 행 단위 보안을 PGlite(브라우저용 Postgres)로 검증한다.
// auth 스키마는 Supabase와 같은 모양으로 최소한만 흉내 낸다.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";

let db: PGlite;

async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}
const q = (sql: string, params: unknown[] = []) => db.query<Record<string, unknown>>(sql, params);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated nologin;
    create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(readFileSync("supabase/migrations/20261001000000_init.sql", "utf8"));
  // 알림 마이그레이션은 두 번 실행해도 괜찮아야 한다 (사용자가 다시 붙여 넣을 수 있다)
  await db.exec(readFileSync("supabase/migrations/20261003000000_alerts.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261003000000_alerts.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261004000000_gapmaps.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261004000000_gapmaps.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261005000000_writing.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261005000000_writing.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261006000000_fulltext.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261006000000_fulltext.sql", "utf8"));
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'a@lab.kr', '{"full_name":"김에이"}'), ('${B}', 'b@lab.kr', '{}');
  `);
}, 60_000);

describe("schema", () => {
  it("shows the same full-text SQL in the app as the migration file", async () => {
    const { FULLTEXT_SQL } = await import("@/lib/fulltext-sql");
    expect(FULLTEXT_SQL).toBe(readFileSync("supabase/migrations/20261006000000_fulltext.sql", "utf8"));
  });

  it("shows the same writing SQL in the app as the migration file", async () => {
    const { WRITING_SQL } = await import("@/lib/writing-sql");
    expect(WRITING_SQL).toBe(readFileSync("supabase/migrations/20261005000000_writing.sql", "utf8"));
  });

  it("shows the same gap-map SQL in the app as the migration file", async () => {
    const { GAPMAPS_SQL } = await import("@/lib/gapmap-sql");
    expect(GAPMAPS_SQL).toBe(readFileSync("supabase/migrations/20261004000000_gapmaps.sql", "utf8"));
  });

  it("shows the same alerts SQL in the app as the migration file", async () => {
    const { ALERTS_SQL } = await import("@/lib/alerts-sql");
    expect(ALERTS_SQL).toBe(readFileSync("supabase/migrations/20261003000000_alerts.sql", "utf8"));
  });

  it("seeds the seven default fields", async () => {
    const r = await q("select name from public.fields order by position");
    expect(r.rows.map((x) => x.name)).toEqual(["교육학", "교육공학", "학습과학", "인지심리", "국어교육", "교육평가", "디지털 평가문항"]);
  });

  it("creates profiles on signup", async () => {
    const r = await q("select display_name from public.profiles order by email");
    expect(r.rows.map((x) => x.display_name)).toEqual(["김에이", "b"]);
  });
});

describe("row level security", () => {
  let project: string;

  it("lets a user create a project and become its owner", async () => {
    project = await as(A, async () => {
      const r = await q("insert into public.projects (name) values ('학위논문') returning id");
      return r.rows[0].id as string;
    });
    const m = await q("select user_id, role from public.project_members where project_id = $1", [project]);
    expect(m.rows).toEqual([{ user_id: A, role: "owner" }]);
  });

  it("hides the project from non-members", async () => {
    const r = await as(B, () => q("select id from public.projects"));
    expect(r.rows).toHaveLength(0);
  });

  it("does not let non-owners add members", async () => {
    await expect(
      as(B, () => q("insert into public.project_members (project_id, user_id, role) values ($1, $2, 'editor')", [project, B])),
    ).rejects.toThrow();
  });

  it("lets the owner invite an existing user directly", async () => {
    await as(A, () => q("insert into public.project_members (project_id, user_id, role) values ($1, $2, 'viewer')", [project, B]));
    const r = await as(B, () => q("select name from public.projects"));
    expect(r.rows).toEqual([{ name: "학위논문" }]);
  });

  it("blocks viewers from adding papers but lets them write notes", async () => {
    const paper = (await q("insert into public.papers (title) values ('A paper') returning id")).rows[0].id;
    await expect(
      as(B, () => q("insert into public.project_papers (project_id, paper_id) values ($1, $2)", [project, paper])),
    ).rejects.toThrow();
    await as(A, () => q("insert into public.project_papers (project_id, paper_id, added_by) values ($1, $2, $3)", [project, paper, A]));
    await as(B, () => q("insert into public.paper_notes (project_id, paper_id, body, visibility) values ($1, $2, '공동 메모', 'shared')", [project, paper]));
    await as(B, () => q("insert into public.paper_notes (project_id, paper_id, body, visibility) values ($1, $2, '나만', 'private')", [project, paper]));
    const seenByA = await as(A, () => q("select body from public.paper_notes order by body"));
    expect(seenByA.rows.map((x) => x.body)).toEqual(["공동 메모"]);
  });

  it("accepts pending invites when the invited person signs up", async () => {
    await as(A, () => q("insert into public.project_invites (project_id, email, role) values ($1, 'C@lab.kr', 'editor')", [project]));
    await q(`insert into auth.users (id, email) values ('${C}', 'c@lab.kr')`);
    const r = await q("select role from public.project_members where project_id = $1 and user_id = $2", [project, C]);
    expect(r.rows).toEqual([{ role: "editor" }]);
    const left = await q("select count(*)::int as n from public.project_invites");
    expect(left.rows[0].n).toBe(0);
  });

  it("never lets anyone grant or take the owner role", async () => {
    await expect(
      as(A, () => q("update public.project_members set role = 'owner' where project_id = $1 and user_id = $2", [project, C])),
    ).rejects.toThrow();
    const r = await as(C, () => q("delete from public.project_members where project_id = $1 and user_id = $2 returning user_id", [project, A]));
    expect(r.rows).toHaveLength(0);
  });

  it("keeps settings and usage private and sums this month's usage", async () => {
    await as(A, () => q("insert into public.user_settings (user_id, api_key_enc, api_key_last4) values ($1, 'enc', 'abcd')", [A]));
    await as(A, () => q("insert into public.usage_events (kind, model, cost_usd) values ('summary', 'm', 0.011), ('expand', 'm', 0.004)"));
    expect((await as(B, () => q("select * from public.user_settings"))).rows).toHaveLength(0);
    expect((await as(B, () => q("select * from public.usage_events"))).rows).toHaveLength(0);
    const sum = await as(A, () => q("select public.my_month_usage()::float as v"));
    expect(sum.rows[0].v).toBeCloseTo(0.015);
  });

  it("only shows searches from the last 30 days unless saved", async () => {
    await as(A, async () => {
      await q("insert into public.searches (project_id, query) values ($1, 'new')", [project]);
      await q("insert into public.searches (project_id, query, created_at) values ($1, 'old', now() - interval '40 days')", [project]);
      await q("insert into public.searches (project_id, query, saved, created_at) values ($1, 'kept', true, now() - interval '40 days')", [project]);
    });
    const r = await as(B, () => q("select query from public.searches order by query"));
    expect(r.rows.map((x) => x.query)).toEqual(["kept", "new"]);
  });
  it("shares new-paper alerts with members, lets only editors add them, and keeps read marks private", async () => {
    const search = (await as(A, () => q("select id from public.searches where query = 'kept'"))).rows[0].id;
    await as(C, () => q("insert into public.alert_hits (search_id, project_id, paper_key, paper) values ($1, $2, 'doi:10.1/new', '{\"title\":\"New\"}')", [search, project]));
    await expect(
      as(B, () => q("insert into public.alert_hits (search_id, project_id, paper_key, paper) values ($1, $2, 'doi:10.1/x', '{}')", [search, project])),
    ).rejects.toThrow();
    expect((await as(B, () => q("select paper_key from public.alert_hits"))).rows).toEqual([{ paper_key: "doi:10.1/new" }]);
    await as(B, () => q("insert into public.alert_reads (search_id) values ($1)", [search]));
    expect((await as(A, () => q("select * from public.alert_reads"))).rows).toHaveLength(0);
    expect((await as(B, () => q("select * from public.alert_reads"))).rows).toHaveLength(1);
    // 편집 권한이 있어야 확인 시각을 남길 수 있다
    const upd = await as(B, () => q("update public.searches set checked_at = now() where id = $1 returning id", [search]));
    expect(upd.rows).toHaveLength(0);
  });
  it("lets members read gap maps but only editors write them", async () => {
    const id = (await as(C, () => q("insert into public.gap_maps (project_id, items) values ($1, '[]') returning id", [project]))).rows[0].id;
    expect((await as(B, () => q("select id from public.gap_maps"))).rows).toHaveLength(1);
    await expect(as(B, () => q("insert into public.gap_maps (project_id) values ($1)", [project]))).rejects.toThrow();
    const upd = await as(B, () => q("update public.gap_maps set saved = true where id = $1 returning id", [id]));
    expect(upd.rows).toHaveLength(0);
    await as(A, () => q("update public.gap_maps set saved = true, label = '10월 저장본' where id = $1", [id]));
    expect((await as(C, () => q("select saved from public.gap_maps where id = $1", [id]))).rows[0].saved).toBe(true);
  });
  it("shares drafts and consultations with members, lets only editors write", async () => {
    const d = (await as(C, () => q("insert into public.drafts (project_id, body) values ($1, '첫 문단') returning id", [project]))).rows[0].id;
    expect((await as(B, () => q("select body from public.drafts where id = $1", [d]))).rows[0].body).toBe("첫 문단");
    await expect(as(B, () => q("insert into public.drafts (project_id) values ($1)", [project]))).rejects.toThrow();
    expect((await as(B, () => q("update public.drafts set body = 'x' where id = $1 returning id", [d]))).rows).toHaveLength(0);
    await as(A, () => q("insert into public.consults (project_id, messages) values ($1, '[]')", [project]));
    expect((await as(B, () => q("select id from public.consults"))).rows).toHaveLength(1);
  });
  it("shows PDF text only to members of a project holding the paper, and lets only editors write it", async () => {
    const D = "00000000-0000-0000-0000-00000000000d";
    await q(`insert into auth.users (id, email) values ('${D}', 'd@lab.kr')`);
    const paper = (await q("select id from public.papers where title = 'A paper'")).rows[0].id;
    const other = (await q("insert into public.papers (title) values ('Not in any project') returning id")).rows[0].id;
    await as(C, () => q("insert into public.paper_fulltexts (paper_id, pages, chars) values ($1, '[\"본문\"]', 2)", [paper]));
    // 어느 프로젝트에도 없는 논문에는 넣을 수 없다
    await expect(as(C, () => q("insert into public.paper_fulltexts (paper_id) values ($1)", [other]))).rejects.toThrow();
    expect((await as(B, () => q("select chars from public.paper_fulltexts"))).rows).toEqual([{ chars: 2 }]);
    expect((await as(D, () => q("select chars from public.paper_fulltexts"))).rows).toHaveLength(0);
    expect((await as(B, () => q("update public.paper_fulltexts set chars = 9 returning chars"))).rows).toHaveLength(0);
    await as(A, () => q("update public.paper_fulltexts set details = '{\"purpose\":\"x\"}' where paper_id = $1", [paper]));
    expect((await as(C, () => q("select details->>'purpose' as p from public.paper_fulltexts"))).rows[0].p).toBe("x");
  });
});
