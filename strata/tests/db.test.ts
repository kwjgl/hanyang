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
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'a@lab.kr', '{"full_name":"김에이"}'), ('${B}', 'b@lab.kr', '{}');
  `);
}, 60_000);

describe("schema", () => {
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
});
