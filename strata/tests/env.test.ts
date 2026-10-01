import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (vars: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  return import("@/lib/env");
};

describe("Supabase config cleanup and checks", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
  });

  it("fixes common paste mistakes", async () => {
    const m = await load({
      NEXT_PUBLIC_SUPABASE_URL: ' NEXT_PUBLIC_SUPABASE_URL="https://abc.supabase.co/rest/v1/" ',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xyz",
    });
    expect(m.env.supabaseUrl).toBe("https://abc.supabase.co");
    expect(m.env.supabaseAnonKey).toBe("sb_publishable_xyz");
    expect(m.isConfigured()).toBe(true);
  });

  it("adds https:// to a bare project host", async () => {
    const m = await load({ NEXT_PUBLIC_SUPABASE_URL: "abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJabc" });
    expect(m.env.supabaseUrl).toBe("https://abc.supabase.co");
  });

  it("flags a dashboard URL, a secret key and a short encryption secret", async () => {
    const m = await load({
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.com/dashboard/project/abc",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_123",
      API_KEY_ENCRYPTION_SECRET: "short",
    });
    const c = Object.fromEntries(m.checkConfig().map((x) => [x.id, x]));
    expect(c.url.ok).toBe(false);
    expect(c.key.ok).toBe(false);
    expect(c.secret.ok).toBe(false);
    expect(m.isConfigured()).toBe(false);
  });

  it("does not block login when only the encryption secret is missing", async () => {
    const m = await load({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJabc" });
    expect(m.isConfigured()).toBe(true);
  });
});
