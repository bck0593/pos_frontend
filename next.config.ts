// next.config.ts
import type { NextConfig } from "next";

const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://app-002-gen10-step3-1-py-oshima29.azurewebsites.net"; // 既定（必要なら編集）

function normalize(url: string) {
  return (url || "").trim().replace(/\/+$/, "");
}

const nextConfig: NextConfig = {
  // Azure で Node 単体起動
  output: "standalone",

  // 本番で型/ESLintエラーで止めない
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // /api/* は常にバックエンドへ（ビルド時に routes-manifest.json に焼き込まれる）
  async rewrites() {
    const base = normalize(backendBase);
    return [
      // まず /api/* を優先
      { source: "/api/:path*", destination: `${base}/api/:path*` },
      // 一部バックエンドが /api 無しで公開しているケースにフォールバックしたいなら↓も追加
      // { source: "/api/:path*", destination: `${base}/:path*` },
    ];
  },
};

export default nextConfig;
