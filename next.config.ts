// next.config.ts
import type { NextConfig } from 'next'

const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://127.0.0.1:8000'

const nextConfig: NextConfig = {
  // Azure で Node 単体起動できるように
  output: 'standalone',

  // 本番で型/ESLintエラーで止めない（任意）
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // 任意：/api/* を常にバックエンドへプロキシ（環境変数があればそれを優先）
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backendBase}/api/:path*` },
    ]
  },
}

export default nextConfig
