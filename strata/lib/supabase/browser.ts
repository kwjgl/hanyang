"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export const supabaseBrowser = () => createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
