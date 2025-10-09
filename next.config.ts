// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true }, // ← これだけでOK（ビルド時にESLint無視）
};

export default nextConfig;
