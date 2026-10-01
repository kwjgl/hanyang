import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next가 AGENTS.md·CLAUDE.md를 만들지 않게 한다
  agentRules: false,
};

export default nextConfig;
