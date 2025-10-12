// next.config.ts
import type { NextConfig } from 'next'

const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://127.0.0.1:8000'

function normalizeBase(u: string) {
  return u.trim().replace(/\/+$/, '')
}
const base = normalizeBase(backendBase)

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // ✅ /api/* → backend の「そのままパス」に転送（/api を付けない）
    return [{ source: '/api/:path*', destination: `${base}/:path*` }]
  },
}

export default nextConfig
